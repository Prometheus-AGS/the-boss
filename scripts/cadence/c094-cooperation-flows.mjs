import { randomUUID } from 'node:crypto'

import { drive, end, requireCooperation, safeAttempt, selector, toolEvidence } from './c094-cooperation-driver.mjs'
import { admission, current, ipc, route, summary, task } from './uar-team-operation-tools.mjs'

export function failure(code, stage, state) {
  const error = new Error(code)
  error.operationEvidence = {
    stage,
    attempts: state?.attempts?.map(safeAttempt) ?? [],
    waits:
      state?.waits?.map((wait) => ({ waitId: wait.waitId, state: wait.state, reasonCode: wait.reasonCode ?? null })) ??
      []
  }
  return error
}

export async function startFlow(evaluate, fixture, plan, label) {
  const selected = selector(fixture)
  const assignment = await task(evaluate, selected, 'coordinator', label, plan.instruction, plan.final)
  const input = await admission(evaluate, selected, assignment, plan.initial)
  const initial = await ipc(evaluate, route('admit_task'), input)
  return { fixture, plan, initial, taskId: assignment.taskId }
}

export async function completeFlow({ evaluate, signal, host, flow, beforeApproval, onState, description }) {
  const { fixture, plan, initial, taskId } = flow
  const driven = await drive({
    evaluate,
    signal,
    host,
    fixture,
    beforeApproval,
    onState,
    description,
    predicate(state) {
      const prior = state.attempts.find((attempt) => attempt.id === initial.id)
      if (prior && end(prior) && prior.status !== 'yielded')
        throw failure('C094_COORDINATOR_DID_NOT_YIELD', description, state)
      const continuation = state.continuations.find((item) => item.previousAttemptId === initial.id)
      const resumed = state.attempts.find((attempt) => attempt.id === continuation?.continuationAttemptId)
      if (!resumed || !end(resumed)) return false
      return resumed
    }
  })
  const state = driven.state
  const original = state.attempts.find((attempt) => attempt.id === initial.id)
  const exact = requireCooperation(
    state,
    original,
    taskId,
    plan.targets.map((target) => target.outcome)
  )
  for (const target of plan.targets.filter((item) => item.outcome === 'failed')) {
    const attempt = state.attempts.find((item) => item.taskId === target.taskId)
    if (attempt?.stateReason !== 'team_output_contract_rejected') {
      throw failure('C094_EXPECTED_REAL_OUTPUT_CONTRACT_FAILURE_MISSING', description, state)
    }
  }
  if (
    exact.resumed.status !== 'succeeded' ||
    exact.resumed.output !== plan.final ||
    original.effectDisposition !== 'confirmed'
  )
    throw failure('C094_CONTINUATION_OUTPUT_CONTRACT_FAILED', description, state)
  const rosterIds = new Set([fixture.coordinatorId, ...fixture.workerIds])
  for (const context of state.contextReceipts) {
    if (
      context.authority.workspaceId !== fixture.workspaceId ||
      context.authority.teamId !== fixture.teamInstanceId ||
      context.authority.binding.id !== fixture.bindingId ||
      context.authority.binding.revision !== fixture.bindingRevision ||
      context.teamInstructions?.digest !== fixture.instructions?.digest ||
      context.teamInstructions?.text !== fixture.instructions?.text ||
      JSON.stringify(context.instructionOrder) !==
        JSON.stringify(['host-policy', 'team-instructions', 'member-instructions', 'task-instructions']) ||
      context.coordinatorMemberId !== fixture.coordinatorId ||
      !rosterIds.has(context.self.memberId) ||
      context.roster.some((member) => !rosterIds.has(member.memberId)) ||
      context.selections.some((selection) => selection.truncated || selection.selectedBytes !== selection.originalBytes)
    ) {
      throw failure('C094_SELECTED_CONTEXT_SCOPE_OR_INSTRUCTION_MISMATCH', description, state)
    }
  }
  const delegated = state.commandReceipts.filter(
    (receipt) => receipt.operation === 'team_delegate' && receipt.senderAttemptId === initial.id
  )
  if (
    delegated.length !== plan.targets.length ||
    plan.targets.some((target) => !delegated.some((receipt) => receipt.taskId === target.taskId))
  ) {
    throw failure('C094_DELEGATION_REPLAY_OR_TASK_IDENTITY_MISMATCH', description, state)
  }
  const evidence = await toolEvidence(host, fixture, original)
  for (const name of ['team_roster', 'team_delegate', 'team_wait']) {
    if (!evidence.some((entry) => entry.toolName === name && entry.state === 'succeeded')) {
      throw failure('C094_ACTUAL_NATIVE_TOOL_EVIDENCE_MISSING', description, state)
    }
  }
  if (
    plan.duplicate &&
    new Set(
      evidence
        .filter((entry) => entry.toolName === 'team_delegate' && entry.state === 'succeeded')
        .map((entry) => entry.invocationId)
    ).size <
      plan.targets.length + 1
  ) {
    throw failure('C094_ACTUAL_DELEGATE_REPLAY_CALL_MISSING', description, state)
  }
  const artifacts = await ipc(evaluate, route('artifacts'), selector(fixture))
  const output = artifacts.artifacts.filter((artifact) => artifact.attemptId === exact.resumed.id)
  if (output.length !== 1 || output[0].content !== plan.final)
    throw failure('C094_RESUMED_ARTIFACT_MISSING', description, state)
  const peers = await ipc(evaluate, route('peer_messages'), selector(fixture))
  for (const { message, delivery } of peers.messages) {
    if (
      message.teamId !== fixture.teamInstanceId ||
      message.workspaceId !== fixture.workspaceId ||
      !rosterIds.has(message.senderMemberId) ||
      !rosterIds.has(message.recipientMemberId) ||
      message.senderAttemptId === undefined ||
      message.messageId !== delivery.messageId
    ) {
      throw failure('C094_PEER_MESSAGE_PROVENANCE_MISMATCH', description, state)
    }
  }
  const workerMessages = peers.messages.filter(
    ({ message }) => message.mode === 'queue-only' && message.recipientMemberId === fixture.coordinatorId
  )
  if (
    plan.send &&
    plan.targets
      .filter((target) => target.outcome !== 'cancelled')
      .some(
        (target) =>
          !workerMessages.some(
            ({ message }) =>
              message.senderAttemptId === state.attempts.find((attempt) => attempt.taskId === target.taskId)?.id
          )
      )
  ) {
    throw failure('C094_ACTUAL_WORKER_MESSAGE_MISSING', description, state)
  }
  if (
    plan.targets.some((target) => target.outcome !== 'cancelled') &&
    workerMessages.some(
      ({ delivery }) =>
        delivery.status !== 'consumed' || delivery.selectedAttemptId !== exact.resumed.id || !delivery.consumedAt
    )
  ) {
    throw failure('C094_MESSAGE_SELECTION_NOT_CONSUMED_BY_CONTINUATION', description, state)
  }
  return {
    state,
    exact,
    receipt: {
      case: description,
      workspaceId: fixture.workspaceId,
      teamId: fixture.teamInstanceId,
      bindingId: fixture.bindingId,
      fixtureBudget: state.budget,
      reservations: {
        initial: plan.initial,
        targets: plan.targets.map((target) => target.args.reservation),
        continuation: plan.waitArgs.continuationReservation
      },
      initial: safeAttempt(original),
      targets: plan.targets.map((target) =>
        safeAttempt(state.attempts.find((attempt) => attempt.taskId === target.taskId))
      ),
      resumed: safeAttempt(exact.resumed),
      waitId: exact.wait.waitId,
      continuationUniquenessKey: exact.continuation.uniquenessKey,
      targetOutcomes: exact.continuation.targetOutcomes,
      contextInstructionsDigest: exact.context.teamInstructions.digest,
      contextCountQuality: exact.context.countQuality,
      selectedArtifactIds: exact.continuation.selectedArtifactIds,
      artifactId: output[0].id,
      nativeToolEvidence: evidence,
      messageReceipts: peers.messages.map(({ message, delivery }) => ({
        messageId: message.messageId,
        senderMemberId: message.senderMemberId,
        recipientMemberId: message.recipientMemberId,
        mode: message.mode,
        status: delivery.status,
        selectedAttemptId: delivery.selectedAttemptId ?? null,
        consumed: Boolean(delivery.consumedAt)
      }))
    }
  }
}

export async function completeDenied({
  evaluate,
  signal,
  host,
  fixture,
  plan,
  label,
  beforeApproval,
  tool = 'team_delegate'
}) {
  const flow = await startFlow(evaluate, fixture, plan, label)
  const { state } = await drive({
    evaluate,
    signal,
    host,
    fixture,
    beforeApproval,
    description: label,
    predicate(value) {
      return value.attempts.some((attempt) => attempt.id === flow.initial.id && end(attempt))
    }
  })
  const actual = state.attempts.find((attempt) => attempt.id === flow.initial.id)
  const evidence = await toolEvidence(host, fixture, actual)
  if (
    actual.status !== 'succeeded' ||
    actual.output !== plan.final ||
    !evidence.some((entry) => entry.toolName === tool && ['failed', 'denied'].includes(entry.state)) ||
    state.waits.length ||
    state.continuations.length ||
    (tool === 'team_delegate' && state.commandReceipts.some((receipt) => receipt.operation === 'team_delegate'))
  ) {
    throw failure('C094_NATIVE_REFUSAL_NOT_PROVEN', label, state)
  }
  return {
    flow,
    state,
    receipt: {
      case: label,
      teamId: fixture.teamInstanceId,
      workspaceId: fixture.workspaceId,
      nativeToolEvidence: evidence,
      attempt: safeAttempt(actual),
      noWaitOrContinuation: true,
      acceptedDelegations: state.commandReceipts.filter((receipt) => receipt.operation === 'team_delegate').length
    }
  }
}

export async function recover(evaluate, fixture) {
  const body = {
    ...selector(fixture),
    commandId: randomUUID(),
    expectedTeamRevision: (await current(evaluate, fixture)).revision,
    reason: 'C094 recover exact durable wait and delegated task through authenticated owner'
  }
  await ipc(evaluate, route('recover'), body)
  await ipc(evaluate, route('recover'), body)
  return summary(evaluate, selector(fixture))
}
