import { createHash } from 'node:crypto'

import * as z from 'zod'

import { application } from '@application'
import { readIntegrationConfig, readSecrets } from '@main/services/prometheus/integrationConfig'
import { configuredModelForLiterAlias } from '@main/services/prometheus/literGatewayCatalog'
import type { UarTeamModelSelection } from '@shared/types/uarTeams'

import { providerResponseSchema, readUarModelSources } from './UarModelSourceAdapter'

/** Resolve only a selected, currently advertised model; credentials remain in main and UAR's protected provider store. */
export async function configureTeamModel(selection: UarTeamModelSelection, generation: number) {
  const catalog = await readUarModelSources()
  if (catalog.generation !== generation) throw new Error('UAR instance changed during team model selection')
  const sidecar = application.get('UarSidecarService')
  const endpoint = await sidecar.resolveSelected()
  if (endpoint.generation !== generation) throw new Error('UAR instance changed during team model selection')
  const source = catalog.sources.find((item) => item.source === selection.source && item.operational)
  const provider = source?.providers.find((item) => item.id === selection.providerId && item.enabled)
  const model = provider?.models.find((item) => item.id === selection.modelId && item.enabled)
  if (!source || !provider || !model)
    throw new Error('The selected team model is no longer available; refresh the model choices')
  if (selection.source === 'uar') {
    if (
      !provider.credentialConfigured &&
      provider.baseUrl &&
      !['localhost', '127.0.0.1', '[::1]'].includes(new URL(provider.baseUrl).hostname)
    ) {
      throw new Error('Configure credentials for the selected UAR provider before setting up the team')
    }
    return { providerId: provider.id, modelId: model.id }
  }
  const config = readIntegrationConfig()
  const pricingIdentity = configuredModelForLiterAlias(config, model.id)
  if (!pricingIdentity) throw new Error('UAR_TEAM_MODEL_PRICING_UNAVAILABLE')
  const secrets = await readSecrets()
  if (!secrets.literKey?.trim())
    throw new Error('Configure the liter-llm gateway credential before setting up the team')
  const url = new URL(config.services.liter.endpoint)
  const path = url.pathname.replace(/\/$/, '')
  url.pathname = path.endsWith('/v1') ? path : path + '/v1'
  const baseUrl = url.href.replace(/\/$/, '')
  const suffix = createHash('sha256')
    .update(JSON.stringify([baseUrl, model.id, pricingIdentity.providerId, pricingIdentity.modelId]))
    .digest('hex')
    .slice(0, 16)
  const providerId = 'boss-team-gateway-' + suffix
  const existing = catalog.sources
    .find((item) => item.source === 'uar')
    ?.providers.find((item) => item.id === providerId)
  if (
    existing &&
    (!existing.enabled ||
      !existing.credentialConfigured ||
      existing.baseUrl !== baseUrl ||
      !existing.models.some((item) => item.id === model.id && item.enabled))
  ) {
    throw new Error('The existing team gateway provider changed; inspect its settings before replacing it')
  }
  if (existing) {
    const response = await sidecar.modelRequestInstance(endpoint, '/api/uar/providers')
    if (!response.ok) throw new Error('UAR team provider pricing is unavailable (HTTP ' + response.status + ')')
    const actualModel = providerResponseSchema
      .parse(await response.json())
      .providers.find((item) => item.id === providerId)
      ?.models.find((item) => item.id === model.id)
    const actualPrice = actualModel?.pricing_identity
    if (
      !actualPrice ||
      actualPrice.provider_id !== pricingIdentity.providerId ||
      actualPrice.model_id !== pricingIdentity.modelId
    ) {
      throw new Error('UAR_TEAM_MODEL_PRICING_UNAVAILABLE')
    }
  }
  if (!existing) {
    const response = await sidecar.modelRequestInstance(endpoint, '/api/uar/providers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: providerId,
        display_name: 'liter-llm · ' + model.id,
        base_url: baseUrl,
        protocol: 'auto',
        default_model: model.id,
        models: [
          {
            id: model.id,
            enabled: true,
            pricing_identity: { provider_id: pricingIdentity.providerId, model_id: pricingIdentity.modelId }
          }
        ],
        enabled: true,
        api_key: secrets.literKey
      })
    })
    if (!response.ok) {
      const failure = z.object({ error: z.string() }).safeParse(await response.json())
      if (
        failure.success &&
        ['Gateway pricing identity has no catalog price', 'Gateway catalog price is invalid'].includes(
          failure.data.error
        )
      ) {
        throw new Error('UAR_TEAM_MODEL_PRICING_UNAVAILABLE')
      }
      throw new Error('UAR team gateway provider setup failed (HTTP ' + response.status + ')')
    }
  }
  const currentEndpoint = await sidecar.resolveSelected()
  if (currentEndpoint.generation !== generation) throw new Error('UAR instance changed during team gateway setup')
  return { providerId, modelId: model.id }
}
