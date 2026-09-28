import { randomUUID } from 'node:crypto'

import * as z from 'zod'

import { application } from '@application'
import type { UarDurableBinding } from '@shared/types/uarDurableAdministration'
import type { UarTeamBinding } from '@shared/types/uarTeams'

import { capabilityState, rawBinding, scopedRequest, workspace } from './UarDurableAdministrationAdapter'
import { starterBinding, starterPackage, starterTeamPackage } from './uarStarterDocuments'

const bindingPath = '/api/v1/collaboration/deployment-bindings'

const rawProviderCatalog = z.object({
  default_id: z.string().nullable().optional(),
  providers: z.array(
    z.object({
      id: z.string(),
      base_url: z.string(),
      enabled: z.boolean(),
      credential_configured: z.boolean(),
      default_model: z.string().nullable().optional(),
      models: z.array(z.object({ id: z.string(), enabled: z.boolean() }))
    })
  )
})

const rawCollaborationCapabilities = z.object({
  bindingOwnerId: z.string().min(1),
  instance: z.object({ id: z.string().min(1) })
})

const rawPackage = z.object({ identity: z.object({ id: z.string(), version: z.string(), digest: z.string() }) })
const rawPreflight = z.object({ activationSupported: z.boolean() })

async function configuredStarterModel(generation: number): Promise<{ providerId: string; modelId: string }> {
  const sidecar = application.get('UarSidecarService')
  const response = await sidecar.adminRequest('/api/uar/providers', {}, generation)
  if (!response.ok) throw new Error(`UAR provider catalog is unavailable (HTTP ${response.status})`)
  const catalog = rawProviderCatalog.parse(await response.json())
  const provider = catalog.providers.find((candidate) => candidate.id === catalog.default_id && candidate.enabled)
  const model = provider?.models.find((candidate) => candidate.id === provider.default_model && candidate.enabled)
  if (!provider || !model) {
    throw new Error(
      'Configure an enabled default provider and default model in UAR Settings before setting up a starter agent'
    )
  }
  if (!provider.base_url) {
    throw new Error('Configure a base URL for the default UAR provider before setting up a starter agent')
  }
  const baseUrl = new URL(provider.base_url)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)
  if (!provider.credential_configured && !local) {
    throw new Error('Configure credentials for the default UAR provider before setting up a starter agent')
  }
  return { providerId: provider.id, modelId: model.id }
}

/** Install only Boss's fixed portable starter definition and a private binding for this verified workspace. */
export async function setupUarStarterAgent(workspaceId: string): Promise<UarDurableBinding> {
  const resolved = workspace(workspaceId)
  const state = await capabilityState()
  if (!state.operations['starter.setup'].available) throw new Error('UAR starter setup is unavailable')
  const selectedModel = await configuredStarterModel(state.generation)
  const capabilities = rawCollaborationCapabilities.parse(
    await scopedRequest(resolved, '/api/v1/collaboration/capabilities', state.generation)
  )
  const starter = starterPackage()
  const packageRecords = z
    .array(rawPackage)
    .parse(await scopedRequest(resolved, '/api/v1/collaboration/packages', state.generation))
  const existingPackage = packageRecords.find(
    (record) => record.identity.id === starter.identity.id && record.identity.version === starter.identity.version
  )
  if (existingPackage && existingPackage.identity.digest !== starter.identity.digest) {
    throw new Error('The installed starter package differs from this Boss release; update the package before setup')
  }
  if (!existingPackage) {
    const packageRequest = { commandId: randomUUID(), manifest: starter.manifest, files: starter.files }
    const preflight = rawPreflight.parse(
      await scopedRequest(
        resolved,
        '/api/v1/collaboration/packages:preflight',
        state.generation,
        'POST',
        packageRequest
      )
    )
    if (!preflight.activationSupported) throw new Error('The UAR runtime cannot activate the built-in starter package')
    const installed = z
      .object({ preflight: z.object({ package: rawPackage.shape.identity }) })
      .parse(
        await scopedRequest(
          resolved,
          '/api/v1/collaboration/packages:install',
          state.generation,
          'POST',
          packageRequest
        )
      )
    if (installed.preflight.package.digest !== starter.identity.digest) {
      throw new Error('UAR installed a different starter package revision')
    }
  }

  const endpoint = await application.get('UarSidecarService').ensureReady()
  if (endpoint.generation !== state.generation) throw new Error('UAR sidecar restarted during starter setup')
  const binding = starterBinding({
    ownerId: capabilities.bindingOwnerId,
    workspaceId: resolved,
    runtimeInstanceId: capabilities.instance.id,
    providerId: selectedModel.providerId,
    modelId: selectedModel.modelId,
    storageBackend: endpoint.storage.profile.backend,
    packageIdentity: starter.identity
  })
  const existingBindings = z.array(rawBinding).parse(await scopedRequest(resolved, bindingPath, state.generation))
  if (existingBindings.some((candidate) => candidate.workspaceId !== resolved)) {
    throw new Error('UAR binding workspace scope mismatch')
  }
  const existingBinding = existingBindings.find((candidate) => candidate.id === binding.id)
  if (existingBinding) {
    if (existingBinding.package.digest !== starter.identity.digest || !existingBinding.activationSupported) {
      throw new Error('The existing starter binding differs or cannot activate; inspect it before replacing it')
    }
    return { id: existingBinding.id, revision: existingBinding.revision, activationSupported: true }
  }

  const bindingRequest = { commandId: randomUUID(), expectedRevision: 0, binding }
  const preflight = rawPreflight.parse(
    await scopedRequest(
      resolved,
      '/api/v1/collaboration/deployment-bindings:preflight',
      state.generation,
      'POST',
      bindingRequest
    )
  )
  if (!preflight.activationSupported) {
    throw new Error(
      'The selected UAR model or runtime cannot activate the starter agent; check the default provider and model in UAR Settings'
    )
  }
  const installed = z
    .object({ binding: rawBinding, preflight: rawPreflight })
    .parse(await scopedRequest(resolved, bindingPath, state.generation, 'POST', bindingRequest))
  if (
    installed.binding.workspaceId !== resolved ||
    installed.binding.package.digest !== starter.identity.digest ||
    !installed.binding.activationSupported ||
    !installed.preflight.activationSupported
  ) {
    throw new Error('UAR did not return an activation-capable starter binding for this workspace')
  }
  return {
    id: installed.binding.id,
    revision: installed.binding.revision,
    activationSupported: installed.binding.activationSupported
  }
}

/** Install The Boss's fixed planning team and its private workspace binding. Execution is not enabled by this setup. */
export async function setupUarStarterTeam(workspaceId: string): Promise<UarTeamBinding> {
  const resolved = workspace(workspaceId)
  const state = await capabilityState()
  const required = [
    'collaboration.capabilities',
    'collaboration.packages.list',
    'collaboration.packages.preflight',
    'collaboration.packages.install',
    'collaboration.deployment_bindings.preflight',
    'collaboration.deployment_bindings.install',
    'collaboration.deployment_bindings.list'
  ] as const
  if (required.some((operation) => !state.operations[operation].available)) {
    throw new Error('UAR team setup is unavailable')
  }
  const capabilities = rawCollaborationCapabilities.parse(
    await scopedRequest(resolved, '/api/v1/collaboration/capabilities', state.generation)
  )
  const starter = starterTeamPackage()
  const packages = z
    .array(rawPackage)
    .parse(await scopedRequest(resolved, '/api/v1/collaboration/packages', state.generation))
  const existingPackage = packages.find(
    (record) => record.identity.id === starter.identity.id && record.identity.version === starter.identity.version
  )
  if (existingPackage && existingPackage.identity.digest !== starter.identity.digest) {
    throw new Error('The installed starter team differs from this Boss release; update the package before setup')
  }
  if (!existingPackage) {
    const request = { commandId: randomUUID(), manifest: starter.manifest, files: starter.files }
    await scopedRequest(resolved, '/api/v1/collaboration/packages:preflight', state.generation, 'POST', request)
    const installed = z
      .object({ preflight: z.object({ package: rawPackage.shape.identity }) })
      .parse(await scopedRequest(resolved, '/api/v1/collaboration/packages:install', state.generation, 'POST', request))
    if (installed.preflight.package.digest !== starter.identity.digest) {
      throw new Error('UAR installed a different starter team package revision')
    }
  }

  const endpoint = await application.get('UarSidecarService').ensureReady()
  if (endpoint.generation !== state.generation) throw new Error('UAR sidecar restarted during starter team setup')
  const binding = starterBinding({
    ownerId: capabilities.bindingOwnerId,
    workspaceId: resolved,
    runtimeInstanceId: capabilities.instance.id,
    storageBackend: endpoint.storage.profile.backend,
    packageIdentity: starter.identity,
    bindingId: `urn:boss:starter:team-binding:v2:${resolved}`,
    effectiveLimits: { concurrentTurns: 1, maxMembers: 3, maxDepth: 0, maxPendingTasks: 8 }
  })
  const existingBindings = z.array(rawBinding).parse(await scopedRequest(resolved, bindingPath, state.generation))
  if (existingBindings.some((candidate) => candidate.workspaceId !== resolved)) {
    throw new Error('UAR binding workspace scope mismatch')
  }
  const existingBinding = existingBindings.find((candidate) => candidate.id === binding.id)
  if (existingBinding) {
    if (existingBinding.package.digest !== starter.identity.digest) {
      throw new Error('The existing starter team binding points to another package')
    }
    return existingBinding
  }
  const request = { commandId: randomUUID(), expectedRevision: 0, binding }
  await scopedRequest(
    resolved,
    '/api/v1/collaboration/deployment-bindings:preflight',
    state.generation,
    'POST',
    request
  )
  const installed = z
    .object({ binding: rawBinding })
    .parse(await scopedRequest(resolved, bindingPath, state.generation, 'POST', request))
  if (installed.binding.workspaceId !== resolved || installed.binding.package.digest !== starter.identity.digest) {
    throw new Error('UAR returned a starter team binding for another workspace or package')
  }
  return installed.binding
}
