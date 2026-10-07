import { click, waitFor } from '../uar-administration-operation/clients.mjs'
import { requireFact, same } from './io.mjs'

export function assertProjection(value, records, nativeBinding, nativeRuns, credential) {
  requireFact(value.durable.state === 'available' && value.workflows.state === 'available', 'C14D_REAL_READ_SOURCE_UNAVAILABLE')
  const source = value.durable.data.instances.find((item) => item.instanceId === records.sourceView.instanceId)
  const binding = value.durable.data.bindings.find((item) => item.id === records.bindingId)
  const observer = value.durable.data.observers.find((item) => item.subscriptionId === records.subscriptionId)
  const definition = value.workflows.data.definitions.find((item) => item.identity.id === records.workflowDefinition.identity.id)
  requireFact(source && binding?.posture && observer?.deliveries && definition, 'C14D_NEW_PROJECTION_RECORD_MISSING')
  const command = source.commands.find((item) => item.commandId === records.commandId)
  const nativeCommand = records.sourceView.commands.find((item) => item.commandId === records.commandId)
  requireFact(same(command, nativeCommand) && command.attemptId && command.rootRunId && command.acceptedAt && command.updatedAt,
    'C14D_DURABLE_COMMAND_HISTORY_MISMATCH')
  for (const key of ['definitionDigest', 'bindingDigest', 'sessionId', 'reconciliationReceipt'])
    requireFact(source[key] === records.sourceView[key], 'C14D_DURABLE_IDENTITY_MISMATCH')
  requireFact(source.definitionId === records.agentIdentity.id && source.bindingId === records.bindingId && source.sessionId,
    'C14D_DURABLE_DEFINITION_BINDING_MISMATCH')
  const events = records.sourceView.events.filter((item) => item.commandId === records.commandId)
  requireFact(events.length > 0 && events.every((event) => source.events?.some((item) => same(item, event))), 'C14D_DURABLE_EVENT_HISTORY_MISMATCH')
  requireFact(source.limits.maxInbox === records.sourceView.limits.max_inbox &&
    source.limits.retainedCommands === records.sourceView.limits.retained_commands &&
    source.limits.retainedEvents === records.sourceView.limits.retained_events, 'C14D_DURABLE_RETENTION_LIMIT_MISMATCH')
  const posture = binding.posture
  const receipt = nativeBinding?.effectiveBindingReceipt
  requireFact(receipt && ['id', 'revision', 'profile', 'contentDigest', 'bindingRef', 'package', 'policyRevision',
    'runtimeCapabilities', 'admitted', 'createdAt'].every((key) => same(posture[key], receipt[key])),
  'C14D_BINDING_POSTURE_MISMATCH')
  requireFact(posture.diagnostics.length === receipt.diagnostics.length && posture.diagnostics.every((item, index) =>
    ['pointer', 'disposition', 'reasonCode', 'message'].every((key) => item[key] === receipt.diagnostics[index][key])),
  'C14D_BINDING_DIAGNOSTICS_MISMATCH')
  requireFact(posture.resolvedModels.length === receipt.resolvedModels.length && posture.resolvedModels.every((model, index) =>
    ['role', 'requestedAlias', 'providerId', 'modelId', 'profile', 'settingsRevision'].every((key) =>
      same(model[key], receipt.resolvedModels[index][key]))), 'C14D_BINDING_MODEL_POSTURE_MISMATCH')
  const privateKeys = new Set(['document', 'requested', 'effective', 'settings', 'contextGrants', 'representationGrantRefs',
    'credentialRef', 'connectionRef', 'endpoint', 'base_url', 'api_key'])
  const publicOnly = (item) => !item || typeof item !== 'object' || Object.entries(item).every(([key, child]) =>
    !privateKeys.has(key) && publicOnly(child))
  requireFact(publicOnly(binding) && !JSON.stringify(value).includes(credential), 'C14D_PRIVATE_RUNTIME_MATERIAL_DISCLOSED')
  const failed = records.observerView.subscription.inbox.find((item) => item.occurrence.command_id === records.commandId &&
    item.status === 'dead_letter' && item.last_error_code)
  const delivery = observer.deliveries.records.find((item) => item.occurrenceId === failed.occurrence_id)
  requireFact(delivery && delivery.sourceInstanceId === failed.source_instance_id && delivery.sourceSequence === failed.source_sequence &&
    delivery.observerCommandId === failed.observer_command_id && delivery.status === failed.status && delivery.attempts === failed.attempts &&
    delivery.lastErrorCode === failed.last_error_code && delivery.admittedAt === failed.admitted_at && delivery.updatedAt === failed.updated_at,
  'C14D_OBSERVER_FAILURE_METADATA_MISMATCH')
  requireFact(observer.deliveries.limit === 128 && observer.deliveries.records.length <= 128 &&
    observer.deliveries.truncated === (observer.deliveries.totalRetained > 128) &&
    observer.limits.maxRetries === records.observerView.subscription.limits.max_retries, 'C14D_OBSERVER_RETENTION_METADATA_MISMATCH')
  const progress = observer.sources.find((item) => item.sourceInstanceId === source.instanceId)
  requireFact(progress && progress.sequenceDistance === (progress.sourceHigh === null ? null :
    Math.max(0, progress.sourceHigh - (progress.cursor ?? -1))) && typeof progress.retentionGap === 'boolean',
  'C14D_OBSERVER_PROGRESS_UNAVAILABLE')
  requireFact(same(definition, records.workflowDefinition) && definition.steps.some((step) => step.id === 'classify' && step.role === 'classifier') &&
    definition.steps.some((step) => step.id === 'draft' && step.role === 'drafter') &&
    definition.supported === true && value.workflows.data.available === false && nativeRuns.length === 0 &&
    value.workflows.data.runs.length === 0, 'C14D_WORKFLOW_METADATA_OR_UNSUPPORTED_STATE_MISMATCH')
  return { source, command, events, binding, delivery, observer, progress, definition }
}

export async function assertVisible(evaluate, signal, projected) {
  const { source, command, events, binding, delivery, observer, progress, definition } = projected
  const activity = '[data-ui~="uar-lifecycle-activity"][data-instance-id=' + JSON.stringify(source.instanceId) + ']'
  await waitFor(signal, () => evaluate(`Boolean(document.querySelector(${JSON.stringify(activity)})?.getClientRects().length)`),
    'C14D_ACTIVITY_NOT_VISIBLE')
  await click(evaluate, signal, activity + ' details > summary')
  const expectations = [
    [activity, [source.sessionId]],
    ['[data-ui~="uar-lifecycle-command"][data-command-id=' + JSON.stringify(command.commandId) + ']',
      [command.commandId, command.attemptId, command.rootRunId, command.acceptedAt, command.updatedAt]],
    ['[data-ui~="uar-lifecycle-binding-posture"][data-binding-id=' + JSON.stringify(binding.id) + ']',
      [binding.posture.id, binding.posture.contentDigest, binding.posture.bindingRef.digest, binding.posture.policyRevision,
        ...binding.posture.resolvedModels.flatMap((model) => [model.providerId, model.modelId]).filter(Boolean)]],
    ['[data-ui~="uar-lifecycle-observer-delivery"][data-subscription-id=' + JSON.stringify(observer.subscriptionId) +
      '][data-delivery-id=' + JSON.stringify(delivery.occurrenceId) + ']',
      [delivery.occurrenceId, delivery.sourceInstanceId, String(delivery.sourceSequence), delivery.observerCommandId,
        String(delivery.attempts), delivery.lastErrorCode, delivery.admittedAt, delivery.updatedAt]],
    ['[data-ui~="uar-lifecycle-observer-progress"][data-source-instance-id=' + JSON.stringify(progress.sourceInstanceId) + ']',
      [progress.sequenceDistance, progress.sourceHigh, progress.retainedLow].filter((value) => value !== null).map(String)],
    ['[data-ui~="uar-lifecycle-workflow-definition"][data-definition-id=' + JSON.stringify(definition.identity.id) + ']',
      [definition.identity.id, definition.identity.digest]],
    ['[data-ui~="uar-lifecycle-workflow-definition-step"][data-definition-id=' + JSON.stringify(definition.identity.id) +
      '][data-step-id="classify"]', ['classify', 'classifier']],
    ['[data-ui~="uar-lifecycle-workflow-definition-step"][data-definition-id=' + JSON.stringify(definition.identity.id) +
      '][data-step-id="draft"]', ['draft', 'drafter']]
  ]
  await waitFor(signal, () => evaluate(`(() => {
    const checks=${JSON.stringify(expectations)};
    if(!checks.every(([selector,values])=>{
      const node=document.querySelector(selector);
      return node?.getClientRects().length&&values.every(value=>node.textContent.includes(value));
    }))return false;
    const command=document.querySelector(${JSON.stringify(expectations[1][0])});
    if(!command.querySelector('[data-ui~="uar-lifecycle-attempt"][data-attempt-id='+CSS.escape(${JSON.stringify(command.attemptId)})+']')||
      !command.querySelector('[data-ui~="uar-lifecycle-run"][data-run-id='+CSS.escape(${JSON.stringify(command.rootRunId)})+']'))return false;
    const activity=document.querySelector(${JSON.stringify(activity)});
    if(!${JSON.stringify(events)}.every(event=>{
      const node=activity.querySelector('[data-ui~="uar-lifecycle-event"][data-sequence="'+event.sequence+'"]');
      return node?.getClientRects().length&&node.querySelector('time')?.dateTime===event.committedAt;
    }))return false;
    const launch=document.querySelector('[data-ui~="uar-lifecycle-workflow-execution"]');
    return launch?.getClientRects().length&&launch.dataset.launchAvailable==='false'&&launch.dataset.launchStage&&
      !document.querySelector('[data-ui~="uar-lifecycle-workflow-step"]');
  })()`), 'C14D_NEW_LIFECYCLE_FIELDS_NOT_VISIBLE')
}
