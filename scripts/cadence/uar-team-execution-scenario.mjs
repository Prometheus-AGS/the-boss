import { randomUUID } from 'node:crypto'

import {
  route,
  terminal,
  response,
  ipc,
  waitFor,
  workspace,
  team,
  current,
  task,
  admission,
  summary,
  truthfulUsage,
  expectDenied
} from './uar-team-operation-tools.mjs'

async function showControls(evaluate, signal, selector, modelId) {
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const skip = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === 'Set up later');
    if (skip) skip.click();
    return Boolean(document.querySelector('#app-sidebar'));
  })()`),
    'Packaged Boss onboarding'
  )
  await ipc(evaluate, 'navigation.open_route_in_main', { path: '/settings/uar?panel=teams' })
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Workspace"]');
    if (!button) return false; button.click(); return true;
  })()`),
    'Teams workspace selector'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find(item => item.innerText.includes('Cadence C09 runtime'));
    if (!option) return false; option.click(); return true;
  })()`),
    'Runtime workspace option'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const picker = document.querySelector('[data-ui="uar-team-model-picker"]');
    const label = picker?.querySelector('label');
    const button = label && document.getElementById(label.htmlFor);
    if (!button || label.innerText.trim() !== 'Execution model') return false;
    button.click(); return true;
  })()`),
    'Labelled execution model selector'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find(item => item.innerText.includes(${JSON.stringify(modelId)}));
    if (!option) return false; option.click(); return true;
  })()`),
    'Configured live gateway model option'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Choose a team instance"]');
    if (!button) return false; button.click(); return true;
  })()`),
    'Team instance selector'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find(item => item.innerText.includes(${JSON.stringify(selector.teamInstanceId)}));
    if (!option) return false; option.click(); return true;
  })()`),
    'Control team option'
  )
  await waitFor(
    signal,
    () =>
      evaluate(`(() => {
    const root = document.querySelector('[data-ui="uar-team-execution"]');
    if (!root) return false;
    const labels = [...root.querySelectorAll('label')].map(item => item.innerText.trim());
    const buttons = [...root.querySelectorAll('button')].map(item => item.innerText.trim());
    return ['Tokens', 'Cost (microunits)', 'Time (seconds)', 'Control reason'].every(item => labels.includes(item)) &&
      ['Start assigned task', 'Recover team runs', 'Revoke member'].every(item => buttons.includes(item)) &&
      labels.every(text => [...root.querySelectorAll('label')].filter(item => item.innerText.trim() === text)
        .every(item => Boolean(item.htmlFor && document.getElementById(item.htmlFor))));
  })()`),
    'Accessible admission, budget, recovery and membership controls'
  )
}

export default async function run({ evaluate, signal, onPrimaryCompleted, onRestarted }) {
  signal.throwIfAborted()
  const sidecar = await ipc(evaluate, 'prometheus.uar.admin.snapshot', {})
  if (!sidecar.uarVersion || !sidecar.generation) throw new Error('Packaged UAR sidecar did not initialize')
  // The launcher keeps scenario environment in this trusted Node process; secrets are never returned in receipts.
  const credential = process.env.BOSS_CADENCE_LITER_KEY ?? process.env.LITER_LLM_MASTER_KEY
  if (!credential) throw new Error('Set BOSS_CADENCE_LITER_KEY or LITER_LLM_MASTER_KEY for the live team operation')
  const endpoint = process.env.BOSS_CADENCE_LITER_ENDPOINT ?? 'http://127.0.0.1:4000'
  const aliasId = process.env.BOSS_CADENCE_LITER_ALIAS ?? 'kimi-for-coding'
  const sourceProvider = process.env.BOSS_CADENCE_LITER_SOURCE_PROVIDER
  const sourceModel = process.env.BOSS_CADENCE_LITER_SOURCE_MODEL
  if ((aliasId !== 'kimi-for-coding' || sourceProvider || sourceModel) && (!sourceProvider || !sourceModel)) {
    throw new Error(
      'A custom gateway alias requires explicit BOSS_CADENCE_LITER_SOURCE_PROVIDER and BOSS_CADENCE_LITER_SOURCE_MODEL'
    )
  }
  // This default identity was observed in the operator's gateway source configuration, not inferred from its alias.
  const target = {
    providerConnectionId: 'cadence-c09-model',
    providerId: sourceProvider ?? 'kimi-code-plan-cn',
    modelId: sourceModel ?? 'kimi-for-coding'
  }
  const sourceBaseUrl =
    process.env.BOSS_CADENCE_LITER_SOURCE_BASE_URL ??
    (!sourceProvider && !sourceModel ? 'https://api.kimi.com/coding/v1' : undefined)
  const configured = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: configured.revisions.services,
        value: { ...configured.config.services, liter: { ownership: 'external', source: 'manual', endpoint } }
      }
    ],
    secrets: { literKey: { operation: 'set', value: credential } }
  })
  const served = await ipc(evaluate, 'prometheus.liter.catalog.read', {})
  const gatewayConnectionId = served.gateway.identity.gatewayConnectionId
  const sourceConfig = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: sourceConfig.revisions.services,
        value: {
          ...sourceConfig.config.services,
          literConnections: [
            ...sourceConfig.config.services.literConnections.filter(
              (item) => item.providerConnectionId !== target.providerConnectionId
            ),
            {
              providerConnectionId: target.providerConnectionId,
              providerId: target.providerId,
              displayName: 'C09 observed source model',
              ...(sourceBaseUrl ? { baseUrl: sourceBaseUrl } : {}),
              timeoutMs: 60_000,
              enabled: true
            }
          ],
          literAliases: [
            ...sourceConfig.config.services.literAliases.filter(
              (item) => item.gatewayConnectionId !== gatewayConnectionId || item.alias !== aliasId
            ),
            { gatewayConnectionId, alias: aliasId, target, enabled: true, custom: false }
          ]
        }
      }
    ],
    secrets: {}
  })
  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const gateway = sources.sources.find((item) => item.source === 'gateway')
  if (!gateway?.operational) throw new Error('The configured gateway is unavailable for real team inference')
  const alias = gateway.providers
    .flatMap((provider) => provider.models)
    .find((item) => item.enabled && item.id === aliasId)
  if (!alias) throw new Error('The requested live gateway alias is not enabled')
  const model = { source: 'gateway', providerId: 'the-boss-gateway', modelId: alias.id }
  const workspaceId = await workspace(evaluate, 'Cadence C09 runtime')
  const primary = await team(
    evaluate,
    workspaceId,
    model,
    'Operate one bounded member turn with selected task input only'
  )
  const marker = `C09_TEAM_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  const assigned = await task(
    evaluate,
    primary,
    'coordinator',
    'Return the exact team marker',
    `Reply with exactly ${marker}. No quotes, markup, planning text or tools.`,
    marker
  )
  const limits = await summary(evaluate, primary)
  const reservation = {
    tokens: Math.min(1536, limits.budget.maxTokens),
    costMicrounits: Math.floor(limits.budget.maxCostMicrounits / 2),
    elapsedSeconds: Math.min(45, Math.floor(limits.budget.maxElapsedSeconds / 2))
  }
  const input = await admission(evaluate, primary, assigned, reservation)
  const admitted = await ipc(evaluate, route('admit_task'), input)
  const duplicate = await ipc(evaluate, route('admit_task'), input)
  if (duplicate.id !== admitted.id || duplicate.runId !== admitted.runId)
    throw new Error('Duplicate admission created another attempt')
  const completed = await waitFor(
    signal,
    async () => {
      const state = await summary(evaluate, primary)
      const attempt = state.attempts.find((item) => item.id === admitted.id)
      return attempt && terminal(attempt) ? { attempt, state } : null
    },
    'Bounded member inference',
    75_000
  )
  const outcome = completed.attempt.executionOutcome ?? completed.attempt.status
  if (outcome !== 'succeeded' || completed.attempt.output !== marker) {
    const reason = completed.attempt.stateReason
    const evidence = {
      attemptId: completed.attempt.id,
      runId: completed.attempt.runId,
      status: completed.attempt.status,
      executionOutcome: outcome,
      reasonCode: typeof reason === 'string' && /^[a-z][a-z0-9_-]{0,127}$/.test(reason) ? reason : null,
      reasonAvailable: Boolean(reason),
      outputPresent: completed.attempt.output != null,
      markerMatched: completed.attempt.output === marker
    }
    throw new Error('The member attempt did not satisfy the exact output contract: ' + JSON.stringify(evidence))
  }
  if (
    completed.state.attempts.length !== 1 ||
    completed.attempt.ownershipEpoch !== admitted.ownershipEpoch ||
    completed.attempt.executionEpoch !== admitted.executionEpoch
  )
    throw new Error('The member turn lost its original attempt identity')
  truthfulUsage(completed.state)
  await onPrimaryCompleted?.({ primary, model, alias, completed, admitted })
  const artifactPage = await ipc(evaluate, route('artifacts'), primary)
  const artifact = artifactPage.artifacts.find((item) => item.attemptId === admitted.id)
  if (
    !artifact ||
    artifact.content !== marker ||
    artifact.workspaceId !== workspaceId ||
    artifact.teamId !== primary.teamInstanceId
  ) {
    throw new Error('The real member output has no immutable scoped artifact')
  }
  const savedTask = (await current(evaluate, primary)).tasks.find((item) => item.id === assigned.taskId)
  if (savedTask.status !== 'succeeded' || savedTask.output !== marker)
    throw new Error('Validated output was not recorded on the authoritative task')

  const contextTask = await task(
    evaluate,
    primary,
    'worker',
    'Read only the selected shared artifact',
    `Reply with exactly the string content of the selected artifact whose id is ${artifact.id}. No quotes or markup. Do not infer its content from team input.`
  )
  // The selected artifact adds context tokens to the live provider request. Allocate
  // the remaining existing team grant instead of reusing the smaller first turn.
  const contextLimits = await summary(evaluate, primary)
  const contextReservation = {
    ...reservation,
    tokens: contextLimits.budget.maxTokens - contextLimits.committed.tokens - contextLimits.reserved.tokens
  }
  const contextInput = await admission(evaluate, primary, contextTask, contextReservation, [artifact.id])
  const contextAttempt = await ipc(evaluate, route('admit_task'), contextInput)
  const contextResult = await waitFor(
    signal,
    async () => {
      const state = await summary(evaluate, primary)
      const attempt = state.attempts.find((item) => item.id === contextAttempt.id)
      return attempt && terminal(attempt) ? { attempt, state } : null
    },
    'Explicit artifact context turn',
    60_000
  )
  if (
    (contextResult.attempt.executionOutcome ?? contextResult.attempt.status) !== 'succeeded' ||
    contextResult.attempt.output !== marker ||
    contextResult.attempt.contextArtifactIds.length !== 1 ||
    contextResult.attempt.contextArtifactIds[0] !== artifact.id
  ) {
    throw new Error('The member did not receive and return its explicitly selected scoped artifact')
  }
  truthfulUsage(contextResult.state)

  const otherWorkspaceId = await workspace(evaluate, 'Cadence C09 isolation')
  const isolated = await team(evaluate, otherWorkspaceId, model, 'Keep foreign workspace artifacts private')
  const isolatedTask = await task(
    evaluate,
    isolated,
    'coordinator',
    'Refuse foreign artifact input',
    'Return an isolated result'
  )
  const otherArtifacts = await ipc(evaluate, route('artifacts'), isolated)
  if (otherArtifacts.artifacts.length) throw new Error('An artifact leaked into a fresh workspace team')
  await expectDenied(
    evaluate,
    isolated,
    await admission(evaluate, isolated, isolatedTask, reservation, [artifact.id]),
    'Foreign workspace artifact context'
  )
  const isolatedBudget = await summary(evaluate, isolated)
  await expectDenied(
    evaluate,
    isolated,
    await admission(evaluate, isolated, isolatedTask, {
      ...reservation,
      tokens: isolatedBudget.budget.maxTokens + 1
    }),
    'Exhausted aggregate reservation'
  )
  const wrongScope = await response(evaluate, route('artifacts'), { ...primary, workspaceId: otherWorkspaceId })
  if (wrongScope?.ok || !wrongScope?.error) throw new Error('Team artifact lookup accepted another workspace')

  const controls = await team(evaluate, workspaceId, model, 'Cancel active work without releasing unknown usage')
  const controlTask = await task(
    evaluate,
    controls,
    'coordinator',
    'Bounded cancellation and revocation',
    'Write a long numbered plan of 500 steps, explaining each in detail. Do not call tools.'
  )
  await task(evaluate, controls, 'worker', 'Future admission controls', 'Wait for an operator-approved task')
  await showControls(evaluate, signal, controls, alias.id)
  const controlBudget = await summary(evaluate, controls)
  const controlInput = await admission(evaluate, controls, controlTask, {
    tokens: controlBudget.budget.maxTokens,
    costMicrounits: controlBudget.budget.maxCostMicrounits,
    elapsedSeconds: Math.min(60, controlBudget.budget.maxElapsedSeconds)
  })
  const active = await ipc(evaluate, route('admit_task'), controlInput)
  if (active.status !== 'running') throw new Error('The real control attempt was not claimed by the actor runtime')
  await waitFor(
    signal,
    () =>
      evaluate(`Boolean([...document.querySelectorAll('[data-ui="uar-team-execution"] button')]
    .find(item => item.innerText.trim() === 'Cancel run'))`),
    'Visible active attempt cancellation control',
    10_000
  )
  const beforeCancel = await current(evaluate, controls)
  const cancelled = await ipc(evaluate, route('cancel_attempt'), {
    ...controls,
    attemptId: active.id,
    commandId: randomUUID(),
    expectedTeamRevision: beforeCancel.revision,
    reason: 'C09 packaged operation cancels the original bounded actor turn'
  })
  if (
    !['cancellation_requested', 'cancelled'].includes(cancelled.status) ||
    cancelled.executionEpoch !== active.executionEpoch
  ) {
    throw new Error('Cancellation changed the original worker epoch or hid its pending outcome')
  }
  const beforeRevoke = await current(evaluate, controls)
  const revoked = await ipc(evaluate, route('revoke_member'), {
    ...controls,
    memberId: active.memberId,
    commandId: randomUUID(),
    expectedTeamRevision: beforeRevoke.revision,
    reason: 'C09 packaged operation revokes further member delivery and effects'
  })
  const member = revoked.members.find((item) => item.id === active.memberId)
  if (member?.status !== 'revoked' || member.revision <= active.memberRevision)
    throw new Error('Revocation did not advance durable membership')
  const staleAdmission = await response(evaluate, route('admit_task'), { ...controlInput, commandId: randomUUID() })
  const staleMessage = await response(evaluate, route('mailbox_send'), {
    ...controls,
    commandId: randomUUID(),
    recipientMemberId: active.memberId,
    mode: 'queue-only',
    content: 'Revoked delivery must be refused'
  })
  if (staleAdmission?.ok || staleMessage?.ok || !staleAdmission?.error || !staleMessage?.error) {
    throw new Error('An original revoked member grant still admitted work or inbox delivery')
  }
  const restart = await ipc(evaluate, 'prometheus.integration.start', { action: 'uar-restart' })
  await waitFor(
    signal,
    async () => {
      const state = await ipc(evaluate, 'prometheus.integration.snapshot', {})
      const operation = state.operations.find((item) => item.id === restart.id)
      if (['failed', 'cancelled', 'interrupted'].includes(operation?.status))
        throw new Error('The packaged UAR restart failed')
      return operation?.status === 'succeeded'
    },
    'Packaged UAR restart',
    90_000
  )
  const recoveryInput = {
    ...controls,
    commandId: randomUUID(),
    expectedTeamRevision: (await current(evaluate, controls)).revision,
    reason: 'Recover durable original team identities after packaged sidecar restart'
  }
  await ipc(evaluate, route('recover'), recoveryInput)
  await ipc(evaluate, route('recover'), recoveryInput)
  const recovered = await summary(evaluate, controls)
  const original = recovered.attempts.find((item) => item.id === active.id)
  if (
    recovered.attempts.length !== 1 ||
    original?.runId !== active.runId ||
    original.executionEpoch !== active.executionEpoch ||
    !terminal(original)
  ) {
    throw new Error('Restart recovery duplicated or lost the original cancelled/revoked attempt')
  }
  truthfulUsage(recovered)
  const restored = await summary(evaluate, primary)
  const restoredOutput = restored.attempts.find((item) => item.id === admitted.id)
  if (
    restored.attempts.length !== 2 ||
    restoredOutput?.output !== marker ||
    restoredOutput.runId !== admitted.runId ||
    !restored.attempts.some((item) => item.id === contextAttempt.id && item.output === marker)
  ) {
    throw new Error('The completed output or duplicate-admission identity did not survive restart')
  }
  truthfulUsage(restored)
  await onRestarted?.({ primary, restored, admitted })
  const restoredArtifacts = await ipc(evaluate, route('artifacts'), primary)
  if (!restoredArtifacts.artifacts.some((item) => item.id === artifact.id && item.content === marker)) {
    throw new Error('The immutable output artifact did not survive restart')
  }
  if ((await ipc(evaluate, route('artifacts'), isolated)).artifacts.length)
    throw new Error('Restart disclosed foreign artifacts')
  return {
    passed: true,
    observedBehavior: JSON.stringify({
      feature: 'C09.3 packaged bounded team runtime',
      uarVersion: sidecar.uarVersion,
      selectedGatewayAlias: alias.id,
      marker,
      attemptId: admitted.id,
      runId: admitted.runId,
      artifactId: artifact.id,
      executionOutcome: outcome,
      accountingStatus: completed.attempt.status,
      reservationHeld: completed.attempt.usage == null,
      selectedContextAttemptId: contextAttempt.id,
      selectedContext: 'only explicit artifact reproduced its unrepeated marker',
      duplicateAdmission: 'one original attempt',
      exhaustedReservation: 'refused without ledger mutation',
      artifactIsolation: 'two real workspaces; foreign context and artifact lookup refused',
      controls: 'labelled admission, budgets, cancel, recover and revoke displayed in packaged Teams UI',
      cancelledAttemptId: active.id,
      recoveredStatus: original.status,
      cancellationUsageUnknown: original.usage == null,
      restart: 'original epochs, output and scoped artifacts retained; duplicate recovery created no attempt',
      modelEvidence:
        'explicit typed starter binding selection and real actor turn; model identity is not independently exposed by team receipts'
    })
  }
}
