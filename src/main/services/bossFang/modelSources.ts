import { createHash } from 'node:crypto'

import { application } from '@application'
import { resolveUarModelAssignment } from '@main/ai/runtime/uar/uarModelAssignments'
import { providerResponseSchema, readUarModelSources } from '@main/ai/runtime/uar/UarModelSourceAdapter'
import { uarPrincipalForSession } from '@main/ai/runtime/uar/uarPrincipal'
import type { UarSidecarEndpoint } from '@main/ai/runtime/uar/UarSidecarService'
import { t } from '@main/i18n'
import {
  readIntegrationDocument,
  saveExternalLiterCredential,
  writeIntegrationDocument
} from '@main/services/prometheus/integrationConfig'
import { readLocalLiterCredential } from '@main/services/prometheus/literConfig'
import { writeMiniConfiguration } from '@main/services/prometheus/miniCommands'
import { discoverServiceCandidates } from '@main/services/prometheus/serviceDiscovery'
import type { UarModelAssignment } from '@shared/data/api/schemas/agents'
import { hasRuntimeTransportAdapter } from '@shared/data/presets/runtimeTransport'
import type { UniqueModelId } from '@shared/data/types/model'
import type { BossFangModelSourceChoice } from '@shared/types/bossFang'

import { ensureDefaultAgent } from './modelWorkspace'

export async function bossFangModelSources(endpoint: UarSidecarEndpoint): Promise<BossFangModelSourceChoice[]> {
  if (!endpoint.capabilities.includes('uar_target_catalog_v1')) throw new Error(t('bossfang.targetCatalogUnavailable'))
  const catalog = await readUarModelSources(endpoint)
  return catalog.sources.flatMap((source) =>
    source.providers.flatMap((provider) =>
      provider.models.map((model) => ({
        source: source.source,
        providerId: provider.id,
        modelId: model.id,
        name: model.name,
        providerName: provider.name,
        available:
          source.operational &&
          provider.enabled &&
          model.enabled &&
          !(
            source.source === 'boss' &&
            hasRuntimeTransportAdapter(provider.id) &&
            !['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint.baseUrl).hostname)
          ) &&
          (provider.credentialConfigured ||
            (source.source === 'uar' &&
              Boolean(
                provider.baseUrl && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(provider.baseUrl).hostname)
              ))),
        detail:
          source.error ??
          (source.source === 'boss' && hasRuntimeTransportAdapter(provider.id)
            ? !['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint.baseUrl).hostname)
              ? t('bossfang.subscriptionLocal')
              : !provider.credentialConfigured
                ? t('bossfang.subscriptionSignIn')
                : !application.get('ApiGatewayService').getCurrentConfig().enabled
                  ? t('bossfang.subscriptionGateway')
                  : null
            : !provider.credentialConfigured
              ? t('bossfang.sourceCredentials')
              : null)
      }))
    )
  )
}

export async function importBossFangGatewayCredential(): Promise<void> {
  const document = readIntegrationDocument()
  const selected = document.config.services.liter
  const inventory = await discoverServiceCandidates(document.config)
  const candidate = inventory.candidates.find(
    (entry) => entry.service === 'liter' && new URL(entry.endpoint).href === new URL(selected.endpoint).href
  )
  const provenance = candidate?.provenance.find((entry) => entry.source === 'full-pack' && entry.configPath)
  if (!provenance?.configPath) throw new Error(t('bossfang.gatewayConfigMissing'))
  const credential = await readLocalLiterCredential(provenance.configPath, selected.endpoint)
  const current = readIntegrationDocument()
  if (JSON.stringify(current.config.services.liter) !== JSON.stringify(selected))
    throw new Error(t('bossfang.gatewayEndpointMismatch'))
  await saveExternalLiterCredential(selected.endpoint, credential)
  if (selected.source === 'application') {
    current.config.services.liter = { endpoint: selected.endpoint, source: 'full-pack', ownership: 'external' }
    current.revisions.services++
    await writeIntegrationDocument(current)
  }
  await writeMiniConfiguration()
}

/** Only the explicitly chosen source is copied; no default provider or billing route is changed. */
export async function configureBossFangModel(
  endpoint: UarSidecarEndpoint,
  workspaceId: string,
  choice: Pick<BossFangModelSourceChoice, 'source' | 'providerId' | 'modelId'>
) {
  const source = (await bossFangModelSources(endpoint)).find(
    (item) => item.source === choice.source && item.providerId === choice.providerId && item.modelId === choice.modelId
  )
  if (!source?.available) throw new Error(source?.detail ?? t('bossfang.sourceCredentials'))
  const assignment: UarModelAssignment =
    choice.source === 'boss'
      ? { source: 'boss', modelId: choice.modelId as UniqueModelId }
      : choice.source === 'gateway'
        ? { source: 'gateway', modelId: choice.modelId }
        : { source: 'uar', providerId: choice.providerId, modelId: choice.modelId }
  const sidecar = application.get('UarSidecarService')
  let providerId = choice.providerId
  let modelId = choice.modelId
  if (choice.source !== 'uar') {
    const resolved = await resolveUarModelAssignment(assignment, choice.modelId as UniqueModelId)
    const credential = resolved.credential!
    modelId = resolved.modelId
    const suffix = createHash('sha256')
      .update(JSON.stringify([resolved.source, resolved.providerId, credential.base_url, modelId]))
      .digest('hex')
      .slice(0, 20)
    providerId = 'bossfang-source-' + suffix
    const providers = await sidecar.modelRequestInstance(endpoint, '/api/uar/providers')
    if (!providers.ok) throw new Error(t('bossfang.noModels'))
    const existing = providerResponseSchema
      .parse(await providers.json())
      .providers.find((item) => item.id === providerId)
    if (existing && (existing.base_url !== credential.base_url || !existing.models.some((item) => item.id === modelId)))
      throw new Error(t('bossfang.modelSourceChanged'))
    const response = await sidecar.modelRequestInstance(
      endpoint,
      '/api/uar/providers' + (existing ? '/' + providerId : ''),
      {
        method: existing ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: providerId,
          display_name: resolved.providerName + ' · ' + resolved.modelName,
          base_url: credential.base_url,
          protocol: resolved.protocol ?? 'chat',
          api_key: credential.api_key,
          enabled: true,
          default_model: modelId,
          models: [
            {
              id: modelId,
              display_name: resolved.modelName,
              enabled: true,
              ...(credential.context_window ? { context_window: credential.context_window } : {})
            }
          ]
        })
      }
    )
    if (!response.ok) throw new Error(t('bossfang.modelCheckFailed') + ` (HTTP ${response.status})`)
  }
  const checked = await sidecar.modelRequestInstance(
    endpoint,
    '/api/uar/providers/' + encodeURIComponent(providerId) + '/test',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelId })
    }
  )
  const result = (await checked.json().catch(() => null)) as { ok?: boolean } | null
  if (!checked.ok || result?.ok !== true) throw new Error(t('bossfang.modelCheckFailed') + ` (HTTP ${checked.status})`)
  await ensureDefaultAgent(endpoint, workspaceId, providerId, modelId)
  return { providerId, modelId }
}

export async function readBossFangTargets(endpoint: UarSidecarEndpoint, workspaceId: string) {
  if (!endpoint.capabilities.includes('uar_target_catalog_v1')) throw new Error(t('bossfang.targetCatalogUnavailable'))
  const response = await application
    .get('UarSidecarService')
    .requestInstance(endpoint, '/v1/models', uarPrincipalForSession('bossfang'), {
      headers: { 'x-uar-workspace-id': workspaceId }
    })
  if (!response.ok) throw new Error(t('bossfang.noModels') + ` (HTTP ${response.status})`)
  const { bossFangTargetCatalogSchema } = await import('@shared/types/bossFang')
  return bossFangTargetCatalogSchema.parse(await response.json()).data
}
