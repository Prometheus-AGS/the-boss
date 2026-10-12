import { randomUUID } from 'node:crypto'

import * as z from 'zod'

import { application } from '@application'
import { rawBinding } from '@main/ai/runtime/uar/UarDurableAdministrationAdapter'
import { uarPrincipalForSession } from '@main/ai/runtime/uar/uarPrincipal'
import type { UarSidecarEndpoint } from '@main/ai/runtime/uar/UarSidecarService'
import { document, starterBinding, starterPackage } from '@main/ai/runtime/uar/uarStarterDocuments'
import { t } from '@main/i18n'

/** Explicit setup creates one app-owned default binding; previous bindings and active runs are retained. */
export async function ensureDefaultAgent(
  endpoint: UarSidecarEndpoint,
  workspaceId: string,
  providerId: string,
  modelId: string
) {
  const request = async (path: string, payload?: object) => {
    const response = await application
      .get('UarSidecarService')
      .requestInstance(endpoint, path, uarPrincipalForSession('bossfang'), {
        method: payload ? 'POST' : 'GET',
        headers: { 'x-uar-workspace-id': workspaceId, ...(payload ? { 'content-type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {})
      })
    if (!response.ok) throw new Error(t('bossfang.modelSetupFailed') + ` (HTTP ${response.status})`)
    return response.json()
  }
  const capabilities = z
    .object({
      bindingOwnerId: z.string(),
      instance: z.object({ id: z.string() }),
      catalogStorage: z.object({ backend: z.enum(['surrealdb', 'surrealkv', 'postgresql', 'memory']) })
    })
    .parse(await request('/api/v1/collaboration/capabilities'))
  const bindings = z
    .array(rawBinding.extend({ document: z.record(z.string(), z.json()) }))
    .parse(await request('/api/v1/collaboration/deployment-bindings'))
  const bindingId = 'urn:boss:default-agent:binding:' + workspaceId
  const installed = bindings.find((item) => item.id === bindingId)
  const previousModels = installed
    ? z
        .array(
          z
            .object({
              requestedAlias: z.string(),
              providerId: z.string(),
              modelId: z.string(),
              credentialRef: z.string()
            })
            .passthrough()
        )
        .parse(installed.document.modelBindings)
    : []
  if (
    installed &&
    (installed.workspaceId !== workspaceId ||
      installed.document.ownerId !== capabilities.bindingOwnerId ||
      previousModels.length === 0 ||
      installed.package.digest !== starterPackage('default-agent', previousModels.length - 1).identity.digest)
  )
    throw new Error(t('bossfang.modelSourceChanged'))
  const alreadyBound = previousModels.some((item) => item.providerId === providerId && item.modelId === modelId)
  if (alreadyBound && installed?.activationSupported) return
  // Added routes are explicit overrides, never automatic fallback providers.
  const models = alreadyBound
    ? previousModels
    : [
        ...previousModels,
        {
          requestedAlias: previousModels.length === 0 ? 'local-default' : 'explicit-override-' + previousModels.length,
          providerId,
          modelId,
          credentialRef: 'protected-credential://uar/provider/' + providerId
        }
      ]
  const starter = starterPackage('default-agent', models.length - 1)
  const packages = z
    .array(z.object({ identity: z.object({ id: z.string(), version: z.string(), digest: z.string() }) }))
    .parse(await request('/api/v1/collaboration/packages'))
  const existing = packages.find(
    (item) => item.identity.id === starter.identity.id && item.identity.version === starter.identity.version
  )
  if (existing && existing.identity.digest !== starter.identity.digest)
    throw new Error(t('bossfang.modelSourceChanged'))
  if (!existing) {
    const input = { commandId: randomUUID(), manifest: starter.manifest, files: starter.files }
    const preflight = z
      .object({ activationSupported: z.boolean() })
      .parse(await request('/api/v1/collaboration/packages:preflight', input))
    if (!preflight.activationSupported) throw new Error(t('bossfang.modelSetupFailed'))
    await request('/api/v1/collaboration/packages:install', input)
  }
  const initial = starterBinding({
    ownerId: capabilities.bindingOwnerId,
    workspaceId,
    runtimeInstanceId: capabilities.instance.id,
    providerId,
    modelId,
    storageBackend: capabilities.catalogStorage.backend,
    packageIdentity: starter.identity,
    bindingId
  })
  const fields = Object.fromEntries(
    Object.entries(installed?.document ?? initial).filter(([key]) => key !== 'contentDigest')
  )
  const binding = document({
    ...fields,
    package: starter.identity,
    revision: (installed?.revision ?? 0) + 1,
    runtimeInstanceId: capabilities.instance.id,
    modelBindings: z.array(z.json()).parse(models)
  })
  const input = { commandId: randomUUID(), expectedRevision: installed?.revision ?? 0, binding }
  const preflight = z
    .object({ activationSupported: z.boolean() })
    .parse(await request('/api/v1/collaboration/deployment-bindings:preflight', input))
  if (!preflight.activationSupported) throw new Error(t('bossfang.modelSetupFailed'))
  const saved = z
    .object({ binding: rawBinding })
    .parse(await request('/api/v1/collaboration/deployment-bindings', input))
  if (saved.binding.id !== bindingId || saved.binding.workspaceId !== workspaceId || !saved.binding.activationSupported)
    throw new Error(t('bossfang.modelSetupFailed'))
}
