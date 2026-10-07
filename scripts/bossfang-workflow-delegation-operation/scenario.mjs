import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { digest, failure, ipc, requireFact, same, write } from './io.mjs'
import { prepare, runtimeState } from './setup.mjs'
import { openDashboard, request } from './dashboard.mjs'
import { author, start, observe, output, cancel, runPath, delegationPath, projection } from './workflow.mjs'

/** Actual compiled guest + ordinary native workflow. Effect authority is an explicit unresolved prerequisite. */
export async function scenario({ evaluate, signal }, configuration) {
  const evidence = { schemaVersion: 1, kind: 'bossfang-ordinary-bound-workflow-packaged-operation',
    creationTaskRef: 'C14.4', complete: false, startedAt: new Date().toISOString(),
    sourceRefs: configuration.sourceRefs, previousReceipt: configuration.previousReceipt,
    normalProfile: true, experimentalOptIn: false, credentialValueRecorded: false, checks: [],
    limitations: [
      'Scoped BossFang cannot attach paired-host tool admission and the managed UAR native file tools are disabled.',
      'Approval/effect acceptance remains blocked pending an existing admitted effect resource path; no approval is invented or forwarded with host credentials.',
      'Cancellation here targets a live ordinary bound inference, not a pending effect approval.',
      'Earlier passing dashboard, ports and ownership scopes retain only their exact original receipts and package identities.',
      'Native Windows installed acceptance and publication remain independent and unclaimed.'
    ] }
  const resources = { runs: [] }
  let stage = 'actual-isolated-workspace-and-selected-runtime'
  try {
    const prepared = await prepare(evaluate, signal, configuration, resources)
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
    evidence.checks.push('actual-compiled-authenticated-embedded-dashboard',
      'visible-canvas-bound-target-authoring-and-native-persistence')

    stage = 'ordinary-workflow-native-output'
    const first = await start(dashboard.guest, signal, workflow,
      'Reply only with ' + configuration.marker + '. Do not use tools, access files, or delegate.', resources.runs)
    const firstObserved = await observe(dashboard.guest, signal, first, prepared, workflow, true)
    evidence.outputRun = firstObserved.receipt
    evidence.output = await output(dashboard.guest, signal, firstObserved, configuration.marker)
    const ordinary = await request(dashboard.guest, 'GET', runPath(first.runId))
    requireFact(ordinary.state === 'completed' && ordinary.output?.includes(configuration.marker) &&
      ordinary.step_results?.some(item => item.step_name === workflow.stepName && item.output?.includes(configuration.marker)),
    'C14W_ORDINARY_ENGINE_OUTPUT_NOT_SETTLED')
    evidence.ordinaryCompletion = { runId: first.runId, state: ordinary.state,
      outputSha256: digest(ordinary.output), stepResults: ordinary.step_results.map(item => ({
        stepName: item.step_name, outputSha256: digest(item.output), durationMs: item.duration_ms
      })) }
    evidence.checks.push('visible-ordinary-run-admission-to-original-bound-uar',
      'native-workflow-step-delegation-task-thread-root-run-correlations',
      'actual-native-message-output-visible-and-settled-by-ordinary-engine')

    stage = 'visible-original-authority-cancellation'
    const second = await start(dashboard.guest, signal, workflow,
      'Generate 1500 distinct numbered short sentences about arithmetic, starting at 1. Continue until all 1500 are generated. Do not use tools, files, or delegation.',
      resources.runs)
    const secondObserved = await observe(dashboard.guest, signal, second, prepared, workflow, false)
    evidence.cancelBefore = secondObserved.receipt
    evidence.cancelAfter = await cancel(dashboard.guest, signal, secondObserved)
    evidence.checks.push('visible-two-step-confirmed-cancel-forwarded-to-original-native-run',
      'native-cancellation-request-acknowledgment-terminal-cleanup-settled')

    stage = 'approval-effect-resource-prerequisite'
    // Native full-run scoped authority intentionally cannot create paired-host grants.
    throw Object.assign(new Error('C14W_ADMITTED_EFFECT_RESOURCE_PATH_UNAVAILABLE'), {
      code: 'C14W_ADMITTED_EFFECT_RESOURCE_PATH_UNAVAILABLE'
    })
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
    if (cleanupFailures.length) evidence.cleanupFailures = cleanupFailures
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failure: evidence.failure, cleanupFailures: evidence.cleanupFailures,
    evidence: configuration.evidence, evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
