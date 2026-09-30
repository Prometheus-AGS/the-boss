import { randomUUID } from 'node:crypto'

import { cancel, drive, end, safeAttempt, selector, teamPath, toolEvidence } from './c094-cooperation-driver.mjs'
import { failure, startFlow } from './c094-cooperation-flows.mjs'
import { cooperationPlan, marker } from './c094-cooperation-prompts.mjs'
import { admission, current, ipc, response, route, summary, task } from './uar-team-operation-tools.mjs'

/** Actual owner assignment before a real model turn, with the existing private aggregate grant. */
async function memberTask(evaluate, fixture, memberId, instruction, output) {
  const assigned = await task(
    evaluate,
    selector(fixture),
    memberId === fixture.coordinatorId ? 'coordinator' : 'worker',
    'C094 current communication authority',
    instruction,
    output
  )
  if (assigned.memberId !== memberId) {
    const state = await current(evaluate, fixture)
    const selected = state.tasks.find((item) => item.id === assigned.taskId)
    await ipc(evaluate, route('reassign_task'), {
      ...selector(fixture),
      taskId: assigned.taskId,
      commandId: randomUUID(),
      expectedTeamRevision: state.revision,
      expectedTaskRevision: selected.revision,
      memberId
    })
    assigned.memberId = memberId
  }
  return assigned
}

async function operateMember({ evaluate, signal, host, fixture, memberId, instruction, output, tokens = 5000 }) {
  const assigned = await memberTask(evaluate, fixture, memberId, instruction, output)
  const state = await summary(evaluate, selector(fixture))
  const reservation = {
    tokens: Math.min(tokens, state.budget.maxTokens - state.committed.tokens - state.reserved.tokens),
    costMicrounits: Math.floor(
      (state.budget.maxCostMicrounits - state.committed.costMicrounits - state.reserved.costMicrounits) / 3
    ),
    elapsedSeconds: Math.min(
      100,
      state.budget.maxElapsedSeconds - state.committed.elapsedSeconds - state.reserved.elapsedSeconds
    )
  }
  const admitted = await ipc(
    evaluate,
    route('admit_task'),
    await admission(evaluate, selector(fixture), assigned, reservation)
  )
  const completed = await drive({
    evaluate,
    signal,
    host,
    fixture,
    description: 'current-team-authority',
    predicate(value) {
      return value.attempts.some((attempt) => attempt.id === admitted.id && end(attempt))
    }
  })
  const attempt = completed.state.attempts.find((item) => item.id === admitted.id)
  if (attempt.status !== 'succeeded' || attempt.output !== output)
    throw failure('C094_AUTHORITY_TURN_OUTPUT_FAILED', 'current-team-authority', completed.state)
  const context = await ipc(evaluate, route('context'), { ...selector(fixture), attemptId: attempt.id })
  return { attempt, context, state: completed.state, evidence: await toolEvidence(host, fixture, attempt) }
}

function requireTool(evidence, name, states) {
  if (!evidence.some((entry) => entry.toolName === name && states.includes(entry.state))) {
    throw new Error('C094_REQUIRED_ACTUAL_AUTHORITY_TOOL_EVIDENCE_MISSING')
  }
}

export async function directedAuthority({ evaluate, signal, host, fixture }) {
  const [senderId, forbiddenId] = fixture.workerIds
  const firstOutput = marker('AUTHORITY_SENDER')
  const firstSend = {
    commandId: randomUUID(),
    recipient: { memberId: fixture.coordinatorId },
    payload: { text: 'C094 queued sender evidence; sending does not activate the coordinator.', artifactIds: [] }
  }
  const sender = await operateMember({
    evaluate,
    signal,
    host,
    fixture,
    memberId: senderId,
    tokens: 6500,
    output: firstOutput,
    instruction: `Call team_roster with {"limit":50}; it must not contain ${forbiddenId}. Call team_send once with exactly ${JSON.stringify(firstSend)}. Then reply exactly ${firstOutput}. No other tools.`
  })
  requireTool(sender.evidence, 'team_roster', ['succeeded'])
  requireTool(sender.evidence, 'team_send', ['succeeded'])
  if (sender.context.roster.some((member) => member.memberId === forbiddenId))
    throw new Error('C094_FORBIDDEN_SAME_ROLE_MEMBER_IN_ROSTER')
  const messagesBefore = await ipc(evaluate, route('peer_messages'), selector(fixture))
  const queued = messagesBefore.messages.find(({ message }) => message.senderAttemptId === sender.attempt.id)
  if (
    !queued ||
    queued.delivery.status !== 'accepted' ||
    sender.state.attempts.some((attempt) => attempt.memberId === fixture.coordinatorId)
  ) {
    throw failure('C094_QUEUE_ONLY_MESSAGE_ACTIVATED_TURN', 'same-team-authority', sender.state)
  }
  const artifacts = await ipc(evaluate, route('artifacts'), selector(fixture))
  const artifact = artifacts.artifacts.find((item) => item.attemptId === sender.attempt.id)
  if (!artifact) throw new Error('C094_REAL_SENDER_ARTIFACT_MISSING')
  const forbiddenAssignment = await memberTask(
    evaluate,
    fixture,
    forbiddenId,
    'Return only selected artifact data.',
    marker('NEVER_DISCLOSED')
  )
  const beforeRead = await summary(evaluate, selector(fixture))
  const readResult = await response(
    evaluate,
    route('admit_task'),
    await admission(
      evaluate,
      selector(fixture),
      forbiddenAssignment,
      { tokens: 2000, costMicrounits: 5000, elapsedSeconds: 30 },
      [artifact.id]
    )
  )
  const afterRead = await summary(evaluate, selector(fixture))
  const refused = afterRead.attempts.filter((attempt) => !beforeRead.attempts.some((item) => item.id === attempt.id))
  if (
    readResult?.ok ||
    !readResult?.error ||
    refused.length !== 1 ||
    refused[0].status !== 'failed' ||
    refused[0].stateReason !== 'member_binding_or_selected_context_denied_before_dispatch' ||
    refused[0].usage?.tokens !== 0 ||
    afterRead.contextReceipts.some((receipt) => receipt.authority.attemptId === refused[0].id)
  ) {
    throw failure('C094_SAME_TEAM_DIRECTED_ARTIFACT_READ_NOT_REFUSED', 'same-team-authority', afterRead)
  }
  const forbiddenOutput = marker('SEND_DENIED')
  const forbiddenSend = {
    commandId: randomUUID(),
    recipient: { memberId: senderId },
    payload: { text: 'This missing worker-to-worker edge must refuse delivery.', artifactIds: [] }
  }
  const forbidden = await operateMember({
    evaluate,
    signal,
    host,
    fixture,
    memberId: forbiddenId,
    output: forbiddenOutput,
    instruction: `Call team_roster with {"limit":50}; peer ${senderId} must be absent. Call team_send exactly once with ${JSON.stringify(forbiddenSend)}. Expect the missing directed edge to refuse it. Do not retry or change recipient. Then reply exactly ${forbiddenOutput}.`
  })
  requireTool(forbidden.evidence, 'team_roster', ['succeeded'])
  requireTool(forbidden.evidence, 'team_send', ['failed', 'denied'])
  const beforeRevoke = await current(evaluate, fixture)
  await ipc(evaluate, route('revoke_member'), {
    ...selector(fixture),
    commandId: randomUUID(),
    expectedTeamRevision: beforeRevoke.revision,
    memberId: senderId,
    reason: 'C094 remove current sender communication authority'
  })
  let oldContextRefused
  try {
    await fixture.request('GET', teamPath(fixture) + '/attempts/' + encodeURIComponent(sender.attempt.id) + '/context')
  } catch (error) {
    oldContextRefused = { status: error.status, code: error.code }
  }
  if (!oldContextRefused || ![403, 409].includes(oldContextRefused.status))
    throw new Error('C094_REVOKED_ROSTER_CONTEXT_STILL_DISCLOSED')
  const output = marker('CURRENT_ROSTER_INBOX')
  const coordinator = await operateMember({
    evaluate,
    signal,
    host,
    fixture,
    memberId: fixture.coordinatorId,
    output,
    instruction: `Call team_roster with {"limit":50}. Member ${senderId} has been revoked and must be absent. Your selected messages must not contain revoked sender message ${queued.message.messageId}. If both conditions hold reply exactly ${output}. Do not delegate, send or wait.`
  })
  requireTool(coordinator.evidence, 'team_roster', ['succeeded'])
  const peersAfter = await ipc(evaluate, route('peer_messages'), selector(fixture))
  if (
    coordinator.context.roster.some((member) => member.memberId === senderId) ||
    coordinator.context.selections.some(
      (selection) => selection.sourceKind === 'message' && selection.sourceId === queued.message.messageId
    ) ||
    peersAfter.messages.some(({ message }) => message.messageId === queued.message.messageId) ||
    peersAfter.messages.some(({ message }) => message.recipientMemberId === senderId)
  ) {
    throw failure('C094_REVOKED_INBOX_OR_ROSTER_REMAINED_VISIBLE', 'same-team-authority', coordinator.state)
  }
  return {
    case: 'same-team-directed-read-send-roster-inbox-revocation',
    teamId: fixture.teamInstanceId,
    workspaceId: fixture.workspaceId,
    sender: safeAttempt(sender.attempt),
    forbiddenReader: safeAttempt(refused[0]),
    forbiddenSend: safeAttempt(forbidden.attempt),
    coordinator: safeAttempt(coordinator.attempt),
    artifactId: artifact.id,
    queuedMessageId: queued.message.messageId,
    oldContextRefused,
    queueOnlyDidNotActivate: true,
    revokedMessageExcluded: true,
    revokedMemberExcluded: true,
    nativeToolEvidence: [...sender.evidence, ...forbidden.evidence, ...coordinator.evidence]
  }
}

export async function commandConflict({ evaluate, signal, host, fixture }) {
  const output = marker('COMMAND_CONFLICT')
  const first = {
    commandId: randomUUID(),
    recipient: { memberId: fixture.coordinatorId },
    payload: { text: 'Original C094 accepted command payload.', artifactIds: [] }
  }
  const changed = {
    ...first,
    payload: { ...first.payload, text: 'Changed payload on the SAME command ID must refuse.' }
  }
  const turn = await operateMember({
    evaluate,
    signal,
    host,
    fixture,
    memberId: fixture.workerIds[0],
    tokens: 7500,
    output,
    instruction: `Call team_send with exactly ${JSON.stringify(first)}. Then call team_send with exactly ${JSON.stringify(changed)}. These share one commandId but have different payloads; the second must be refused. Do not retry, change the ID or claim another message. After that refusal reply exactly ${output}.`
  })
  requireTool(turn.evidence, 'team_send', ['succeeded'])
  requireTool(turn.evidence, 'team_send', ['failed', 'denied'])
  const receipts = turn.state.commandReceipts.filter((receipt) => receipt.commandId === first.commandId)
  const peers = await ipc(evaluate, route('peer_messages'), selector(fixture))
  const messages = peers.messages.filter(({ message }) => message.senderAttemptId === turn.attempt.id)
  if (
    receipts.length !== 1 ||
    receipts[0].operation !== 'team_send' ||
    messages.length !== 1 ||
    messages[0].message.messageId !== receipts[0].messageId ||
    messages[0].message.payload.text !== first.payload.text ||
    messages[0].delivery.status !== 'accepted' ||
    turn.state.waits.length ||
    turn.state.continuations.length
  ) {
    throw failure('C094_DIFFERENT_PAYLOAD_COMMAND_REPLAY_MUTATED_STATE', 'command-conflict', turn.state)
  }
  return {
    case: 'same-command-id-different-payload-refused',
    teamId: fixture.teamInstanceId,
    workspaceId: fixture.workspaceId,
    commandId: first.commandId,
    receiptDigest: receipts[0].requestDigest,
    messageId: messages[0].message.messageId,
    acceptedCommands: 1,
    acceptedMessages: 1,
    attempt: safeAttempt(turn.attempt),
    nativeToolEvidence: turn.evidence
  }
}

export async function invalidatedWait({ evaluate, signal, host, fixture }) {
  const plan = cooperationPlan(fixture, ['cancelled'], (await summary(evaluate, selector(fixture))).budget, {
    restart: true
  })
  const flow = await startFlow(evaluate, fixture, plan, 'Invalidate old wait when coordinator authority changes')
  const accepted = await drive({
    evaluate,
    signal,
    host,
    fixture,
    description: 'accepted-wait-current-authority',
    beforeApproval: ({ attempt }) => attempt.memberId === fixture.coordinatorId,
    async predicate(state) {
      if (!state.waits.some((wait) => wait.authority.attemptId === flow.initial.id && wait.state === 'waiting'))
        return false
      const worker = state.attempts.find(
        (attempt) => attempt.taskId === plan.targets[0].taskId && attempt.status === 'running'
      )
      if (!worker) return false
      const pending = await host.trustedRequest({
        workspaceId: fixture.workspaceId,
        method: 'GET',
        path: `/api/uar/runs/${encodeURIComponent(worker.runId)}/tool-approval/pending`
      })
      return pending.pending?.name === 'team_send'
    }
  })
  const before = await current(evaluate, fixture)
  const originalTask = before.tasks.find((item) => item.id === flow.taskId)
  const reassign = await response(evaluate, route('reassign_task'), {
    ...selector(fixture),
    commandId: randomUUID(),
    taskId: flow.taskId,
    expectedTeamRevision: before.revision,
    expectedTaskRevision: originalTask.revision,
    memberId: fixture.coordinatorId
  })
  if (reassign?.ok || !reassign?.error)
    throw failure('C094_WAITING_TASK_REASSIGNMENT_WAS_ACCEPTED', 'accepted-wait-current-authority', accepted.state)
  await ipc(evaluate, route('revoke_member'), {
    ...selector(fixture),
    commandId: randomUUID(),
    expectedTeamRevision: before.revision,
    memberId: fixture.coordinatorId,
    reason: 'C094 revoke waiting coordinator; old authority must never resume'
  })
  const invalidated = await drive({
    evaluate,
    signal,
    host,
    fixture,
    description: 'old-wait-invalidation',
    beforeApproval: () => false,
    predicate(state) {
      return state.waits.some((wait) => wait.waitId === accepted.state.waits[0].waitId && wait.state === 'invalidated')
    }
  })
  for (const attempt of invalidated.state.attempts.filter(
    (item) => item.memberId !== fixture.coordinatorId && !end(item)
  )) {
    await cancel({ evaluate, fixture, attempt, reason: 'C094 cancel original target after wait authority revocation' })
  }
  const settled = await drive({
    evaluate,
    signal,
    host,
    fixture,
    description: 'revoked-wait-target-join',
    beforeApproval: () => false,
    predicate(state) {
      return state.attempts.every(end)
    }
  })
  const original = settled.state.attempts.find((item) => item.id === flow.initial.id)
  const wait = settled.state.waits.find((item) => item.waitId === accepted.state.waits[0].waitId)
  if (
    wait.state !== 'invalidated' ||
    wait.reasonCode !== 'TEAM_WAIT_INVALIDATED' ||
    settled.state.continuations.length ||
    original.status !== 'yielded' ||
    original.runId !== flow.initial.runId ||
    original.rootId !== flow.initial.rootId ||
    original.approvalScopeId !== flow.initial.approvalScopeId
  ) {
    throw failure('C094_REVOKED_WAIT_RESUMED_OR_REWROTE_ORIGINAL', 'old-wait-invalidation', settled.state)
  }
  return {
    case: 'accepted-wait-reassignment-refusal-and-revocation-invalidation',
    teamId: fixture.teamInstanceId,
    workspaceId: fixture.workspaceId,
    waitId: wait.waitId,
    waitState: wait.state,
    reasonCode: wait.reasonCode,
    reassignment: 'refused while task is waiting; ready-only reassignment semantics preserved',
    revocation: 'accepted coordinator revocation invalidated exact original wait',
    original: safeAttempt(original),
    continuationCount: settled.state.continuations.length,
    terminalAttempts: settled.state.attempts.map(safeAttempt)
  }
}

export async function foreignWait({ evaluate, signal, host, source, foreign, completed }) {
  if (!completed) {
    const plan = cooperationPlan(source, ['succeeded'], (await summary(evaluate, selector(source))).budget, {
      send: false
    })
    const flow = await startFlow(evaluate, source, plan, 'Actual scoped wait for foreign read/wake refusal')
    const { completeFlow } = await import('./c094-cooperation-flows.mjs')
    completed = await completeFlow({ evaluate, signal, host, flow, description: 'isolation-scoped-wait' })
  }
  const before = await summary(evaluate, selector(source))
  const refusals = []
  for (const operation of [
    { method: 'GET', path: teamPath(source) + '/execution' },
    {
      method: 'POST',
      path: teamPath(source) + '/recover',
      body: {
        commandId: randomUUID(),
        expectedTeamRevision: (await current(evaluate, source)).revision,
        reason: 'Foreign workspace must not read, wake or recover another team wait'
      }
    }
  ]) {
    let refusal
    try {
      await host.trustedRequest({ workspaceId: foreign.workspaceId, ...operation })
    } catch (error) {
      refusal = { method: operation.method, status: error.status, code: error.code }
    }
    if (!refusal || ![403, 404, 409].includes(refusal.status))
      throw new Error('C094_FOREIGN_WAIT_READ_OR_WAKE_ACCEPTED')
    refusals.push(refusal)
  }
  const after = await summary(evaluate, selector(source))
  if (
    JSON.stringify(before.waits) !== JSON.stringify(after.waits) ||
    JSON.stringify(before.continuations) !== JSON.stringify(after.continuations) ||
    before.attempts.length !== after.attempts.length
  )
    throw failure('C094_FOREIGN_CONTROL_MUTATED_WAIT', 'foreign-wait-isolation', after)
  return {
    case: 'foreign-workspace-wait-read-and-wake-refused',
    sourceWorkspaceId: source.workspaceId,
    foreignWorkspaceId: foreign.workspaceId,
    teamId: source.teamInstanceId,
    waitId: completed.exact.wait.waitId,
    continuationAttemptId: completed.exact.resumed.id,
    refusals,
    unchangedWaitAndContinuation: true
  }
}
