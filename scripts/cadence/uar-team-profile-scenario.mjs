import { randomUUID } from 'node:crypto'

import operateRuntime from './uar-team-execution-scenario.mjs'
import {
  ipc,
  response,
  route,
  workspace,
  team,
  current,
  task,
  admission,
  summary,
  terminal,
  waitFor,
  truthfulUsage
} from './uar-team-operation-tools.mjs'
import { operateRemoteOwnership } from './uar-team-owner-operation.mjs'

function requireEffective(attempt, alias) {
  const effective = attempt.effectiveModels?.[0]
  if (
    attempt.effectiveModels?.length !== 1 ||
    !effective ||
    effective.wireModelAlias !== alias ||
    effective.route.modelId !== alias ||
    effective.profile.id !== 'uar.openai-compatible-chat.settings-v1' ||
    effective.profile.revision !== 1 ||
    effective.settingsRevision < 1 ||
    effective.requestedReasoning.mode !== 'off' ||
    effective.effectiveReasoning.mode !== 'off' ||
    effective.fit.mode !== 'settings-only' ||
    effective.fit.guaranteedFit !== false ||
    effective.support !== 'validated' ||
    !effective.supportEvidenceRef ||
    !attempt.executionFence
  ) {
    throw new Error('The actual team attempt did not retain the exact settings-only endpoint profile and owner fence')
  }
  return effective
}

function providerInput(provider, models, id = provider.id) {
  return {
    mode: id === provider.id ? 'update' : 'create',
    id,
    displayName: provider.name,
    baseUrl: provider.baseUrl,
    protocol: provider.protocol ?? 'chat',
    defaultModel: models[0].id,
    enabled: true,
    credential: { operation: 'unchanged' },
    models: models.map((model) => ({
      id: model.id,
      displayName: model.name,
      enabled: model.enabled,
      ...Object.fromEntries(
        [
          'contextWindow',
          'supportsVision',
          'supportsTools',
          'supportsReasoning',
          'supportsStructuredOutput',
          'supportsStreaming',
          'maxOutputTokens',
          'pricingIdentity',
          'executionProfile'
        ]
          .filter((key) => model[key] !== undefined)
          .map((key) => [key, model[key]])
      )
    }))
  }
}

export default async function run(context) {
  const { evaluate, signal } = context
  let primary, selected, original, restoredEvidence
  const runtime = await operateRuntime({
    ...context,
    async onPrimaryCompleted(event) {
      primary = event.primary
      original = requireEffective(event.completed.attempt, event.alias.id)
      selected = event.model
      if (
        event.completed.attempt.usage == null &&
        (event.completed.attempt.output == null ||
          event.completed.attempt.executionOutcome !== 'succeeded' ||
          event.completed.attempt.accountingState !== 'reserved-unknown')
      ) {
        throw new Error('Unknown accounting concealed a successful executed output')
      }
      const owner = await ipc(evaluate, route('execution_owner'), {})
      if (
        !owner.ownsExecution ||
        owner.claim?.state !== 'held' ||
        owner.claim.epoch !== event.completed.attempt.executionFence.epoch
      ) {
        throw new Error('The packaged executor did not expose its actual durable claim')
      }
    },
    async onRestarted({ restored, admitted }) {
      restoredEvidence = requireEffective(
        restored.attempts.find((item) => item.id === admitted.id),
        selected.modelId
      )
      if (JSON.stringify(restoredEvidence) !== JSON.stringify(original)) {
        throw new Error('Restart changed the immutable effective request settings')
      }
    }
  })

  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const provider = sources.sources
    .find((item) => item.source === 'uar')
    ?.providers.find((item) => item.id === original.route.providerId)
  const model = provider?.models.find((item) => item.id === original.route.modelId)
  if (!provider || !model?.executionProfile || !model.pricingIdentity) {
    throw new Error('The selected provider settings or canonical pricing identity did not survive restart')
  }
  const unsupported = providerInput(
    provider,
    [{ ...model, executionProfile: { ...model.executionProfile, reasoning: { mode: 'explicit', effort: 'high' } } }],
    'cadence-unsupported-' + randomUUID().slice(0, 8)
  )
  const refused = await response(evaluate, 'prometheus.uar.providers.save', unsupported)
  if (refused?.ok || !JSON.stringify(refused?.error).includes('TEAM_REASONING_UNSUPPORTED')) {
    throw new Error('An unsupported explicit reasoning request was silently accepted')
  }

  const before = await current(evaluate, primary)
  const state = await ipc(evaluate, route('snapshot'), { workspaceId: primary.workspaceId })
  const binding = state.bindings.find((item) => item.id === before.binding.id)
  if (!binding) throw new Error('The original starter binding cannot be inspected for explicit rebind')
  const rebindInput = {
    workspaceId: primary.workspaceId,
    bindingId: binding.id,
    expectedBindingRevision: binding.revision,
    model: { source: 'uar', providerId: provider.id, modelId: model.id }
  }
  const revised = await ipc(evaluate, route('rebind_starter'), rebindInput)
  const stale = await response(evaluate, route('rebind_starter'), rebindInput)
  if (revised.id !== binding.id || revised.revision !== binding.revision + 1 || stale?.ok) {
    throw new Error('Explicit starter rebind failed to preserve identity and reject the stale revision')
  }
  const retained = await summary(evaluate, primary)
  if (retained.attempts.some((item) => item.bindingRevision !== binding.revision)) {
    throw new Error('Rebinding rewrote an existing instance or attempt binding revision')
  }

  // A nonexistent served alias exercises a real gateway failure; no fake response server is used.
  const badAlias = 'cadence-unserved-' + randomUUID().slice(0, 8)
  const badProviderId = 'cadence-unserved-provider-' + randomUUID().slice(0, 8)
  const failureInput = providerInput(provider, [{ ...model, id: badAlias }], badProviderId)
  failureInput.credential = {
    operation: 'set',
    value: process.env.BOSS_CADENCE_LITER_KEY ?? process.env.LITER_LLM_MASTER_KEY
  }
  await ipc(evaluate, 'prometheus.uar.providers.save', failureInput)
  const failureWorkspace = await workspace(evaluate, 'C09 safe provider failure')
  const failureTeam = await team(
    evaluate,
    failureWorkspace,
    { source: 'uar', providerId: badProviderId, modelId: badAlias },
    'Expose a safe gateway failure'
  )
  const assigned = await task(evaluate, failureTeam, 'coordinator', 'Unserved route must fail', 'Return one word.')
  const limits = await summary(evaluate, failureTeam)
  const failedAttempt = await ipc(
    evaluate,
    route('admit_task'),
    await admission(evaluate, failureTeam, assigned, {
      tokens: Math.min(512, limits.budget.maxTokens),
      costMicrounits: limits.budget.maxCostMicrounits,
      elapsedSeconds: Math.min(45, limits.budget.maxElapsedSeconds)
    })
  )
  const failure = await waitFor(
    signal,
    async () => {
      const value = await summary(evaluate, failureTeam)
      const attempt = value.attempts.find((item) => item.id === failedAttempt.id)
      return attempt && terminal(attempt) ? { value, attempt } : null
    },
    'Real gateway establishment failure',
    60_000
  )
  if (
    failure.attempt.executionOutcome !== 'failed' ||
    !failure.attempt.diagnostic?.code ||
    !failure.attempt.diagnostic.protectedDiagnosticRef ||
    failure.attempt.output != null
  ) {
    throw new Error('A real failed gateway request lacks a safe diagnostic and protected reference')
  }
  truthfulUsage(failure.value)

  const ownership = await operateRemoteOwnership({ signal })
  return {
    passed: true,
    observedBehavior: JSON.stringify({
      runtime: JSON.parse(runtime.observedBehavior),
      effectiveModel: original,
      restartedEffectiveModel: restoredEvidence,
      unsupportedReasoning: 'refused before route installation/dispatch',
      bindingRebind: {
        bindingId: revised.id,
        oldRevision: binding.revision,
        revision: revised.revision,
        staleRevision: 'refused; historical attempts unchanged'
      },
      providerFailure: {
        attemptId: failure.attempt.id,
        code: failure.attempt.diagnostic.code,
        protectedDiagnosticRef: failure.attempt.diagnostic.protectedDiagnosticRef
      },
      ownership
    })
  }
}
