import { randomUUID } from 'node:crypto'

import { commandConflict, directedAuthority, invalidatedWait, foreignWait } from './c094-cooperation-authority.mjs'
import { controls } from './c094-cooperation-controls.mjs'
import { cancel, drive, end, safeAttempt, selector, teamPath } from './c094-cooperation-driver.mjs'
import { createFixture, selectLiveGateway } from './c094-cooperation-fixtures.mjs'
import { completeFlow, completeDenied, failure, recover, startFlow } from './c094-cooperation-flows.mjs'
import { cooperationPlan, deniedPlan } from './c094-cooperation-prompts.mjs'
import { startCooperationHost } from './uar-team-cooperation-host.mjs'
import { ipc, route, current, summary, response } from './uar-team-operation-tools.mjs'

/** Operate only completed B functionality against the exact packaged UAR and live gateway. */
export default async function run({ evaluate, signal, onObservation, cases }) {
  const availableCases = [
    'success',
    'failure',
    'cancellation',
    'edge',
    'isolation',
    'revocation',
    'directed-authority',
    'wait-invalidation',
    'command-conflict',
    'cycle',
    'restart',
    'crash'
  ]
  const selectedCases = cases ?? availableCases
  if (
    !Array.isArray(selectedCases) ||
    !selectedCases.length ||
    selectedCases.some((name) => !availableCases.includes(name))
  ) {
    throw new Error('C094_UNKNOWN_OPERATION_CASE')
  }
  const selected = (name) => selectedCases.includes(name)
  const receipts = []
  let stage = 'initialize',
    host
  const observe = async (receipt) => {
    receipts.push(receipt)
    await onObservation?.({ stage, ...receipt })
  }
  const fixture = async (model, label, options = {}) => createFixture({ evaluate, host, model, label, ...options })
  const planFor = async (selected, outcomes, options) =>
    cooperationPlan(selected, outcomes, (await summary(evaluate, selector(selected))).budget, options)
  try {
    host = await startCooperationHost({ evaluate, signal, repository: process.env.BOSS_C094_REPOSITORY })
    const model = await selectLiveGateway(evaluate)
    stage = 'success-all-terminal-and-replay'
    const success = await fixture(model, 'success', { workers: 2 })
    const capabilities = await ipc(evaluate, route('snapshot'), { workspaceId: success.workspaceId })
    if (!capabilities.capabilities.cooperation) throw new Error('C094_ACTUAL_COOPERATION_CAPABILITY_MISSING')
    let completed
    if (selected('success')) {
      const successPlan = await planFor(success, ['succeeded', 'succeeded'], { duplicate: true })
      const successfulFlow = await startFlow(evaluate, success, successPlan, 'Two workers then one fresh continuation')
      let observedWaitingForRemainingTarget = false
      completed = await completeFlow({
        evaluate,
        signal,
        host,
        flow: successfulFlow,
        description: stage,
        onState(state) {
          const targets = successPlan.targets.map((target) =>
            state.attempts.find((attempt) => attempt.taskId === target.taskId)
          )
          if (
            state.waits.some((wait) => wait.state === 'waiting') &&
            targets.some((attempt) => attempt && end(attempt)) &&
            targets.some((attempt) => attempt && !end(attempt))
          ) {
            if (state.continuations.length) throw failure('C094_ALL_TERMINAL_WOKE_EARLY', stage, state)
            observedWaitingForRemainingTarget = true
          }
        }
      })
      if (!observedWaitingForRemainingTarget)
        throw failure('C094_ALL_TERMINAL_INTERMEDIATE_STATE_NOT_OBSERVED', stage, completed.state)
      await observe({
        ...completed.receipt,
        allTerminalHeldUntilBothTargets: true,
        duplicateDelegate: 'one task/attempt per stable command'
      })
      await controls(evaluate, signal, success, completed)
      await observe({
        case: 'Boss context/messages/waits',
        teamId: success.teamInstanceId,
        accessiblePanelsPresent: true
      })
    }

    if (selected('failure')) {
      stage = 'confirmed-target-failure'
      const failed = await fixture(model, 'failed output contract')
      const failedPlan = await planFor(failed, ['failed'], { send: false })
      await observe(
        (
          await completeFlow({
            evaluate,
            signal,
            host,
            flow: await startFlow(evaluate, failed, failedPlan, 'Report actual worker contract failure'),
            description: stage
          })
        ).receipt
      )
    }

    if (selected('cancellation')) {
      stage = 'confirmed-target-cancellation'
      const cancelled = await fixture(model, 'queued cancellation')
      const cancelledPlan = await planFor(cancelled, ['cancelled'], { send: false })
      const cancelledFlow = await startFlow(
        evaluate,
        cancelled,
        cancelledPlan,
        'Observe an explicitly cancelled target'
      )
      let cancelledTargetId
      await observe(
        (
          await completeFlow({
            evaluate,
            signal,
            host,
            flow: cancelledFlow,
            description: stage,
            async onState(state) {
              if (cancelledTargetId) return
              const target = state.attempts.find((attempt) => attempt.taskId === cancelledPlan.targets[0].taskId)
              if (target && ['queued', 'running'].includes(target.status)) {
                cancelledTargetId = target.id
                await cancel({
                  evaluate,
                  fixture: cancelled,
                  attempt: target,
                  reason: 'C094 owner cancels original bounded delegated target'
                })
              }
            }
          })
        ).receipt
      )
    }

    if (selected('edge')) {
      stage = 'denied-directed-edge'
      const denied = await fixture(model, 'queue-only edge', { trigger: false })
      const deniedBudget = (await summary(evaluate, selector(denied))).budget
      await observe(
        (
          await completeDenied({
            evaluate,
            signal,
            host,
            fixture: denied,
            plan: deniedPlan(denied.workerIds[0], deniedBudget),
            label: stage
          })
        ).receipt
      )
    }

    if (selected('isolation')) {
      stage = 'two-workspace-recipient-isolation'
      const isolated = await fixture(model, 'foreign recipient')
      const isolatedBefore = await summary(evaluate, selector(success))
      await observe(
        (
          await completeDenied({
            evaluate,
            signal,
            host,
            fixture: isolated,
            plan: deniedPlan(success.workerIds[0], (await summary(evaluate, selector(isolated))).budget),
            label: stage
          })
        ).receipt
      )
      const isolatedAfter = await summary(evaluate, selector(success))
      if (JSON.stringify(isolatedBefore) !== JSON.stringify(isolatedAfter))
        throw failure('C094_FOREIGN_RECIPIENT_MUTATED_OTHER_TEAM', stage, isolatedAfter)
      for (const operation of ['artifacts', 'peer_messages']) {
        const lookup = await response(evaluate, route(operation), {
          ...selector(success),
          workspaceId: isolated.workspaceId
        })
        if (lookup?.ok || !lookup?.error) throw new Error('C094_FOREIGN_WORKSPACE_READ_NOT_REFUSED')
      }
      await observe(await foreignWait({ evaluate, signal, host, source: success, foreign: isolated, completed }))
    }

    if (selected('directed-authority')) {
      stage = 'same-team-current-directed-authority'
      await observe(
        await directedAuthority({
          evaluate,
          signal,
          host,
          fixture: await fixture(model, 'same-team directed authority', { workers: 2 })
        })
      )
    }
    if (selected('command-conflict')) {
      stage = 'same-command-id-different-payload'
      await observe(
        await commandConflict({ evaluate, signal, host, fixture: await fixture(model, 'command payload conflict') })
      )
    }
    if (selected('wait-invalidation')) {
      stage = 'accepted-old-wait-authority-invalidated'
      await observe(
        await invalidatedWait({ evaluate, signal, host, fixture: await fixture(model, 'old wait authority') })
      )
    }

    if (selected('revocation')) {
      stage = 'current-membership-before-effect'
      const revoked = await fixture(model, 'revoked pending recipient')
      let revokedBeforeApproval = false
      await observe(
        (
          await completeDenied({
            evaluate,
            signal,
            host,
            fixture: revoked,
            plan: deniedPlan(revoked.workerIds[0], (await summary(evaluate, selector(revoked))).budget),
            label: stage,
            async beforeApproval({ pending }) {
              if (pending.name === 'team_delegate' && !revokedBeforeApproval) {
                await ipc(evaluate, route('revoke_member'), {
                  ...selector(revoked),
                  commandId: randomUUID(),
                  expectedTeamRevision: (await current(evaluate, revoked)).revision,
                  memberId: revoked.workerIds[0],
                  reason: 'C094 revoke recipient before the actual pending tool effect'
                })
                revokedBeforeApproval = true
              }
            }
          })
        ).receipt
      )
    }

    if (selected('cycle')) {
      stage = 'dependency-wait-cycle-refusal'
      const cyclic = await fixture(model, 'cycle refusal')
      const cyclicPlan = await planFor(cyclic, ['succeeded'], { cycle: true, send: false })
      const cycle = await completeDenied({
        evaluate,
        signal,
        host,
        fixture: cyclic,
        plan: cyclicPlan,
        label: stage,
        tool: 'team_wait'
      })
      for (const attempt of cycle.state.attempts.filter(
        (item) => item.memberId !== cyclic.coordinatorId && !end(item)
      )) {
        await cancel({
          evaluate,
          fixture: cyclic,
          attempt,
          reason: 'C094 cycle exercise cleanup of original queued task'
        })
      }
      await observe(cycle.receipt)
    }

    if (selected('restart')) {
      stage = 'clean-restart-durable-wait'
      const restarting = await fixture(model, 'restart wait')
      const restartPlan = await planFor(restarting, ['cancelled'], { restart: true })
      const restartFlow = await startFlow(evaluate, restarting, restartPlan, 'Retain wait across joined shutdown')
      await drive({
        evaluate,
        signal,
        host,
        fixture: restarting,
        description: stage,
        beforeApproval: ({ attempt }) => attempt.memberId === restarting.coordinatorId,
        async predicate(state) {
          if (!state.waits.some((wait) => wait.state === 'waiting')) return false
          const target = state.attempts.find(
            (attempt) => attempt.taskId === restartPlan.targets[0].taskId && attempt.status === 'running'
          )
          if (!target) return false
          const pending = await host.trustedRequest({
            workspaceId: restarting.workspaceId,
            method: 'GET',
            path: `/api/uar/runs/${encodeURIComponent(target.runId)}/tool-approval/pending`
          })
          return pending.pending?.name === 'team_send'
        }
      })
      const beforeRestart = await summary(evaluate, selector(restarting))
      await host.trustedRequest({
        workspaceId: restarting.workspaceId,
        method: 'POST',
        path: '/api/v1/collaboration/execution-owner/quiesce',
        body: {}
      })
      await host.restart({ graceful: true })
      await recover(evaluate, restarting)
      const recovered = await completeFlow({ evaluate, signal, host, flow: restartFlow, description: stage })
      if (recovered.exact.wait.waitId !== beforeRestart.waits[0].waitId)
        throw failure('C094_RESTART_RECREATED_WAIT', stage, recovered.state)
      await observe({
        ...recovered.receipt,
        restart: 'joined old root; same durable wait; one authenticated fresh continuation'
      })
      const retained = await summary(evaluate, selector(success))
      if (
        completed &&
        (JSON.stringify(retained.continuations) !== JSON.stringify(completed.state.continuations) ||
          retained.attempts.length !== completed.state.attempts.length)
      )
        throw failure('C094_RESTART_DUPLICATED_COMPLETED_TEAM', stage, retained)
    }

    if (selected('crash')) {
      stage = 'crash-before-join-preserves-uncertainty'
      const crashing = await fixture(model, 'unjoined crash')
      const crashPlan = await planFor(crashing, ['cancelled'], { restart: true })
      const crashFlow = await startFlow(evaluate, crashing, crashPlan, 'Never blindly replay unjoined worker effects')
      const held = await drive({
        evaluate,
        signal,
        host,
        fixture: crashing,
        description: stage,
        beforeApproval: ({ attempt }) => attempt.memberId === crashing.coordinatorId,
        async predicate(state) {
          const target = state.attempts.find(
            (attempt) => attempt.taskId === crashPlan.targets[0].taskId && attempt.status === 'running'
          )
          if (!target || !state.waits.some((wait) => wait.state === 'waiting')) return false
          const pending = await host.trustedRequest({
            workspaceId: crashing.workspaceId,
            method: 'GET',
            path: `/api/uar/runs/${encodeURIComponent(target.runId)}/tool-approval/pending`
          })
          return pending.pending?.name === 'team_send'
        }
      })
      await host.restart({ graceful: false })
      const afterCrash = await crashing.request('GET', teamPath(crashing) + '/execution')
      if (
        afterCrash.attempts.length !== held.state.attempts.length ||
        afterCrash.continuations.length ||
        afterCrash.waits[0]?.waitId !== held.state.waits[0]?.waitId ||
        afterCrash.attempts.some(
          (attempt) => !held.state.attempts.some((prior) => prior.id === attempt.id && prior.runId === attempt.runId)
        )
      ) {
        throw failure('C094_UNJOINED_CRASH_REPLAYED_OR_LOST_IDENTITIES', stage, afterCrash)
      }
      let refused
      try {
        await crashing.request('POST', teamPath(crashing) + '/recover', {
          commandId: randomUUID(),
          expectedTeamRevision: (await crashing.request('GET', teamPath(crashing))).revision,
          reason: 'C094 require authentic fencing before recovering an unjoined crashed owner'
        })
      } catch (error) {
        refused = { status: error.status, code: error.code }
      }
      if (!refused || ![403, 409].includes(refused.status))
        throw failure('C094_CRASH_RECOVERY_NOT_AUTHORITY_BLOCKED', stage, afterCrash)
      await observe({
        case: stage,
        teamId: crashing.teamInstanceId,
        workspaceId: crashing.workspaceId,
        initial: safeAttempt(afterCrash.attempts.find((attempt) => attempt.id === crashFlow.initial.id)),
        waitId: afterCrash.waits[0].waitId,
        originalAttempts: afterCrash.attempts.map(safeAttempt),
        recoveryRefusal: refused,
        automaticRecovery: 'blocked pending authentic original effect/owner fencing evidence'
      })
    }

    return {
      schemaVersion: 1,
      passed: true,
      scope: { cases: selectedCases, complete: availableCases.every(selected) },
      scenarios: receipts,
      pending: [],
      observedBehavior: JSON.stringify({
        feature: 'C09.4 packaged local cooperating teams',
        runtimeInstanceId: host.instanceId,
        configuredTeamCapacity: 1,
        profileStage: 'operation',
        gatewayAlias: model.modelId,
        completedCases: receipts.map((receipt) => receipt.case),
        crashRecovery: 'safe refusal demonstrated; no unsupported automatic recovery claimed',
        managedLifecycle: 'not claimed; exact packaged binary operated via external fixture'
      })
    }
  } catch (error) {
    if (!error.operationEvidence)
      error.operationEvidence = { stage, completedCases: receipts.map((receipt) => receipt.case) }
    error.operationEvidence.selectedCases = selectedCases
    throw error
  } finally {
    await host?.stop()
  }
}
