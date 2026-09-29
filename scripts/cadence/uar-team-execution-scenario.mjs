import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const route = (operation) => `prometheus.uar.teams.${operation}`
const terminal = (attempt) => ['succeeded', 'failed', 'cancelled', 'uncertain'].includes(attempt.status)

async function response(evaluate, name, input) {
  return evaluate(`window.api.ipcApi.request(${JSON.stringify(name)}, ${JSON.stringify(input)})`)
}

async function ipc(evaluate, name, input) {
  const result = await response(evaluate, name, input)
  if (!result?.ok) throw new Error(`${name} refused the operation; inspect isolated application logs`)
  return result.data
}

async function waitFor(signal, read, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const value = await read()
    if (value) return value
    await delay(250, undefined, { signal })
  }
  throw new Error(`${description} did not finish within its delivery window`)
}

async function workspace(evaluate, label) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'boss-c09-runtime-'))
  const result = await evaluate(`window.api.dataApi.request({
    id: ${JSON.stringify(randomUUID())}, method: 'POST', path: '/agent-workspaces',
    body: ${JSON.stringify({ path: directory, name: label })}
  })`)
  if (result?.error || !result?.data?.id) throw new Error('Boss could not create an isolated team workspace')
  return result.data.id
}

async function team(evaluate, workspaceId, model, label) {
  const binding = await ipc(evaluate, route('setup_starter'), { workspaceId, model })
  const state = await ipc(evaluate, route('snapshot'), { workspaceId })
  if (!state.capabilities.execution || !binding.activationSupported) {
    throw new Error('The packaged UAR does not advertise executable team bindings')
  }
  const definition = state.definitions.find((item) => item.package.digest === binding.package.digest)
  if (!definition) throw new Error('The selected starter binding has no immutable team definition')
  const instance = await ipc(evaluate, route('create'), {
    workspaceId,
    commandId: randomUUID(),
    deploymentBindingId: binding.id,
    teamDefinition: { id: definition.id, version: definition.version, digest: definition.digest },
    input: { brief: label }
  })
  return { workspaceId, teamInstanceId: instance.id }
}

async function current(evaluate, selector) {
  const snapshot = await ipc(evaluate, route('snapshot'), { workspaceId: selector.workspaceId })
  const instance = snapshot.instances.find((item) => item.id === selector.teamInstanceId)
  if (!instance) throw new Error('The team disappeared from its authoritative workspace')
  return instance
}

async function task(evaluate, selector, role, title, instruction, marker) {
  const instance = await current(evaluate, selector)
  const taskId = randomUUID()
  const updated = await ipc(evaluate, route('add_task'), {
    ...selector,
    commandId: randomUUID(),
    taskId,
    expectedTeamRevision: instance.revision,
    title,
    role,
    input: { instruction },
    outputContract: marker ? { type: 'string', const: marker } : { type: 'string' },
    dependsOn: []
  })
  const member = updated.members.find((item) => item.role === role && item.status !== 'revoked')
  const created = updated.tasks.find((item) => item.id === taskId)
  if (!member || !created) throw new Error('The starter team did not materialize its task and member')
  await ipc(evaluate, route('claim_task'), {
    ...selector,
    taskId,
    commandId: randomUUID(),
    expectedTeamRevision: updated.revision,
    expectedTaskRevision: created.revision,
    memberId: member.id
  })
  return { taskId, memberId: member.id }
}

async function admission(evaluate, selector, assignment, reservation, contextArtifactIds = []) {
  const instance = await current(evaluate, selector)
  const assigned = instance.tasks.find((item) => item.id === assignment.taskId)
  return {
    ...selector,
    ...assignment,
    commandId: randomUUID(),
    expectedTeamRevision: instance.revision,
    expectedTaskRevision: assigned.revision,
    reservation,
    contextArtifactIds
  }
}

async function summary(evaluate, selector) {
  return ipc(evaluate, route('execution'), selector)
}

function truthfulUsage(state) {
  const unresolved = state.attempts.filter((item) => item.usage == null)
  const sums = { tokens: 0, costMicrounits: 0, elapsedSeconds: 0 }
  for (const item of unresolved) {
    for (const name of Object.keys(sums)) sums[name] += item.reservation[name]
    if (item.status === 'uncertain' && !state.uncertainAttempts.includes(item.id)) {
      throw new Error('Unknown team usage is absent from the uncertainty projection')
    }
  }
  for (const name of Object.keys(sums)) {
    if (state.reserved[name] !== sums[name])
      throw new Error('An unresolved reservation was silently released or counted twice')
  }
  if (
    state.committed.tokens + state.reserved.tokens > state.budget.maxTokens ||
    state.committed.costMicrounits + state.reserved.costMicrounits > state.budget.maxCostMicrounits ||
    state.committed.elapsedSeconds + state.reserved.elapsedSeconds > state.budget.maxElapsedSeconds
  ) {
    throw new Error('Aggregate team usage exceeds its authoritative budget')
  }
}

async function expectDenied(evaluate, selector, input, description) {
  const before = await summary(evaluate, selector)
  const result = await response(evaluate, route('admit_task'), input)
  if (result?.ok || !result?.error) throw new Error(`${description} was admitted`)
  const after = await summary(evaluate, selector)
  if (
    after.attempts.length !== before.attempts.length ||
    JSON.stringify(after.reserved) !== JSON.stringify(before.reserved)
  ) {
    throw new Error(`${description} created an attempt or reservation`)
  }
}

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

export default async function run({ evaluate, signal }) {
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
    providerId: sourceProvider ?? 'kimi-for-coding',
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
  const contextInput = await admission(evaluate, primary, contextTask, reservation, [artifact.id])
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
