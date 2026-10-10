import fs from 'node:fs'
import path from 'node:path'
import { ipc, visibleRecord, workRoute } from './clients.mjs'
import { canonical, pendingWrite, stopAttempt } from './scenario.mjs'
import { digest, requireFact, route, same, waitFor } from './io.mjs'

export async function correctiveScenario(evaluate, signal, configuration, evidence) {
  const { prior, workspaceDirectory, marker } = configuration
  const selector = prior.selector
  evidence.stage = 'preserved-profile-and-authority'
  await ipc(evaluate, 'navigation.open_route_in_main', { path: workRoute(selector) })
  const snapshot = await ipc(evaluate, route('snapshot'), { workspaceId: selector.workspaceId })
  requireFact(snapshot.executionProfileStage === 'qualified' && snapshot.capabilities.approvals,
    'C142_NORMAL_PACKAGED_PROFILE_UNQUALIFIED')
  const first = await canonical(evaluate, selector, prior.challenge)
  const unchangedDecision = (record) => record.state === prior.decision.state &&
    record.decision?.decisionId === prior.decision.decisionId &&
    record.decision.approved === prior.decision.approved &&
    digest(record.decision.actor) === prior.decision.actorSha256
  requireFact(unchangedDecision(first), 'C142_PRESERVED_DECISION_CHANGED')
  await visibleRecord(evaluate, signal, first)
  const before = (await ipc(evaluate, route('execution'), selector)).attempts.map(item => item.id)
  const originalFile = path.join(workspaceDirectory, 'decision.txt')
  const originalEffect = fs.existsSync(originalFile)
    ? { sha256: digest(fs.readFileSync(originalFile)), modified: fs.statSync(originalFile).mtimeMs }
    : null
  const fileName = marker + '.txt'
  const target = path.join(workspaceDirectory, fileName)
  requireFact(!fs.existsSync(target), 'C142_CORRECTIVE_TARGET_ALREADY_EXISTS')
  evidence.stage = 'new-pending-write-and-visible-stop'
  const pending = await pendingWrite(evaluate, signal, selector, configuration, fileName)
  evidence.attemptId = pending.attempt.id
  evidence.challenge = { issuerId: pending.pending.issuerId, challengeId: pending.pending.challengeId }
  const live = await canonical(evaluate, selector, pending.pending)
  requireFact(live.state === 'pending' && live.resolvable && live.decision === null,
    'C142_CORRECTIVE_CHALLENGE_NOT_PENDING')
  await visibleRecord(evaluate, signal, live)
  const stopped = await stopAttempt(evaluate, signal, selector, pending)
  requireFact(!stopped.resolvable && !fs.existsSync(target), 'C142_CANCELLED_EFFECT_OCCURRED')
  const rendered = await waitFor(signal, async () => {
    const record = await visibleRecord(evaluate, signal, stopped)
    return record.state === 'cancelled' && record.durable === 'true' && !record.decisionId ? record : false
  }, 'C142_CANCELLED_RECORD_NOT_VISIBLE')
  evidence.cancelled = rendered
  evidence.checks.push('new-pending-write-visible-stop-durable-cancellation-without-decision')
  const execution = await ipc(evaluate, route('execution'), selector)
  requireFact(execution.attempts.find(item => item.id === pending.attempt.id)?.status === 'cancelled',
    'C142_CORRECTIVE_ATTEMPT_NOT_CANCELLED')
  const ids = execution.attempts.map(item => item.id)
  requireFact(ids.length === before.length + 1 && before.every(id => ids.includes(id)) && ids.includes(pending.attempt.id),
    'C142_CORRECTIVE_SCOPE_CREATED_EXTRA_ATTEMPTS')
  evidence.stage = 'runtime-restart-and-persistence'
  const restart = await ipc(evaluate, 'prometheus.integration.start', { action: 'uar-restart' })
  await waitFor(signal, async () => {
    const state = await ipc(evaluate, 'prometheus.integration.snapshot', {})
    const operation = state.operations.find(item => item.id === restart.id)
    requireFact(!['failed', 'cancelled', 'interrupted'].includes(operation?.status), 'C142_RUNTIME_RESTART_FAILED')
    return operation?.status === 'succeeded'
  }, 'C142_RUNTIME_RESTART_UNAVAILABLE', 90000, 1000)
  const retained = await canonical(evaluate, selector, pending.pending)
  requireFact(retained.state === 'cancelled' && retained.decision === null && !retained.resolvable,
    'C142_RESTART_LOST_CANCELLATION')
  const firstAfter = await canonical(evaluate, selector, prior.challenge)
  requireFact(unchangedDecision(firstAfter) && same(firstAfter.decision, first.decision),
    'C142_PRESERVED_DECISION_CHANGED')
  await waitFor(signal, async () => (await visibleRecord(evaluate, signal, retained)).state === 'cancelled',
    'C142_CANCELLED_RECORD_NOT_VISIBLE')
  const after = (await ipc(evaluate, route('execution'), selector)).attempts.map(item => item.id)
  const effectAfter = fs.existsSync(originalFile)
    ? { sha256: digest(fs.readFileSync(originalFile)), modified: fs.statSync(originalFile).mtimeMs }
    : null
  requireFact(same([...ids].sort(), [...after].sort()) && same(originalEffect, effectAfter) &&
    !fs.existsSync(target) && !fs.existsSync(path.join(workspaceDirectory, 'cancelled.txt')),
    'C142_RESTART_REPLAYED_WORK_OR_EFFECT')
  evidence.checks.push('restart-retains-durable-cancellation', 'first-decision-unchanged',
    'no-new-attempt-or-file-effect-after-restart')
  evidence.complete = true
}
