import { application } from '@application'
import { modelService } from '@data/services/ModelService'
import { providerService } from '@data/services/ProviderService'
import { resolveEffectiveEndpoint } from '@main/ai/provider/endpoint'
import { createAiUsagePricingSnapshot } from '@main/ai/utils/usageCapture'
import { readIntegrationConfig, readSecrets } from '@main/services/prometheus/integrationConfig'
import { contextWindowForLiterAlias } from '@main/services/prometheus/literGatewayCatalog'
import type { UarModelAssignment } from '@shared/data/api/schemas/agents'
import type { ModelSnapshot } from '@shared/data/types/message'
import { ENDPOINT_TYPE, parseUniqueModelId, type UniqueModelId } from '@shared/data/types/model'
import { getRawModelId } from '@shared/utils/model'

import type { AgentSessionUsageCapture } from '../types'
import { gatewayResponseSchema, providerResponseSchema } from './UarModelSourceAdapter'
import type { UarSidecarEndpoint } from './UarSidecarService'

export type UarRunCredential = {
  provider_id: string
  provider_kind: 'openai_compatible' | 'anthropic'
  base_url: string
  api_key: string
  default_model?: string
  context_window?: number
}

export type ResolvedUarModelAssignment = {
  source: 'boss' | 'gateway' | 'uar'
  providerId: string
  modelId: string
  providerName: string
  modelName: string
  effectiveIdentity: string
  connectedInstance: string
  credential?: UarRunCredential
  usageCapture?: AgentSessionUsageCapture
}

/** Freeze the UAR execution route on new assistant messages. The row's modelId
 * remains the Boss stream-routing key; it is not the model UAR runs. */
export function modelSnapshotForUarAssignment(
  assignment: UarModelAssignment | undefined,
  bossModel: ModelSnapshot
): ModelSnapshot {
  if (!assignment || assignment.source === 'boss') {
    if (!assignment?.modelId) return bossModel
    const { providerId, modelId } = parseUniqueModelId(assignment.modelId)
    return { id: modelId, name: modelId, provider: providerId }
  }
  if (assignment.source === 'gateway') {
    return { id: assignment.modelId, name: assignment.modelId, provider: 'the-boss-gateway', group: 'liter-llm' }
  }
  return { id: assignment.modelId, name: assignment.modelId, provider: assignment.providerId, group: 'UAR' }
}

function normalizeGatewayEndpoint(endpoint: string): string {
  const url = new URL(endpoint)
  const pathname = url.pathname.replace(/\/$/, '')
  url.pathname = pathname.endsWith('/v1') ? pathname : `${pathname}/v1`
  return url.href.replace(/\/$/, '')
}

function resolveBossModel(uniqueModelId: UniqueModelId): ResolvedUarModelAssignment {
  const { providerId, modelId } = parseUniqueModelId(uniqueModelId)
  const provider = providerService.getByProviderId(providerId)
  const model = modelService.getByKey(providerId, modelId)
  if (!provider.isEnabled || !model.isEnabled) {
    throw new Error(
      `UAR_MODEL_ASSIGNMENT_REQUIRED: ${provider.name} or ${model.name} is disabled. Choose an available model in this agent's settings.`
    )
  }
  const endpoint = resolveEffectiveEndpoint(provider, model)
  const providerKind =
    endpoint.endpointType === ENDPOINT_TYPE.ANTHROPIC_MESSAGES
      ? 'anthropic'
      : endpoint.endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS ||
          endpoint.endpointType === ENDPOINT_TYPE.OPENAI_RESPONSES ||
          endpoint.endpointType === ENDPOINT_TYPE.OLLAMA_CHAT
        ? 'openai_compatible'
        : undefined
  if (!providerKind || !endpoint.baseUrl) {
    throw new Error(`Provider "${provider.name}" is not compatible with Universal Agent Runtime`)
  }
  if (provider.authType !== 'api-key') {
    throw new Error(
      `UAR_MODEL_ASSIGNMENT_REQUIRED: ${provider.name} uses ${provider.authType} authentication. Choose a liter-llm or UAR model in this agent's settings.`
    )
  }
  const resolved = providerService.resolveApiKey(provider.id)
  const apiKey = resolved.value.trim() || (provider.authOptional ? 'no-key-required' : '')
  if (!apiKey) {
    throw new Error(
      `UAR_MODEL_ASSIGNMENT_REQUIRED: ${provider.name} has no API key configured. Choose a liter-llm or UAR model in this agent's settings.`
    )
  }
  const apiModelId = getRawModelId(model)
  return {
    source: 'boss',
    providerId: provider.id,
    modelId: apiModelId,
    providerName: provider.name ?? provider.id,
    modelName: model.name ?? model.id,
    effectiveIdentity: `${provider.id}/${apiModelId}`,
    connectedInstance: endpoint.baseUrl,
    credential: {
      provider_id: provider.id,
      provider_kind: providerKind,
      base_url: endpoint.baseUrl,
      api_key: apiKey,
      default_model: apiModelId,
      ...(model.contextWindow ? { context_window: Math.min(model.contextWindow, 2_000_000) } : {})
    },
    usageCapture: {
      owner: 'agent-sdk',
      credentialReceipt: resolved.apiKeySelection,
      providerId: provider.id,
      providerName: provider.name ?? null,
      source: null,
      frozenModels: [
        {
          modelId: model.id,
          apiModelId,
          modelName: model.name ?? model.id,
          aliases: [...new Set([model.id, apiModelId])],
          pricingSnapshot: createAiUsagePricingSnapshot(model.pricing)
        }
      ]
    }
  }
}

export async function resolveUarModelAssignment(
  assignment: UarModelAssignment | undefined,
  activeBossModel: UniqueModelId
): Promise<ResolvedUarModelAssignment> {
  if (!assignment || assignment.source === 'boss') {
    return resolveBossModel(assignment?.modelId ?? activeBossModel)
  }
  if (assignment.source === 'uar') {
    return {
      source: 'uar',
      providerId: assignment.providerId,
      modelId: assignment.modelId,
      providerName: assignment.providerId,
      modelName: assignment.modelId,
      effectiveIdentity: `${assignment.providerId}/${assignment.modelId}`,
      connectedInstance: 'Universal Agent Runtime'
    }
  }
  const config = readIntegrationConfig()
  const secrets = await readSecrets()
  const apiKey = secrets.literKey?.trim()
  if (!apiKey) throw new Error('The selected liter-llm gateway has no credential configured')
  const endpoint = normalizeGatewayEndpoint(config.services.liter.endpoint)
  const contextWindow = await contextWindowForLiterAlias(config, assignment.modelId)
  return {
    source: 'gateway',
    providerId: 'the-boss-gateway',
    modelId: assignment.modelId,
    providerName: 'liter-llm',
    modelName: assignment.modelId,
    effectiveIdentity: `the-boss-gateway/${assignment.modelId}`,
    connectedInstance: endpoint,
    credential: {
      provider_id: 'the-boss-gateway',
      provider_kind: 'openai_compatible',
      base_url: endpoint,
      api_key: apiKey,
      default_model: assignment.modelId,
      ...(contextWindow ? { context_window: contextWindow } : {})
    }
  }
}

/** Check the route against the instance that will receive this run. The
 * selected administration instance may differ from a resumed session's one. */
export async function assertUarModelAvailable(
  assignment: ResolvedUarModelAssignment,
  endpoint: UarSidecarEndpoint
): Promise<void> {
  if (assignment.source === 'boss') return
  if (assignment.source === 'gateway') {
    const response = await fetch(`${assignment.connectedInstance}/models`, {
      headers: { authorization: `Bearer ${assignment.credential?.api_key ?? ''}` },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw new Error(`liter-llm model discovery failed (HTTP ${response.status})`)
    const models = gatewayResponseSchema.parse(await response.json()).data
    if (!models.some((model) => model.id === assignment.modelId)) {
      throw new Error(
        `liter-llm is not serving model "${assignment.modelId}"; choose an available model in agent settings`
      )
    }
    return
  }
  const response = await application.get('UarSidecarService').modelRequestInstance(endpoint, '/api/uar/providers')
  if (!response.ok) throw new Error(`UAR model discovery failed (HTTP ${response.status})`)
  const provider = providerResponseSchema
    .parse(await response.json())
    .providers.find((item) => item.id === assignment.providerId)
  const models = provider?.models ?? []
  if (
    !provider?.enabled ||
    !provider?.credential_configured ||
    !models.some((model) => model.id === assignment.modelId && model.enabled)
  ) {
    throw new Error(
      `UAR instance "${endpoint.instanceId}" cannot use ${assignment.effectiveIdentity}; choose a configured model for this instance`
    )
  }
}
