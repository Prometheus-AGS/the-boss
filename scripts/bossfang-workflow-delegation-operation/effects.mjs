import fs from 'node:fs'
import path from 'node:path'
import { click } from './dashboard.mjs'
import { digest, ipc, requireFact, waitFor } from './io.mjs'
import { retainedDelegation } from './workflow.mjs'

const ui = name => '[data-ui~="uar-workflow-' + name + '"]'

export function writeInput(filename, content, marker) {
  return 'Use filesystem__write exactly once to create ' + filename + ' in the workspace with exactly ' +
    JSON.stringify(content) + '. Do not perform other writes or delegate. Await operator approval. ' +
    'If denied or cancelled stop without retrying. After a successful write reply only with ' + marker + '.'
}

export async function pending(evaluate, guest, signal, observed, prepared, directory, filename, content) {
  const current = await waitFor(signal, async () => {
    const delegation = await retainedDelegation(guest, observed.current.workflow.workflowRunId, observed.current.bossTaskId)
    return delegation.executionState === 'input_required' &&
      delegation.pendingApproval?.type === 'agui.tool_call.approval_required' ? delegation : false
  }, 'C14W_REAL_PENDING_EFFECT_UNAVAILABLE', 120000, 1000)
  const inspection = await ipc(evaluate, 'bossfang.delegated_approval.inspect', { bossTaskId: current.bossTaskId })
  const p = inspection.pending
  const effect = inspection.preparedEffect
  const expectedPath = path.join(directory, filename)
  requireFact(p && effect && inspection.contextId === prepared.hostContext.contextId &&
    current.uarTaskId === observed.current.uarTaskId && current.uarRunId === observed.current.uarRunId &&
    current.uarRootRunId === observed.current.uarRootRunId && current.selectedInstanceId === prepared.runtimeId &&
    current.delegatedHostContextId === inspection.contextId && current.runtimeEpoch === inspection.runtimeEpoch &&
    inspection.workspaceId === prepared.workspace.workspaceId && inspection.taskId === current.uarTaskId &&
    inspection.runId === current.uarRunId && inspection.bossTaskId === current.bossTaskId &&
    ['id', 'version', 'digest'].every(key => inspection.definition[key] === prepared.hostContext.definition[key]) &&
    ['id', 'revision', 'digest'].every(key => inspection.binding[key] === prepared.hostContext.binding[key]) &&
    p.approvalId === current.pendingApproval.data.approval_id && p.rootRunId === current.uarRootRunId &&
    effect.admissionId === p.admissionId && effect.toolCallId === p.toolCallId && effect.callIndex === p.callIndex &&
    effect.rootRunId === current.uarRootRunId && effect.runId === current.uarRunId,
  'C14W_PENDING_ORIGINAL_HOST_AUTHORITY_MISMATCH')
  if (effect.toolName !== 'filesystem__write' || effect.targetPath !== expectedPath ||
    effect.write?.contentSha256 !== digest(content)) {
    throw Object.assign(new Error('C14W_EFFECT_OUTSIDE_EXACT_OPERATION_SCOPE'), {
      code: 'C14W_EFFECT_OUTSIDE_EXACT_OPERATION_SCOPE',
      scopeMismatch: { expectedPathSha256: digest(expectedPath), observedPathSha256: digest(effect.targetPath ?? ''),
        expectedContentSha256: digest(content), observedContentSha256: effect.write?.contentSha256 ?? null,
        expectedToolName: 'filesystem__write', observedToolNameSha256: digest(effect.toolName) }
    })
  }
  requireFact(!fs.existsSync(expectedPath), 'C14W_EFFECT_OCCURRED_BEFORE_OPERATOR_DECISION')
  const challenge = inspection.history.records.filter(record =>
    record.issuerId === p.issuerId && record.challengeId === p.challengeId)
  requireFact(inspection.history.durable && inspection.history.runId === current.uarRootRunId &&
    challenge.length === 1 && challenge[0].state === 'pending' && challenge[0].resolvable &&
    challenge[0].admissionOwner === 'paired-host' && challenge[0].admissionId === p.admissionId &&
    challenge[0].workspaceId === prepared.workspace.workspaceId && challenge[0].rootRunId === current.uarRootRunId,
  'C14W_CANONICAL_PENDING_HOST_APPROVAL_UNAVAILABLE')
  const selector = observed.selector + ' ' + ui('approval') + '[data-approval-id=' + JSON.stringify(p.approvalId) + ']'
  await waitFor(signal, () => guest(`Boolean(document.querySelector(${JSON.stringify(selector)})?.getClientRects().length)`),
    'C14W_VISIBLE_ORIGINAL_PENDING_APPROVAL_UNAVAILABLE')
  return { selector, expectedPath, current, pending: p,
    receipt: { contextId: inspection.contextId, bossTaskId: current.bossTaskId, taskId: inspection.taskId,
      runId: inspection.runId, rootRunId: effect.rootRunId, runtimeEpoch: inspection.runtimeEpoch,
      workspaceId: inspection.workspaceId, definition: inspection.definition, binding: inspection.binding,
      pending: p, preparedEffect: { version: effect.version, admissionId: effect.admissionId,
        invocationId: effect.invocationId, toolCallId: effect.toolCallId, callIndex: effect.callIndex,
        toolName: effect.toolName, targetPathSha256: digest(effect.targetPath), contentSha256: effect.write.contentSha256,
        argumentsSha256: effect.argumentsSha256, actionDisplaySha256: effect.actionDisplaySha256 },
      absentBeforeDecision: true, durableCanonicalPending: true } }
}

export async function decide(guest, signal, pendingEffect, approved) {
  await click(guest, signal, pendingEffect.selector + ' ' + ui('approval-decision') + '[data-approved="' + approved + '"]')
}

export async function settledHistory(evaluate, signal, effect, expectedState) {
  const result = await waitFor(signal, async () => {
    const inspected = await ipc(evaluate, 'bossfang.delegated_approval.inspect', { bossTaskId: effect.current.bossTaskId })
    const record = inspected.history.records.find(record => record.issuerId === effect.pending.issuerId &&
      record.challengeId === effect.pending.challengeId)
    return record && record.state !== 'pending' ? { inspected, record } : false
  }, 'C14W_CANONICAL_HOST_DECISION_UNSETTLED', 60000, 1000)
  const { inspected, record } = result
  requireFact(inspected.contextId === effect.receipt.contextId && inspected.runId === effect.receipt.runId &&
    inspected.taskId === effect.receipt.taskId && inspected.pending === null && inspected.preparedEffect === null &&
    inspected.history.durable && inspected.history.runId === effect.receipt.rootRunId && record.state === expectedState &&
    record.admissionOwner === 'paired-host' && record.admissionId === effect.pending.admissionId &&
    record.workspaceId === effect.receipt.workspaceId && record.rootRunId === effect.receipt.rootRunId &&
    record.toolCallId === effect.pending.toolCallId, 'C14W_CANONICAL_ORIGINAL_HOST_DECISION_MISMATCH')
  requireFact(expectedState === 'cancelled' ? record.decision === null : record.decision &&
    record.decision.approved === (expectedState === 'approved'), 'C14W_CANONICAL_HUMAN_DECISION_UNAVAILABLE')
  return { durable: inspected.history.durable, runId: inspected.history.runId, issuerId: record.issuerId,
    challengeId: record.challengeId, admissionId: record.admissionId, admissionOwner: record.admissionOwner,
    toolCallId: record.toolCallId, rootRunId: record.rootRunId, state: record.state,
    decision: record.decision, updatedAt: record.updatedAt }
}

export function verifyFiles(configuration, expectedApprovedContent) {
  const entries = fs.readdirSync(configuration.workspaceDirectory).filter(name => name !== '.git').sort()
  requireFact(entries.join(',') === ['README.md', 'approved.txt'].sort().join(',') &&
    digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'README.md'))) === configuration.workspaceSha256 &&
    digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'approved.txt'))) === digest(expectedApprovedContent),
  'C14W_DISPOSABLE_WORKSPACE_EFFECT_SCOPE_MISMATCH')
  return { createdFiles: ['approved.txt'], approvedContentSha256: digest(expectedApprovedContent),
    deniedFileAbsent: true, cancelledFileAbsent: true, readmeSha256: configuration.workspaceSha256 }
}
