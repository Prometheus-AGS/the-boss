import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { application } from '@application'
import { readIntegrationConfig, readSecrets } from '@main/services/prometheus/integrationConfig'
import { configuredModelForLiterAlias } from '@main/services/prometheus/literGatewayCatalog'
import { toAsarUnpackedPath } from '@main/utils/asar'
import {
  uarReviewedModelResultSchema,
  type UarReviewedModelPolicy
} from '@shared/types/uarTeamModelPolicy'

import { readUarModelSources } from './UarModelSourceAdapter'

const digest = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex')

function readSource(source: string): unknown {
  try {
    return JSON.parse(source)
  } catch {
    throw new Error('UAR_TEAM_MODEL_POLICY_RESULT_INVALID')
  }
}

export async function assertUarTeamArtifactCredentialFree(value: unknown) {
  const url = pathToFileURL(
    toAsarUnpackedPath(
      application.getPath('feature.prometheus.pack.builtin', 'skills/agent-team-creator/scripts/models-http.mjs')
    )
  ).href
  const skill = (await import(/* @vite-ignore */ url)) as { assertNoCredentials(value: unknown): void }
  skill.assertNoCredentials(value)
  const encoded = JSON.stringify(value)
  const secrets = await readSecrets()
  if (
    Object.values(secrets).some(
      (secret) => typeof secret === 'string' && secret.length >= 8 && encoded.includes(JSON.stringify(secret).slice(1, -1))
    )
  )
    throw new Error('UAR_TEAM_MODEL_POLICY_CREDENTIALS_FORBIDDEN')
}

export async function assertReviewedModelPolicy(policy: UarReviewedModelPolicy) {
  await assertUarTeamArtifactCredentialFree(policy)
  const sourceResult = uarReviewedModelResultSchema.safeParse(readSource(policy.sourceJson))
  if (
    !sourceResult.success ||
    policy.sourceDigest !== digest(policy.sourceJson) ||
    policy.digest !== digest(JSON.stringify(policy.result)) ||
    policy.digest !== digest(JSON.stringify(sourceResult.data)) ||
    policy.selection.modelId !== policy.result.selected.id
  )
    throw new Error('UAR_TEAM_MODEL_POLICY_IDENTITY_MISMATCH')
  reviewedModelBindingTarget(policy)
}

export function reviewedModelBindingTarget(policy: UarReviewedModelPolicy): { providerId: string; modelId: string } {
  const selected = policy.result.selected
  const target = policy.bindingTarget ?? (
    selected.provider !== null && selected.catalogId !== null
      ? { providerId: selected.provider, modelId: selected.catalogId }
      : undefined
  )
  if (
    !target ||
    (selected.provider !== null && selected.provider !== target.providerId) ||
    (selected.catalogId !== null && selected.catalogId !== target.modelId)
  )
    throw new Error('UAR_TEAM_MODEL_POLICY_TARGET_MISMATCH')
  return { providerId: target.providerId, modelId: target.modelId }
}

/** Bridge an operator-reviewed skill result; selection and inference remain in their existing owners. */
export async function reviewUarTeamModelPolicy(source: string): Promise<UarReviewedModelPolicy> {
  const raw = readSource(source)
  await assertUarTeamArtifactCredentialFree(raw)
  const parsed = uarReviewedModelResultSchema.safeParse(raw)
  if (!parsed.success) throw new Error('UAR_TEAM_MODEL_POLICY_RESULT_INVALID')
  const result = parsed.data
  const catalog = await readUarModelSources()
  const provider = catalog.sources.find((item) => item.source === 'gateway' && item.operational)
    ?.providers.find(
      (item) => item.enabled && item.models.some((model) => model.enabled && model.id === result.selected.id)
    )
  if (!provider) throw new Error('UAR_TEAM_MODEL_POLICY_MODEL_UNAVAILABLE')
  const target = configuredModelForLiterAlias(readIntegrationConfig(), result.selected.id)
  if (!target) throw new Error('UAR_TEAM_MODEL_POLICY_TARGET_MISMATCH')
  const policy: UarReviewedModelPolicy = {
    schemaVersion: 1,
    source: 'agent-team-creator/models-select',
    sourceDigest: digest(source),
    sourceJson: source,
    digest: digest(JSON.stringify(result)),
    result,
    bindingTarget: { source: 'enabled-configured-gateway-alias', ...target },
    selection: { source: 'gateway', providerId: provider.id, modelId: result.selected.id }
  }
  reviewedModelBindingTarget(policy)
  return policy
}
