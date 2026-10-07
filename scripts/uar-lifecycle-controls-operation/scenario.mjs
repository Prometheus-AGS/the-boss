import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

import { setup } from '../approval-lifecycle-operation/setup.mjs'
import { startCooperationHost } from '../cadence/uar-team-cooperation-host.mjs'
import { digest, write, same, requireFact, waitFor, failure } from './io.mjs'
import { actions, ipc, select, open, controls, drain, hidden, fence } from './clients.mjs'

const read = (evaluate, workspaceId) => ipc(evaluate, 'prometheus.uar.durable.read', { workspaceId })
const selected = async (evaluate) => (await ipc(evaluate, 'prometheus.uar.instances.read', {})).selectedInstanceId
const processState = async (evaluate) => {
  const { uar } = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  return { state: uar.state, processId: uar.processId, startedAt: uar.startedAt,
    selectedInstanceId: uar.selectedInstanceId, effectivePort: uar.effectivePort }
}

/** Uses the real selected-runtime IPC, native host and visible product action. No turn is submitted. */
export async function scenario({ evaluate: rawEvaluate, signal }, configuration) {
  // Inherited setup/host helpers otherwise replace IPC refusal messages with generic descriptions.
  const evaluate = async (expression) => {
    const result = await rawEvaluate(expression)
    const channel = /window\.api\.ipcApi\.request\(['"]([a-zA-Z0-9_.]+)['"]/.exec(expression)?.[1]
    if (channel && result?.ok === false) {
      throw Object.assign(new Error(result.error?.message ?? ''), { code: 'C14C_APPLICATION_API_REFUSED',
        channel, nativeCode: result.error?.code })
    }
    return result
  }
  const evidence = {
    schemaVersion: 1, kind: 'uar-lifecycle-controls-packaged-operation', creationTaskRef: 'C14.2', complete: false,
    acceptanceScope: 'distinct Drain and supported-control/profile/selected-administration increment',
    normalProfile: true, experimentalOptIn: false, credentialValueRecorded: false,
    sourceRefs: configuration.sourceRefs, previousReceipts: configuration.previousReceipts,
    startedAt: new Date().toISOString(), checks: []
  }
  let host, managedId, workspaceId, stage = 'setup'
  try {
    await waitFor(signal, () => evaluate(`(() => {
      const skip=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&node.innerText.trim()==='Set up later');
      if(skip)skip.click();return Boolean(document.querySelector('#app-sidebar'));
    })()`), 'C14C_PACKAGED_ONBOARDING_UNAVAILABLE')
    const workspace = await setup(evaluate, configuration)
    workspaceId = workspace.workspaceId
    managedId = await selected(evaluate)
    const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
    requireFact(inventory.instances.some((item) => item.id === managedId && item.ownership === 'managed'),
      'C14C_MANAGED_SELECTION_REQUIRED')

    stage = 'fixed-starter-package-and-binding'
    // The existing setup configures an advertised real gateway model, without creating a team/task/attempt.
    await ipc(evaluate, 'prometheus.uar.teams.setup_starter', { workspaceId, model: workspace.model })
    const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
    const provider = sources.sources.find((item) => item.source === 'uar')?.providers.find((item) =>
      item.enabled && item.id.startsWith('boss-team-gateway-') && item.models.some((model) =>
        model.enabled && model.id === configuration.gateway.alias &&
        model.pricingIdentity?.providerId === configuration.gateway.providerId &&
        model.pricingIdentity?.modelId === configuration.gateway.modelId))
    requireFact(provider, 'C14C_CONFIGURED_STARTER_MODEL_UNAVAILABLE')
    await ipc(evaluate, 'prometheus.uar.providers.default', { id: provider.id })
    const binding = await ipc(evaluate, 'prometheus.uar.durable.setup_starter', { workspaceId })
    requireFact(binding.activationSupported, 'C14C_STARTER_BINDING_UNAVAILABLE')

    stage = 'actual-durable-create-and-activate'
    const created = await ipc(evaluate, 'prometheus.uar.durable.create_instance', {
      workspaceId, deploymentBindingId: binding.id, profile: 'on_demand'
    })
    const activated = await ipc(evaluate, 'prometheus.uar.durable.instance_action', {
      workspaceId, instanceId: created.instanceId, action: 'activate', commandId: randomUUID()
    })
    requireFact(activated.lifecycle === 'active' && activated.recovery === 'ready', 'C14C_ACTIVE_INSTANCE_UNAVAILABLE')
    const before = await read(evaluate, workspaceId)
    const beforeProcess = await processState(evaluate)
    requireFact(beforeProcess.state === 'running' && Number.isInteger(beforeProcess.processId), 'C14C_OWNED_PROCESS_UNAVAILABLE')
    const instance = before.instances.find((item) => item.instanceId === created.instanceId)
    requireFact(instance?.lifecycle === 'active', 'C14C_ACTIVATION_NOT_RETAINED')
    evidence.effectScope = { workspaceId, serviceInstanceId: managedId, instanceId: instance.instanceId,
      bindingId: binding.id, fixedStarterPackage: 'urn:boss:starter:package', providerId: provider.id,
      turnsSubmitted: 0, teamTasksSubmitted: 0, approvalDecisionsSubmitted: 0 }

    stage = 'visible-distinct-drain'
    await open(evaluate, signal, managedId, workspaceId)
    const beforeControls = await controls(evaluate, signal, instance.instanceId, before)
    requireFact(beforeControls.observed.some((item) => item.action === 'drain' && !item.disabled), 'C14C_DRAIN_NOT_ENABLED')
    await drain(evaluate, signal, instance.instanceId)
    const drained = await waitFor(signal, async () => {
      const snapshot = await read(evaluate, workspaceId)
      const value = snapshot.instances.find((item) => item.instanceId === instance.instanceId)
      const command = value?.commands.find((item) => item.kind === 'drain' &&
        !instance.commands.some((previous) => previous.commandId === item.commandId))
      return value?.lifecycle === 'dormant' && command?.status === 'completed' ? { snapshot, value, command } : false
    }, 'C14C_DRAIN_DID_NOT_REACH_DORMANT', 60000)
    const afterProcess = await processState(evaluate)
    requireFact(same(beforeProcess, afterProcess) && afterProcess.state === 'running' &&
      drained.snapshot.generation === before.generation && await selected(evaluate) === managedId,
    'C14C_DRAIN_CHANGED_RUNTIME_PROCESS_OR_SELECTION')
    const afterControls = await controls(evaluate, signal, instance.instanceId, drained.snapshot)
    evidence.drain = { before: { lifecycle: instance.lifecycle, revision: instance.revision, epoch: instance.epoch },
      after: { lifecycle: drained.value.lifecycle, revision: drained.value.revision, epoch: drained.value.epoch,
        activeRunId: drained.value.activeRunId, queueDepth: drained.value.queueDepth },
      command: drained.command, beforeProcess, afterProcess, generation: drained.snapshot.generation,
      beforeControls, afterControls }
    evidence.checks.push('actual-selected-runtime-create-and-activate', 'visible-distinct-drain-to-dormant',
      'drain-completed-command-retained', 'uar-process-remained-alive-with-same-pid-start-and-generation',
      'supported-controls-displayed-from-advertised-methods')

    stage = 'actual-unsupported-memory-profile'
    host = await startCooperationHost({ evaluate, signal, repository: configuration.repository,
      selectInstance: false, experimentalStage: false, durableStorage: false })
    requireFact(host.evidence.stage === 'normal' && host.evidence.databaseDurabilityAttested === false,
      'C14C_MEMORY_PROFILE_HELPER_REQUIRED')
    evidence.externalRuntime = host.evidence
    const memory = await ipc(evaluate, 'prometheus.uar.lifecycle.snapshot', { workspaceId, serviceInstanceId: host.instanceId })
    requireFact(memory.effective.ownership === 'external' && memory.effective.serviceInstanceId === host.instanceId &&
      ['available', 'unsupported'].includes(memory.durable.state) &&
      (!memory.durable.data || memory.durable.data.capabilities.instances === false),
    'C14C_REAL_PROFILE_REFUSAL_UNAVAILABLE')

    stage = 'independent-admin-ownership-action-fence'
    await open(evaluate, signal, host.instanceId, workspaceId)
    const blocked = await fence(evaluate, signal)
    requireFact(await selected(evaluate) === managedId && same(await read(evaluate, workspaceId), drained.snapshot) &&
      same(await processState(evaluate), afterProcess), 'C14C_FENCED_INSPECTION_CHANGED_MANAGED_STATE')
    evidence.ownershipRefusal = { requestedInstanceId: host.instanceId, selectedInstanceId: managedId,
      actualExternalOwnership: memory.effective.ownership, refusedDetail: 'durable-agent-instances',
      visible: blocked, unsupportedMutationInvoked: false, externalProcessRestartInvoked: false }
    evidence.checks.push('independent-admin-detail-action-fence-with-work-selection-and-native-state-preserved')

    stage = 'selected-memory-profile-hidden-controls'
    await select(evaluate, host.instanceId)
    const unsupported = await read(evaluate, workspaceId)
    requireFact(!unsupported.capabilities.instances && unsupported.instances.length === 0 &&
      actions.every((action) => !unsupported.operations['agent-instances.' + action].available),
    'C14C_MEMORY_PROFILE_ADVERTISED_DURABLE_CONTROL')
    await open(evaluate, signal, host.instanceId, workspaceId)
    const absent = await hidden(evaluate, signal, workspaceId)
    requireFact(absent.visibleActionCount === 0 && absent.visibleInstanceCount === 0, 'C14C_UNSUPPORTED_CONTROLS_VISIBLE')
    const tested = await ipc(evaluate, 'prometheus.uar.instances.test', { instanceId: host.instanceId })
    requireFact(tested.instances.find((item) => item.id === host.instanceId)?.checks.operational,
      'C14C_EXTERNAL_PROCESS_NO_LONGER_OPERATIONAL')
    evidence.profileRefusal = { serviceInstanceId: host.instanceId, durableSourceState: memory.durable.state,
      durableSourceReason: memory.durable.reason, capabilities: unsupported.capabilities,
      operations: Object.fromEntries(actions.map((action) => [action, unsupported.operations['agent-instances.' + action]])),
      visible: absent, nativeConnectionOperationalAfterRead: true, unsupportedMutationInvoked: false }
    evidence.checks.push('real-unattested-memory-profile-declares-durable-unsupported',
      'loaded-unsupported-profile-hides-all-six-durable-verbs-without-invoking-them')

    stage = 'restore-selected-runtime'
    await select(evaluate, managedId)
    requireFact(same(await read(evaluate, workspaceId), drained.snapshot) && same(await processState(evaluate), afterProcess),
      'C14C_RESTORED_MANAGED_STATE_CHANGED')
    evidence.checks.push('managed-runtime-selection-restored-with-drained-instance-retained')
    evidence.limitations = ['Drain is exercised on an active, idle on_demand instance; no in-flight inference is submitted.',
      'Prior two-client approval, stale-decision, detach/reattach and cancellation/Stop effects retain only their recorded source boundaries.',
      'The external local memory profile exercises durability refusal and the existing selected-administration fence; no remote federation is exercised.',
      'Native Windows installed acceptance remains pending; this is a bounded Mac packaged operation.']
    evidence.complete = true
  } catch (error) {
    evidence.failure = failure(error, stage, signal)
    if (stage === 'visible-distinct-drain' && !signal.aborted) {
      try {
        const diagnostic = await evaluate(`(() => {
          const alerts=[...document.querySelectorAll('[role="alert"]')].filter(node=>node.getClientRects().length);
          return alerts.map(node=>node.textContent).find(text=>/UAR request (GET|POST|PUT|DELETE).*HTTP \\d{3}/.test(text))??'';
        })()`)
        if (diagnostic) evidence.actionFailure = failure(new Error(diagnostic), stage, signal)
      } catch (diagnosticError) {
        evidence.diagnosticFailure = failure(diagnosticError, 'read-visible-action-refusal', signal)
      }
    }
  } finally {
    try {
      if (managedId && await selected(evaluate) !== managedId) await select(evaluate, managedId)
    } catch (error) {
      evidence.complete = false
      evidence.cleanupFailure = failure(error, 'restore-managed-selection', signal)
    }
    try {
      await host?.stop()
    } catch (error) {
      evidence.complete = false
      evidence.hostCleanupFailure = failure(error, 'stop-owned-external-host', signal)
    }
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failure: evidence.failure, cleanupFailure: evidence.cleanupFailure,
    hostCleanupFailure: evidence.hostCleanupFailure,
    evidence: configuration.evidence, evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
