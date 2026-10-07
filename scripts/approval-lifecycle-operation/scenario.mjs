import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { admission, task } from '../cadence/uar-team-operation-tools.mjs'
import { click, fill, ipc, secondClient, visibleRecord, workRoute } from './clients.mjs'
import { digest, requireFact, route, same, waitFor, write } from './io.mjs'
import { setup } from './setup.mjs'

const identity = (record) => [record.issuerId, record.challengeId]
const attemptSelector = (attempt) => `[data-ui~="teams-attempt"][data-attempt-id="${attempt.id}"]`
const approvalSelector = (pending) =>
  `[data-approval-id="${pending.approvalId}"][data-attempt-id="${pending.attemptId}"]`
const terminal = (attempt) => ['succeeded', 'failed', 'cancelled', 'uncertain'].includes(attempt.status)

export async function pendingWrite(evaluate, signal, selector, configuration, fileName) {
  const content = configuration.marker + '\n'
  const assigned = await task(
    evaluate,
    selector,
    'worker',
    'Approval lifecycle ' + fileName,
    `Use filesystem__write exactly once to create ${fileName} in the workspace with exactly ${JSON.stringify(content)}. Do not perform other writes or delegate. Await operator approval. If denied or cancelled, stop without retrying.`,
    null
  )
  const input = await admission(evaluate, selector, assigned, {
    tokens: 4096,
    costMicrounits: 500000,
    elapsedSeconds: 180
  })
  const attempt = await ipc(evaluate, route('admit_task'), input)
  const pending = await waitFor(
    signal,
    async () => {
      const page = await ipc(evaluate, route('approvals'), selector)
      return page.approvals.find((item) => item.attemptId === attempt.id)
    },
    'C142_REAL_TOOL_CHALLENGE_UNAVAILABLE',
    120000,
    1000
  )
  requireFact(
    pending.toolName === 'filesystem__write' &&
      pending.preparedEffect?.targetPath === path.join(configuration.workspaceDirectory, fileName) &&
      pending.preparedEffect?.write?.contentSha256 === digest(content),
    'C142_EFFECT_OUTSIDE_EXACT_OPERATION_SCOPE'
  )
  return { attempt, pending, content, fileName }
}

export async function canonical(evaluate, selector, pending) {
  const page = await ipc(evaluate, route('approvals'), selector)
  const records = page.history.filter((record) => same(identity(record), identity(pending)))
  requireFact(records.length === 1 && records[0].durable, 'C142_SINGLE_DURABLE_CHALLENGE_REQUIRED')
  return records[0]
}

export async function stopAttempt(evaluate, signal, selector, pending) {
  const control = attemptSelector(pending.attempt)
  await fill(
    evaluate,
    signal,
    '[data-ui~="teams-control-reason"]',
    'C14.2 stop pending executor without resolving approval'
  )
  await click(evaluate, signal, control + ' [data-ui~="teams-stop-executor"]')
  const stopped = await waitFor(
    signal,
    async () => {
      const record = await canonical(evaluate, selector, pending.pending)
      const execution = await ipc(evaluate, route('execution'), selector)
      const attempt = execution.attempts.find((item) => item.id === pending.attempt.id)
      return attempt && terminal(attempt) && record.state === 'cancelled' ? record : false
    },
    'C142_EXECUTOR_CANCELLATION_NOT_OBSERVED',
    60000,
    1000
  )
  requireFact(stopped.decision === null, 'C142_CANCELLATION_FABRICATED_HUMAN_DECISION')
  return stopped
}

export async function scenario({ evaluate, signal, targets }, configuration) {
  const evidence = {
    schemaVersion: 1,
    kind: 'approval-lifecycle-packaged-operation',
    creationTaskRef: 'C14.2',
    complete: false,
    startedAt: new Date().toISOString(),
    sourceRefs: configuration.sourceRefs,
    clientScope: 'two distinct packaged renderer windows sharing one authenticated application owner',
    reopenScope: 'both renderer reloads and UAR runtime restart; no application-process relaunch',
    credentialValueRecorded: false,
    checks: []
  }
  let secondary,
    stage = 'setup'
  try {
    await waitFor(
      signal,
      () =>
        evaluate(`(() => {
      const skip=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&node.innerText.trim()==='Set up later');
      if(skip)skip.click();return Boolean(document.querySelector('#app-sidebar'));
    })()`),
      'C142_PACKAGED_ONBOARDING_UNAVAILABLE'
    )
    const selected = await setup(evaluate, configuration)
    const snapshot = await ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    requireFact(
      snapshot.executionProfileStage === 'qualified' && snapshot.capabilities.coding && snapshot.capabilities.approvals,
      'C142_NORMAL_PACKAGED_PROFILE_UNQUALIFIED'
    )
    const binding = await ipc(evaluate, route('setup_coding'), selected)
    const catalog = await ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    const definition = catalog.definitions.find((item) => same(item.package, binding.package))
    requireFact(definition && binding.activationSupported, 'C142_CODING_BINDING_UNAVAILABLE')
    const instance = await ipc(evaluate, route('create'), {
      workspaceId: selected.workspaceId,
      commandId: randomUUID(),
      deploymentBindingId: binding.id,
      teamDefinition: { id: definition.id, version: definition.version, digest: definition.digest },
      input: { brief: 'Bounded approval lifecycle operation' },
      memberSlots: definition.members.map((member) => ({ role: member.role, count: member.min }))
    })
    const selector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
    await ipc(evaluate, 'navigation.open_route_in_main', { path: workRoute(selector) })
    secondary = await secondClient(evaluate, signal, targets, selector)
    evidence.clientTargets = [secondary.primaryTargetId, secondary.targetId]
    evidence.selector = selector
    evidence.checks.push('two-distinct-packaged-renderer-clients')

    stage = 'canonical-pending-challenge'
    const first = await pendingWrite(evaluate, signal, selector, configuration, 'decision.txt')
    const [left, right] = await Promise.all([
      canonical(evaluate, selector, first.pending),
      canonical(secondary.evaluate, selector, first.pending)
    ])
    requireFact(
      same(left, right) && left.state === 'pending' && left.resolvable && left.decision === null,
      'C142_CLIENT_CHALLENGES_DIVERGED'
    )
    await Promise.all([visibleRecord(evaluate, signal, left), visibleRecord(secondary.evaluate, signal, right)])
    evidence.challenge = {
      issuerId: left.issuerId,
      challengeId: left.challengeId,
      runId: left.runId,
      admissionId: left.admissionId,
      admissionOwner: left.admissionOwner
    }
    evidence.checks.push('same-canonical-pending-issuer-challenge-on-both-clients')

    stage = 'local-observation-detach'
    const observation = attemptSelector(first.attempt) + ' [data-observation]'
    await click(evaluate, signal, observation + ' [data-ui~="teams-observation-toggle"]')
    const detached = await evaluate(
      `(() => {const node=document.querySelector(${JSON.stringify(observation)});return {state:node.dataset.observation,cursor:node.dataset.outputCursor}})()`
    )
    requireFact(detached.state === 'detached', 'C142_LOCAL_DETACH_NOT_VISIBLE')
    await delay(3500, undefined, { signal })
    const unchanged = await evaluate(`document.querySelector(${JSON.stringify(observation)}).dataset.outputCursor`)
    const running = (await ipc(secondary.evaluate, route('execution'), selector)).attempts.find(
      (item) => item.id === first.attempt.id
    )
    requireFact(
      unchanged === detached.cursor && running?.status === 'running',
      'C142_DETACH_CHANGED_EXECUTION_OR_CURSOR'
    )
    evidence.checks.push('local-detach-preserves-executor-and-output-cursor')

    stage = 'one-authenticated-decision'
    await Promise.all([
      click(evaluate, signal, approvalSelector(first.pending) + ' [data-ui~="teams-approve"]'),
      click(secondary.evaluate, signal, approvalSelector(first.pending) + ' [data-ui~="teams-deny"]')
    ])
    const decision = await waitFor(
      signal,
      async () => {
        const a = await canonical(evaluate, selector, first.pending)
        const b = await canonical(secondary.evaluate, selector, first.pending)
        return a.decision &&
          same(a.decision, b.decision) &&
          ['approved', 'denied'].includes(a.state) &&
          a.state === b.state
          ? a
          : false
      },
      'C142_ONE_AUTHORITATIVE_DECISION_UNAVAILABLE',
      30000,
      1000
    )
    requireFact(
      decision.decision.actor === decision.ownerKey && decision.decision.decisionId && !decision.resolvable,
      'C142_AUTHENTICATED_DECISION_IDENTITY_UNAVAILABLE'
    )
    await waitFor(
      signal,
      async () => {
        const a = await visibleRecord(evaluate, signal, decision)
        const b = await visibleRecord(secondary.evaluate, signal, decision)
        return a.decisionId === decision.decision.decisionId && a.actor === decision.decision.actor && same(a, b)
      },
      'C142_CLIENT_DECISION_NOT_VISIBLE'
    )
    const replay = await secondary.evaluate(
      `window.api.ipcApi.request(${JSON.stringify(route('decide_approval'))},${JSON.stringify({
        ...selector,
        attemptId: first.pending.attemptId,
        approvalId: first.pending.approvalId,
        issuerId: first.pending.issuerId,
        challengeId: first.pending.challengeId,
        eventId: first.pending.eventId,
        cursor: first.pending.cursor,
        approved: !decision.decision.approved
      })})`
    )
    requireFact(
      !replay?.ok && same((await canonical(evaluate, selector, first.pending)).decision, decision.decision),
      'C142_STALE_CLIENT_OVERWROTE_DECISION'
    )
    evidence.decision = {
      decisionId: decision.decision.decisionId,
      actorSha256: digest(decision.decision.actor),
      approved: decision.decision.approved,
      state: decision.state
    }
    evidence.checks.push('one-authenticated-decision-shared-by-both-clients', 'stale-opposite-decision-refused')

    stage = 'reattach-and-effect'
    await click(evaluate, signal, observation + ' [data-ui~="teams-observation-toggle"]')
    await waitFor(
      signal,
      () =>
        evaluate(`(() => {const node=document.querySelector(${JSON.stringify(observation)});
      return node?.dataset.observation==='attached'&&Number(node.dataset.outputCursor)>=${Number(detached.cursor)};})()`),
      'C142_REATTACH_LOST_CURSOR'
    )
    const finished = await waitFor(
      signal,
      async () => {
        const execution = await ipc(evaluate, route('execution'), selector)
        return execution.attempts.find((item) => item.id === first.attempt.id && terminal(item))
      },
      'C142_DECIDED_ATTEMPT_NOT_FINISHED',
      120000,
      1000
    )
    const savedOutput =
      finished.output == null
        ? null
        : typeof finished.output === 'string'
          ? finished.output
          : JSON.stringify(finished.output, null, 2)
    await waitFor(
      signal,
      () =>
        evaluate(`(() => {
      const observation=document.querySelector(${JSON.stringify(observation)});
      const output=document.querySelector(${JSON.stringify(attemptSelector(first.attempt) + ' [data-ui~="teams-output-text"]')});
      return observation?.dataset.observation==='attached' &&
        (Number(observation.dataset.outputCursor)>${Number(detached.cursor)} ||
          (${JSON.stringify(savedOutput)}!==null&&output?.textContent===${JSON.stringify(savedOutput)}));
    })()`),
      'C142_REATTACH_DID_NOT_RESUME_OUTPUT'
    )
    const target = path.join(configuration.workspaceDirectory, first.fileName)
    requireFact(
      decision.decision.approved
        ? fs.existsSync(target) && fs.readFileSync(target, 'utf8') === first.content
        : !fs.existsSync(target),
      'C142_EFFECT_DOES_NOT_MATCH_AUTHORITY'
    )
    evidence.effectState = (await canonical(evaluate, selector, first.pending)).effectState ?? null
    evidence.checks.push('reattach-retains-cursor', 'actual-effect-checked-separately-from-decision')

    stage = 'executor-stop'
    const second = await pendingWrite(evaluate, signal, selector, configuration, 'cancelled.txt')
    const stopped = await stopAttempt(evaluate, signal, selector, second)
    requireFact(
      !fs.existsSync(path.join(configuration.workspaceDirectory, second.fileName)),
      'C142_CANCELLED_EFFECT_OCCURRED'
    )
    evidence.cancelled = {
      issuerId: stopped.issuerId,
      challengeId: stopped.challengeId,
      state: stopped.state,
      decision: null
    }
    evidence.checks.push('explicit-executor-stop-uses-cancellation-without-human-decision')

    stage = 'renderer-reopen-and-runtime-restart'
    const before = (await ipc(evaluate, route('execution'), selector)).attempts.map((item) => item.id)
    const restart = await ipc(evaluate, 'prometheus.integration.start', { action: 'uar-restart' })
    await waitFor(
      signal,
      async () => {
        const state = await ipc(evaluate, 'prometheus.integration.snapshot', {})
        const operation = state.operations.find((item) => item.id === restart.id)
        requireFact(!['failed', 'cancelled', 'interrupted'].includes(operation?.status), 'C142_RUNTIME_RESTART_FAILED')
        return operation?.status === 'succeeded'
      },
      'C142_RUNTIME_RESTART_UNAVAILABLE',
      90000,
      1000
    )
    await Promise.all([
      evaluate('setTimeout(()=>location.reload(),50);true'),
      secondary.evaluate('setTimeout(()=>location.reload(),50);true')
    ])
    await delay(1000, undefined, { signal })
    await ipc(evaluate, 'navigation.open_route_in_main', { path: workRoute(selector) })
    const reopened = await waitFor(
      signal,
      async () => {
        const a = await canonical(evaluate, selector, first.pending)
        const b = await canonical(secondary.evaluate, selector, first.pending)
        return same(a.decision, decision.decision) && same(a.decision, b.decision) ? a : false
      },
      'C142_REOPEN_LOST_DECISION'
    )
    await Promise.all([visibleRecord(evaluate, signal, reopened), visibleRecord(secondary.evaluate, signal, reopened)])
    const cancelled = await canonical(evaluate, selector, second.pending)
    requireFact(
      cancelled.state === 'cancelled' &&
        cancelled.decision === null &&
        same(
          (await ipc(evaluate, route('execution'), selector)).attempts.map((item) => item.id),
          before
        ),
      'C142_REOPEN_CHANGED_CANCELLED_STATE_OR_REPLAYED_WORK'
    )
    evidence.checks.push(
      'runtime-restart-and-renderer-reopen-retain-decision',
      'reopen-does-not-replay-effects-or-invent-denial'
    )
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted
      ? 'C142_OPERATION_CANCELLED_OR_TIMED_OUT'
      : /^C142_[A-Z0-9_]+$/.test(error.code ?? '')
        ? error.code
        : 'C142_APPLICATION_OPERATION_UNAVAILABLE'
  } finally {
    secondary?.close()
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return {
    passed: evidence.complete,
    observedBehavior: JSON.stringify({
      complete: evidence.complete,
      checks: evidence.checks,
      failureCode: evidence.failureCode,
      evidence: configuration.evidence,
      evidenceSha256: digest(fs.readFileSync(configuration.evidence))
    })
  }
}
