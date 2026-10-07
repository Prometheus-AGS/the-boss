import fs from 'node:fs'

import { setup } from '../approval-lifecycle-operation/setup.mjs'
import { startCooperationHost } from '../cadence/uar-team-cooperation-host.mjs'
import { team, current } from '../cadence/uar-team-operation-tools.mjs'
import { ipc, click, waitFor, open, visible, assertIdentity } from '../uar-administration-operation/clients.mjs'
import { digest, write, same, requireFact } from './io.mjs'
import { createRecords } from './records.mjs'
import { assertProjection, assertVisible } from './assertions.mjs'

const selected = async (evaluate) => (await ipc(evaluate, 'prometheus.uar.instances.read', {})).selectedInstanceId
const capture = (evaluate, host, workspaceId) => ipc(evaluate, 'prometheus.uar.lifecycle.snapshot', {
  serviceInstanceId: host.instanceId, workspaceId
})

export async function scenario({ evaluate, signal }, configuration) {
  const evidence = {
    schemaVersion: 1, kind: 'uar-lifecycle-detail-packaged-operation', creationTaskRef: 'C14.1', complete: false,
    acceptanceScope: 'new lifecycle-detail consumer fields; no whole C14.1 or Windows installed acceptance',
    normalProfile: true, experimentalOptIn: false, credentialValueRecorded: false,
    consistency: 'non-atomic', sourceRefs: configuration.sourceRefs, startedAt: new Date().toISOString(), checks: []
  }
  let host, stage = 'setup'
  try {
    await waitFor(signal, () => evaluate(`(() => {
      const skip=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&node.innerText.trim()==='Set up later');
      if(skip)skip.click();return Boolean(document.querySelector('#app-sidebar'));
    })()`), 'C14D_PACKAGED_ONBOARDING_UNAVAILABLE')
    const workspace = await setup(evaluate, configuration)
    const managedId = await selected(evaluate)
    const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
    requireFact(inventory.instances.some((item) => item.id === managedId && item.ownership === 'managed'), 'C14D_MANAGED_SELECTION_REQUIRED')
    const selector = await team(evaluate, workspace.workspaceId, workspace.model, configuration.marker)
    const before = await current(evaluate, selector)
    host = await startCooperationHost({ evaluate, signal, repository: configuration.repository, selectInstance: false,
      experimentalStage: false, durableStorage: true })
    host.setOwner(before.ownerId)
    requireFact(await selected(evaluate) === managedId, 'C14D_HOST_CHANGED_WORK_SELECTION')
    evidence.externalRuntime = host.evidence
    evidence.workSelection = managedId

    stage = 'real-disposable-records'
    const records = await createRecords(host, signal, workspace.workspaceId, configuration.gateway, configuration.marker)
    evidence.effectScope = { ...records.effectScope, managedTeamId: selector.teamInstanceId,
      managedTaskExecutionSubmitted: false, externalTeamExecutionSubmitted: false, workflowRunsSubmitted: 0 }
    const nativeBinding = (await records.request('GET', '/api/v1/collaboration/deployment-bindings'))
      .find((item) => item.id === records.bindingId)
    const nativeRuns = await records.request('GET', '/api/v1/collaboration/workflow-runs')

    stage = 'trusted-selected-runtime-projection'
    const value = await capture(evaluate, host, workspace.workspaceId)
    assertIdentity(value, host.instanceId, workspace.workspaceId, 'external')
    const projected = assertProjection(value, records, nativeBinding, nativeRuns, process.env[configuration.gateway.credentialEnv])
    evidence.snapshot = {
      requested: value.requested, effective: value.effective, captureStartedAt: value.captureStartedAt, capturedAt: value.capturedAt,
      sources: Object.fromEntries(['agents', 'durable', 'teams', 'workflows', 'ownership', 'approvals'].map((name) => {
        const { state, scope, readAt, reason } = value[name]
        return [name, { state, scope, readAt, ...(reason ? { reason } : {}) }]
      }))
    }
    evidence.observed = {
      instanceId: projected.source.instanceId, definitionId: projected.source.definitionId,
      definitionDigest: projected.source.definitionDigest, bindingId: projected.source.bindingId,
      bindingDigest: projected.source.bindingDigest, sessionId: projected.source.sessionId,
      command: projected.command, events: projected.events, retentionLimits: projected.source.limits,
      bindingPosture: { receiptId: projected.binding.posture.id, contentDigest: projected.binding.posture.contentDigest,
        policyRevision: projected.binding.posture.policyRevision, admitted: projected.binding.posture.admitted,
        modelCount: projected.binding.posture.resolvedModels.length, diagnosticsCount: projected.binding.posture.diagnostics.length },
      delivery: projected.delivery, observerProgress: projected.progress,
      observerRetention: { totalRetained: projected.observer.deliveries.totalRetained,
        limit: projected.observer.deliveries.limit, truncated: projected.observer.deliveries.truncated },
      packagePreflight: records.packagePreflight,
      workflow: { identity: projected.definition.identity, steps: projected.definition.steps.map(({ id, role }) => ({ id, role })),
        supported: projected.definition.supported, launchAvailable: value.workflows.data.available,
        stage: value.workflows.data.stage, runs: 0 }
    }
    evidence.limitations = ['Native workflow launch is unsupported in this normal packaged payload; only real registered definition metadata is exercised.',
      'No workflow run/task/attempt relation can be operationally certified without a supported native run.',
      'Observer sequence distance is captured progress, not elapsed lag or exact filtered deliveries.',
      'Binding posture is a public receipt projection, not private requested/effective configuration.',
      'Native Windows installed acceptance is not exercised by this Mac operation.']
    evidence.checks.push('real-native-command-attempt-root-run-and-event-history', 'public-effective-binding-receipt-and-model-posture',
      'actual-disabled-observer-dead-letter-attempt-error-and-timestamps', 'bounded-observer-delivery-retention-and-sequence-progress',
      'real-workflow-definition-steps-with-unsupported-launch-and-zero-runs', 'main-to-renderer-private-material-disclosure-boundary')

    stage = 'new-ui-fields'
    await open(evaluate, signal, host.instanceId, workspace.workspaceId)
    await assertVisible(evaluate, signal, projected)
    await click(evaluate, signal, '[data-ui~="uar-lifecycle-refresh"]')
    await visible(evaluate, signal, host.instanceId, workspace.workspaceId)
    requireFact(await selected(evaluate) === managedId && same((await current(evaluate, selector)).tasks, before.tasks),
      'C14D_INSPECTION_CHANGED_WORK_OR_MANAGED_TASKS')
    requireFact((await records.request('GET', '/api/v1/collaboration/workflow-runs')).length === 0,
      'C14D_INSPECTION_CREATED_WORKFLOW_EXECUTION')
    evidence.checks.push('selected-external-runtime-new-fields-operated-visibly', 'overview-refresh-and-work-selection-preserved')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    if (error.runtimeRequest) evidence.runtimeRequestFailure = error.runtimeRequest
    evidence.failureCode = signal.aborted ? 'C14D_OPERATION_CANCELLED_OR_TIMED_OUT'
      : /^C14[12D]_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C14D_REAL_APPLICATION_CONTRACT_UNAVAILABLE'
  } finally {
    try { await host?.stop() } catch {
      evidence.complete = false
      evidence.failureCode = 'C14D_OWNED_RUNTIME_CLEANUP_FAILED'
    }
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete, checks: evidence.checks,
    failureCode: evidence.failureCode, evidence: configuration.evidence, evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
