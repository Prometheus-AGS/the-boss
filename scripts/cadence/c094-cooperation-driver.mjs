import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import { current, ipc, route, summary, truthfulUsage } from './uar-team-operation-tools.mjs'

export const end = (attempt) => ['succeeded', 'failed', 'cancelled', 'uncertain', 'yielded'].includes(attempt.status)
export const teamPath = (fixture) =>
  '/api/v1/collaboration/team-instances/' + encodeURIComponent(fixture.teamInstanceId)
export const selector = (fixture) => ({ workspaceId: fixture.workspaceId, teamInstanceId: fixture.teamInstanceId })

export function safeAttempt(attempt) {
  return {
    attemptId: attempt.id,
    runId: attempt.runId,
    taskId: attempt.taskId,
    memberId: attempt.memberId,
    rootId: attempt.rootId,
    approvalScopeId: attempt.approvalScopeId,
    status: attempt.status,
    executionOutcome: attempt.executionOutcome ?? null,
    effectDisposition: attempt.effectDisposition,
    accountingState: attempt.accountingState,
    diagnostic: attempt.diagnostic
      ? {
          code: attempt.diagnostic.code,
          protectedDiagnosticRef: attempt.diagnostic.protectedDiagnosticRef ?? null
        }
      : null
  }
}

/** Owner approval of actual bounded team operations, not an invented model tool call. */
export async function approveTeamCalls({ host, fixture, state, approved, beforeApproval }) {
  for (const attempt of state.attempts.filter((item) => item.status === 'running')) {
    const value = await host.trustedRequest({
      workspaceId: fixture.workspaceId,
      method: 'GET',
      path: `/api/uar/runs/${encodeURIComponent(attempt.runId)}/tool-approval/pending`
    })
    const pending = value.pending
    if (!pending || approved.has(pending.approvalId)) continue
    if (!['team_send', 'team_delegate'].includes(pending.name)) throw new Error('C094_UNEXPECTED_APPROVAL_TOOL')
    const args = JSON.parse(pending.argumentsJson)
    if (pending.name === 'team_delegate' && (args.reservation.tokens > 16000 || args.task.role !== 'worker')) {
      throw new Error('C094_APPROVAL_SCOPE_REFUSED')
    }
    if ((await beforeApproval?.({ attempt, pending, args, state })) === false) continue
    const result = await host.trustedRequest({
      workspaceId: fixture.workspaceId,
      method: 'POST',
      path: `/api/uar/runs/${encodeURIComponent(attempt.runId)}/tool-approval`,
      body: { approved: true, approval_id: pending.approvalId }
    })
    if (!result.resolved) throw new Error('C094_ACTUAL_APPROVAL_UNRESOLVED')
    approved.add(pending.approvalId)
  }
}

export async function drive({
  evaluate,
  signal,
  host,
  fixture,
  predicate,
  beforeApproval,
  onState,
  description,
  timeoutMs = 240_000,
  read = () => summary(evaluate, selector(fixture))
}) {
  const deadline = Date.now() + timeoutMs
  const approved = new Set()
  let last
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    last = await read()
    truthfulUsage(last)
    const running = last.attempts.filter((attempt) => ['running', 'cancellation_requested'].includes(attempt.status))
    if (running.length > 1) throw new Error('C094_ONE_SLOT_TEAM_CAPACITY_VIOLATED')
    await onState?.(last)
    const result = await predicate(last)
    if (result) return { state: last, result, approved: [...approved] }
    await approveTeamCalls({ host, fixture, state: last, approved, beforeApproval })
    await delay(200, undefined, { signal })
  }
  const error = new Error(`${description}: C094_OPERATION_WINDOW_EXCEEDED`)
  error.operationEvidence = {
    stage: description,
    attempts: last?.attempts.map(safeAttempt) ?? [],
    waitStates:
      last?.waits?.map((wait) => ({ waitId: wait.waitId, state: wait.state, reasonCode: wait.reasonCode ?? null })) ??
      []
  }
  throw error
}

export async function cancel({ evaluate, fixture, attempt, reason }) {
  await ipc(evaluate, route('cancel_attempt'), {
    workspaceId: fixture.workspaceId,
    teamInstanceId: fixture.teamInstanceId,
    attemptId: attempt.id,
    commandId: randomUUID(),
    expectedTeamRevision: (await current(evaluate, fixture)).revision,
    reason
  })
}

export async function toolEvidence(host, fixture, attempt) {
  const page = await host.trustedRequest({
    workspaceId: fixture.workspaceId,
    method: 'GET',
    path: `/api/uar/runs/${encodeURIComponent(attempt.runId)}/tool-admission-evidence`
  })
  return page.records.map((record) => ({
    evidenceId: record.evidence_id,
    invocationId: record.invocation_id,
    runId: record.run_id,
    toolName: record.tool_name,
    state: record.state,
    occurredAt: record.occurred_at
  }))
}

export function requireCooperation(state, initial, taskId, outcomes) {
  const waits = state.waits.filter((wait) => wait.authority.attemptId === initial.id)
  const continuations = state.continuations.filter((item) => item.previousAttemptId === initial.id)
  if (waits.length !== 1 || continuations.length !== 1 || waits[0].state !== 'resumed') {
    throw new Error('C094_ONE_DURABLE_WAIT_AND_CONTINUATION_REQUIRED')
  }
  const [wait] = waits
  const [continuation] = continuations
  const resumed = state.attempts.find((attempt) => attempt.id === continuation.continuationAttemptId)
  const context = state.contextReceipts.find((receipt) => receipt.authority.attemptId === resumed?.id)
  if (
    !resumed ||
    resumed.taskId !== taskId ||
    resumed.memberId !== initial.memberId ||
    resumed.runId === initial.runId ||
    !resumed.rootId ||
    resumed.rootId === initial.rootId ||
    resumed.approvalScopeId === initial.approvalScopeId ||
    resumed.approvalScopeId !== resumed.rootId ||
    continuation.runId !== resumed.runId ||
    continuation.rootId !== resumed.rootId ||
    !context ||
    context.rootId !== resumed.rootId ||
    context.approvalScopeId !== resumed.approvalScopeId ||
    context.targetOutcomeDataTrust !== 'untrusted-attributed-data' ||
    JSON.stringify(context.targetOutcomes) !== JSON.stringify(continuation.targetOutcomes) ||
    JSON.stringify(wait.wakeOutcomes) !== JSON.stringify(continuation.targetOutcomes)
  ) {
    throw new Error('C094_FRESH_CONTINUATION_CONTEXT_PROVENANCE_MISMATCH')
  }
  if (wait.targetTaskIds.length !== outcomes.length || continuation.targetOutcomes.length !== outcomes.length) {
    throw new Error('C094_REQUIRED_TARGET_OUTCOME_MISSING')
  }
  continuation.targetOutcomes.forEach((outcome, index) => {
    if (
      outcome.taskId !== wait.targetTaskIds[index] ||
      outcome.executionOutcome !== outcomes[index] ||
      outcome.effectDisposition !== 'confirmed' ||
      (outcomes[index] !== 'succeeded' && outcome.artifactIds.length !== 0)
    ) {
      throw new Error('C094_ORDERED_TERMINAL_OUTCOME_MISMATCH')
    }
  })
  return { wait, continuation, resumed, context }
}
