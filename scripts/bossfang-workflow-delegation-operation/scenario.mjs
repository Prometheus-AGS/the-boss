import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { digest, failure, ipc, requireFact, same, waitFor, write } from './io.mjs'
import { prepare, runtimeState } from './setup.mjs'
import { openDashboard, request } from './dashboard.mjs'
import { author, start, observe, output, cancel, runPath, delegationPath, projection } from './workflow.mjs'
import { writeInput, pending, decide, settledHistory, verifyFiles } from './effects.mjs'

/** Actual compiled guest, ordinary native workflow and original paired-host effect authority. */
export async function scenario({ evaluate, signal }, configuration) {
  const evidence = { schemaVersion: 1, kind: 'bossfang-ordinary-bound-workflow-packaged-operation',
    creationTaskRef: 'C14.4', complete: false, startedAt: new Date().toISOString(),
    sourceRefs: configuration.sourceRefs, previousReceipt: configuration.previousReceipt,
    normalProfile: true, experimentalOptIn: false, credentialValueRecorded: false, checks: [],
    limitations: [
      'Host resources remain private to the original registered context; opaque context inventory is not effect authority.',
      'Context expiry/revocation and cross-platform behavior are not operated by this bounded workflow procedure.',
      'Earlier passing dashboard, ports and ownership scopes retain only their exact original receipts and package identities.',
      'Native Windows installed acceptance and publication remain independent and unclaimed.'
    ] }
  const resources = { runs: [] }
  let stage = 'actual-isolated-workspace-and-selected-runtime'
  try {
    const prepared = await prepare(evaluate, signal, configuration, resources)
    if (prepared.modelContext) evidence.modelContextConfiguration = {
      ...prepared.modelContext, route: 'prometheus.uar.providers.save',
      providerModelId: prepared.modelId, credentialsChanged: false
    }
    evidence.effectScope = { workspaceId: prepared.workspace.workspaceId,
      workspaceSha256: configuration.workspaceSha256, selectedServiceInstanceId: prepared.initial.selectedInstanceId,
      runtimeId: prepared.runtimeId, generation: prepared.generation, bindingId: prepared.binding.id,
      identitySourceInstanceId: prepared.identityRecord.instanceId,
      durableTurnsSubmitted: 0, durableActivationsSubmitted: 0, approvalDecisionsSubmitted: 0,
      externalEffectsAuthorized: false, secondUarStarted: false }
    evidence.initialRuntime = prepared.initial
    evidence.definitionIdentitySource = { route: 'prometheus.uar.durable.create_instance',
      instanceId: prepared.identityRecord.instanceId, definitionId: prepared.identityRecord.definitionId,
      definitionVersion: prepared.identityRecord.definitionVersion, definitionDigest: prepared.identityRecord.definitionDigest,
      bindingId: prepared.identityRecord.bindingId, profile: prepared.identityRecord.profile,
      lifecycle: prepared.identityRecord.lifecycle, inferenceSubmitted: false }

    stage = 'actual-compiled-authenticated-dashboard'
    const dashboard = await openDashboard(evaluate, signal)
    resources.guest = dashboard.guest
    evidence.dashboard = { authentication: dashboard.authentication,
      registrationRecoveryRequired: dashboard.registrationRecoveryRequired }
    stage = 'visible-ordinary-workflow-authoring'
    const workflow = await author(dashboard.guest, signal, prepared, configuration.marker)
    evidence.workflow = workflow
    evidence.hostContext = prepared.hostContext
    evidence.checks.push('actual-compiled-authenticated-embedded-dashboard',
      'visible-canvas-bound-target-authoring-and-native-persistence')

    stage = 'ordinary-workflow-real-pending-approved-effect'
    const approvedContent = configuration.marker + '-approved\n'
    const first = await start(dashboard.guest, signal, workflow,
      writeInput('approved.txt', approvedContent, configuration.marker), resources.runs)
    const firstPendingObserved = await observe(dashboard.guest, signal, first, prepared, workflow, false)
    const approved = await pending(evaluate, dashboard.guest, signal, firstPendingObserved, prepared,
      configuration.workspaceDirectory, 'approved.txt', approvedContent)
    evidence.approvedPending = approved.receipt
    await decide(dashboard.guest, signal, approved, true)
    evidence.effectScope.approvalDecisionsSubmitted++
    evidence.approvedHistory = await settledHistory(evaluate, signal, approved, 'approved')
    const firstObserved = await observe(dashboard.guest, signal, first, prepared, workflow, true)
    evidence.outputRun = firstObserved.receipt
    evidence.output = await output(dashboard.guest, signal, firstObserved, configuration.marker)
    const ordinary = await waitFor(signal, async () => {
      const record = await request(dashboard.guest, 'GET', runPath(first.runId))
      return record.state === 'completed' && record.output?.includes(configuration.marker) &&
        record.step_results?.some(item => item.step_name === workflow.stepName && item.output?.includes(configuration.marker)) ? record : false
    }, 'C14W_ORDINARY_ENGINE_OUTPUT_NOT_SETTLED', 60000, 1000)
    evidence.ordinaryCompletion = { runId: first.runId, state: ordinary.state,
      outputSha256: digest(ordinary.output), stepResults: ordinary.step_results.map(item => ({
        stepName: item.step_name, outputSha256: digest(item.output), durationMs: item.duration_ms
      })) }
    evidence.checks.push('visible-ordinary-run-admission-to-original-bound-uar',
      'native-workflow-step-delegation-task-thread-root-run-correlations',
      'actual-native-message-output-visible-and-settled-by-ordinary-engine',
      'visible-original-pending-approval-exact-prepared-write',
      'canonical-durable-host-human-approval-before-exact-disposable-effect')
    evidence.approvedEffect = verifyFiles(configuration, approvedContent)
    requireFact(same(prepared.initial, await runtimeState(evaluate)), 'C14W_WORK_SELECTION_OR_UAR_PROCESS_CHANGED')

    stage = 'visible-original-authority-denial-without-effect'
    const second = await start(dashboard.guest, signal, workflow,
      writeInput('denied.txt', configuration.marker + '-denied\n', configuration.marker), resources.runs)
    const secondObserved = await observe(dashboard.guest, signal, second, prepared, workflow, false)
    const denied = await pending(evaluate, dashboard.guest, signal, secondObserved, prepared,
      configuration.workspaceDirectory, 'denied.txt', configuration.marker + '-denied\n')
    evidence.deniedPending = denied.receipt
    await decide(dashboard.guest, signal, denied, false)
    evidence.effectScope.approvalDecisionsSubmitted++
    evidence.deniedHistory = await settledHistory(evaluate, signal, denied, 'denied')
    evidence.deniedRun = (await observe(dashboard.guest, signal, second, prepared, workflow, true)).receipt
    const deniedOrdinary = await waitFor(signal, async () => {
      const record = await request(dashboard.guest, 'GET', runPath(second.runId))
      return ['completed', 'failed', 'cancelled'].includes(record.state) ? record : false
    }, 'C14W_ORDINARY_ENGINE_DENIAL_NOT_SETTLED', 60000, 1000)
    evidence.ordinaryDenial = { runId: deniedOrdinary.id, state: deniedOrdinary.state }
    requireFact(!fs.existsSync(denied.expectedPath), 'C14W_DENIED_EFFECT_OCCURRED')
    evidence.checks.push('visible-original-authoritative-denial-canonical-durable-history-without-effect')
    requireFact(same(prepared.initial, await runtimeState(evaluate)), 'C14W_WORK_SELECTION_OR_UAR_PROCESS_CHANGED')

    stage = 'visible-original-authority-cancellation-while-approval-pending'
    const third = await start(dashboard.guest, signal, workflow,
      writeInput('cancelled.txt', configuration.marker + '-cancelled\n', configuration.marker), resources.runs)
    const thirdObserved = await observe(dashboard.guest, signal, third, prepared, workflow, false)
    const cancelled = await pending(evaluate, dashboard.guest, signal, thirdObserved, prepared,
      configuration.workspaceDirectory, 'cancelled.txt', configuration.marker + '-cancelled\n')
    evidence.cancelPending = cancelled.receipt
    evidence.cancelBefore = projection(cancelled.current)
    evidence.cancelAfter = await cancel(dashboard.guest, signal, { ...thirdObserved, current: cancelled.current })
    evidence.cancelHistory = await settledHistory(evaluate, signal, cancelled, 'cancelled')
    requireFact(!fs.existsSync(cancelled.expectedPath), 'C14W_CANCELLED_PENDING_EFFECT_OCCURRED')
    const cancelledOrdinary = await waitFor(signal, async () => {
      const record = await request(dashboard.guest, 'GET', runPath(third.runId))
      return record.state === 'cancelled' ? record : false
    }, 'C14W_ORDINARY_ENGINE_CANCELLATION_NOT_SETTLED', 60000, 1000)
    evidence.ordinaryCancellation = { runId: cancelledOrdinary.id, state: cancelledOrdinary.state }
    evidence.checks.push('visible-two-step-confirmed-cancel-forwarded-to-original-native-run',
      'native-cancellation-request-acknowledgment-terminal-cleanup-settled',
      'pending-approval-cancelled-canonical-history-and-ordinary-engine-without-effect')
    evidence.finalEffects = verifyFiles(configuration, approvedContent)
    evidence.complete = true
  } catch (error) {
    evidence.failure = failure(error, stage, signal)
  } finally {
    const cleanupFailures = []
    if (resources.guest) {
      for (const runId of resources.runs) {
        try {
          const record = await request(resources.guest, 'GET', runPath(runId))
          for (const { delegation } of record.uar_delegations ?? []) {
            if (!['completed', 'failed', 'cancelled'].includes(delegation.executionState)) {
              const cancelled = await request(resources.guest, 'POST', delegationPath(delegation.bossTaskId) + '/cancel', {})
              ;(evidence.cleanupCancellations ??= []).push(projection(cancelled.delegation ?? cancelled))
            }
          }
        } catch (error) { cleanupFailures.push(failure(error, 'cancel-owned-disposable-workflow')) }
      }
    }
    if (resources.identityRecord) {
      try {
        await ipc(evaluate, 'prometheus.uar.durable.instance_action', { workspaceId: resources.workspaceId,
          instanceId: resources.identityRecord.instanceId, action: 'disable', commandId: randomUUID() })
        evidence.identityResourceDisabled = true
      } catch (error) { cleanupFailures.push(failure(error, 'disable-owned-inert-identity-resource')) }
    }
    if (resources.ownedBossFangStartRequested) {
      try {
        const before = await ipc(evaluate, 'bossfang.status')
        requireFact(before.ownership === 'managed', 'C14W_OWNED_CLEANUP_AUTHORITY_CHANGED')
        await ipc(evaluate, 'bossfang.stop')
        const stopped = await ipc(evaluate, 'bossfang.status')
        requireFact(stopped.status === 'stopped', 'C14W_OWNED_BOSSFANG_STOP_UNCONFIRMED')
        evidence.ownedBossFangStopped = true
      } catch (error) { cleanupFailures.push(failure(error, 'stop-owned-disposable-bossfang')) }
    }
    if (resources.initial) {
      try {
        evidence.finalRuntime = await runtimeState(evaluate)
        requireFact(same(resources.initial, evidence.finalRuntime), 'C14W_WORK_SELECTION_OR_UAR_PROCESS_CHANGED')
        evidence.checks.push('work-global-selection-and-original-uar-pid-start-port-preserved')
      } catch (error) { cleanupFailures.push(failure(error, 'preserve-original-uar-and-selection')) }
    }
    if (cleanupFailures.length) {
      evidence.cleanupFailures = cleanupFailures
      evidence.complete = false
    }
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failure: evidence.failure, cleanupFailures: evidence.cleanupFailures,
    evidence: configuration.evidence, evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
