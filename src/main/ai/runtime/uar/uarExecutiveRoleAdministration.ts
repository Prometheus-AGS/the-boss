import { createHash, randomUUID } from 'node:crypto'
import * as z from 'zod'
import type { UarExecutiveRoleAuthoringInput, UarExecutiveRoleInstallInput } from '@shared/types/uarRepresentation'
import { capabilityState, workspace, rawBinding, scopedRequest } from './UarDurableAdministrationAdapter'
import { executiveRolePackage } from './uarExecutiveRolePackage'
import { document, starterBinding } from './uarStarterDocuments'
import { configureTeamModel } from './uarTeamModelSetup'

const identity = z.object({ id: z.string(), version: z.string(), digest: z.string() })
const path = '/api/v1/collaboration/deployment-bindings'

export function previewUarExecutiveRole(input: UarExecutiveRoleAuthoringInput) {
  workspace(input.workspaceId)
  return executiveRolePackage(input)
}

/** Explicit catalog install only. No instance activation or human grant issuance. */
export async function installUarExecutiveRole(input: UarExecutiveRoleInstallInput) {
  const resolved = workspace(input.workspaceId)
  const state = await capabilityState()
  const preset = executiveRolePackage(input)
  if (preset.identity.digest !== input.reviewedDigest) throw new Error('EXECUTIVE_ROLE_REVIEW_CHANGED')
  if (input.model.source !== 'uar') throw new Error('EXECUTIVE_ROLE_CONFIGURED_UAR_MODEL_REQUIRED')
  const selected = await configureTeamModel(input.model, state.generation)
  const capabilities = z.object({ bindingOwnerId: z.string(), instance: z.object({ id: z.string() }),
    catalogStorage: z.object({ backend: z.enum(['surrealdb', 'surrealkv', 'postgresql', 'memory']) })
  }).parse(await scopedRequest(resolved, '/api/v1/collaboration/capabilities', state.generation))
  if (capabilities.catalogStorage.backend === 'memory') throw new Error('EXECUTIVE_ROLE_DURABLE_CATALOG_REQUIRED')
  const packages = z.array(z.object({ identity })).parse(
    await scopedRequest(resolved, '/api/v1/collaboration/packages', state.generation))
  const installed = packages.find(({ identity }) => identity.id === preset.identity.id && identity.version === preset.identity.version)
  if (installed && installed.identity.digest !== preset.identity.digest) throw new Error('EXECUTIVE_ROLE_PACKAGE_MISMATCH')
  if (!installed) {
    const request = { commandId: randomUUID(), manifest: preset.manifest, files: preset.files }
    await scopedRequest(resolved, '/api/v1/collaboration/packages:preflight', state.generation, 'POST', request)
    const result = z.object({ preflight: z.object({ package: identity }) }).parse(
      await scopedRequest(resolved, '/api/v1/collaboration/packages:install', state.generation, 'POST', request))
    if (result.preflight.package.id !== preset.identity.id || result.preflight.package.version !== preset.identity.version ||
      result.preflight.package.digest !== preset.identity.digest) throw new Error('EXECUTIVE_ROLE_PACKAGE_MISMATCH')
  }
  const modelKey = createHash('sha256').update(JSON.stringify(selected)).digest('hex').slice(0, 16)
  const binding = starterBinding({ ownerId: capabilities.bindingOwnerId, workspaceId: resolved,
    runtimeInstanceId: capabilities.instance.id, storageBackend: capabilities.catalogStorage.backend,
    packageIdentity: preset.identity, ...selected, bindingId: `urn:boss:office:binding:${resolved}:${preset.definition.id}:${modelKey}` })
  const stored = rawBinding.extend({ document: z.record(z.string(), z.json()) })
  const bindings = z.array(stored).parse(await scopedRequest(resolved, path, state.generation))
  if (bindings.some((value) => value.workspaceId !== resolved)) throw new Error('EXECUTIVE_ROLE_SCOPE_DENIED')
  const saved = bindings.find((value) => value.id === binding.id)
  if (saved) {
    const expected = { ...binding, revision: saved.revision }
    const { contentDigest: _digest, ...fields } = expected
    const { contentDigest: _savedDigest, ...savedFields } = saved.document
    // Existing private bindings must match the complete reviewed role/model selection.
    if (document(fields).contentDigest !== document(savedFields).contentDigest) throw new Error('EXECUTIVE_ROLE_BINDING_CHANGED')
    if (!saved.activationSupported) throw new Error('EXECUTIVE_ROLE_ACTIVATION_UNAVAILABLE')
    return rawBinding.parse(saved)
  }
  const request = { commandId: randomUUID(), expectedRevision: 0, binding }
  const preflight = z.object({ activationSupported: z.boolean() }).parse(
    await scopedRequest(resolved, path + ':preflight', state.generation, 'POST', request))
  if (!preflight.activationSupported) throw new Error('EXECUTIVE_ROLE_ACTIVATION_UNAVAILABLE')
  const result = z.object({ binding: rawBinding, preflight: z.object({ activationSupported: z.boolean() }) }).parse(
    await scopedRequest(resolved, path, state.generation, 'POST', request))
  if (result.binding.id !== binding.id || result.binding.workspaceId !== resolved || result.binding.revision !== 1 ||
    result.binding.package.id !== preset.identity.id || result.binding.package.version !== preset.identity.version ||
    result.binding.package.digest !== preset.identity.digest || !result.binding.activationSupported || !result.preflight.activationSupported) {
    throw new Error('EXECUTIVE_ROLE_BINDING_RESULT_MISMATCH')
  }
  return result.binding
}
