import { click, fill, request } from './dashboard.mjs'
import { digest, requireFact, waitFor } from './io.mjs'

const ui = name => '[data-ui~="uar-workflow-' + name + '"]'
const terminal = state => ['completed', 'failed', 'cancelled'].includes(state)
export const runPath = id => '/api/workflows/runs/' + encodeURIComponent(id)
export const delegationPath = id => '/api/uar/delegations/' + encodeURIComponent(id)

export async function retainedDelegation(guest, runId, bossTaskId) {
  const record = await request(guest, 'GET', runPath(runId))
  const current = record.uar_delegations?.find(item => item.delegation.bossTaskId === bossTaskId)?.delegation
  requireFact(current?.workflow?.workflowRunId === runId, 'C14W_RETAINED_WORKFLOW_DELEGATION_UNAVAILABLE')
  return current
}

export function projection(value) {
  return Object.fromEntries(['bossTaskId', 'delegationId', 'targetBindingId', 'definitionMode', 'workspaceId',
    'selectedInstanceId', 'definition', 'delegatedHostContextId', 'uarTaskId', 'uarThreadId', 'uarRootRunId', 'uarRunId',
    'admissionState', 'executionState', 'cancellationState', 'effectState', 'recoveryState',
    'bossProjectionRetention', 'revision', 'cursor', 'runtimeEpoch', 'retention', 'cancellation',
    'detached', 'createdAt', 'terminalAt', 'workflow'].filter(key => value[key] !== undefined)
    .map(key => [key, value[key]]))
}

export async function author(guest, signal, prepared, marker) {
  const target = { targetBindingId: prepared.binding.id, workspaceId: prepared.workspace.workspaceId,
    definition: { id: prepared.identityRecord.definitionId, version: prepared.identityRecord.definitionVersion,
      digest: prepared.identityRecord.definitionDigest }, run: {} }
  const status = await request(guest, 'GET', '/api/uar/status')
  const contexts = (status.delegatedHostContexts ?? []).filter(context =>
    context.workspaceId === target.workspaceId && context.binding.id === target.targetBindingId &&
    ['id', 'version', 'digest'].every(key => context.definition[key] === target.definition[key]) &&
    Date.parse(context.expiresAt) > Date.now())
  requireFact(contexts.length === 1, 'C14W_EXACT_APPLIED_HOST_CONTEXT_UNAVAILABLE')
  prepared.hostContext = contexts[0]
  target.delegatedHostContextId = contexts[0].contextId
  const created = await request(guest, 'POST', '/api/workflows', { name: marker, description: 'Disposable ordinary bound workflow',
    steps: [{ name: 'ordinary-bound-step', agent_type: 'assistant', prompt: '{{input}}', mode: 'sequential', timeout_secs: 120 }] })
  const workflowId = created.workflow_id
  requireFact(workflowId, 'C14W_REAL_WORKFLOW_CREATION_UNAVAILABLE')
  await guest(`location.assign('/dashboard/canvas?wf='+${JSON.stringify(workflowId)});true`)
  await click(guest, signal, '.react-flow__node')
  await waitFor(signal, () => guest(`(() => {
    const node=document.querySelector(${JSON.stringify(ui('target'))});if(!node)return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(node,'uar_bound');
    node.dispatchEvent(new Event('change',{bubbles:true}));return true;
  })()`), 'C14W_VISIBLE_ORDINARY_UAR_TARGET_UNAVAILABLE')
  for (const [name, value] of [['binding', target.targetBindingId], ['workspace', target.workspaceId],
    ['definition-id', target.definition.id], ['definition-version', target.definition.version],
    ['definition-digest', target.definition.digest]]) await fill(guest, signal, ui(name), value)
  const selectedConnection = await guest(`document.querySelector(${JSON.stringify(ui('connection'))})?.dataset.instanceId`)
  requireFact(selectedConnection === prepared.runtimeId, 'C14W_EDITOR_SELECTED_CONNECTION_MISMATCH')
  await waitFor(signal, () => guest(`(() => {
    const node=document.querySelector(${JSON.stringify(ui('host-context'))});
    return node?.dataset.contextAvailable==='true' && node.dataset.contextId===${JSON.stringify(target.delegatedHostContextId)};
  })()`), 'C14W_VISIBLE_EXACT_HOST_CONTEXT_UNAVAILABLE')
  await click(guest, signal, ui('step-save'))
  await waitFor(signal, () => guest(`(() => {
    const button=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&node.innerText.trim()==='Save');
    if(!button||button.disabled)return false;button.click();return true;
  })()`), 'C14W_VISIBLE_ORDINARY_WORKFLOW_SAVE_UNAVAILABLE')
  const saved = await waitFor(signal, async () => {
    const value = await request(guest, 'GET', '/api/workflows/' + encodeURIComponent(workflowId))
    return value.steps?.find(step => step.name === 'ordinary-bound-step')?.agent?.uar_bound ? value : false
  }, 'C14W_ORDINARY_BOUND_WORKFLOW_NOT_PERSISTED')
  const authored = saved.steps.find(step => step.name === 'ordinary-bound-step').agent.uar_bound
  requireFact(authored.targetBindingId === target.targetBindingId && authored.workspaceId === target.workspaceId &&
    ['id', 'version', 'digest'].every(key => authored.definition[key] === target.definition[key]) &&
    authored.delegatedHostContextId === target.delegatedHostContextId &&
    Object.keys(authored.run).length === 0, 'C14W_PERSISTED_TARGET_IDENTITY_MISMATCH')
  await guest("location.assign('/dashboard/workflows');true")
  await waitFor(signal, () => guest(`(() => {
    const name=[...document.querySelectorAll('span')].find(node=>node.textContent===${JSON.stringify(marker)});
    const row=name?.closest('div.group');if(!row)return false;row.scrollIntoView({block:'center'});row.click();return true;
  })()`), 'C14W_VISIBLE_DISPOSABLE_WORKFLOW_SELECTION_UNAVAILABLE')
  await waitFor(signal, () => guest(`Boolean(document.querySelector(${JSON.stringify(ui('run-input'))}))`),
    'C14W_ORDINARY_WORKFLOW_RUN_UI_UNAVAILABLE')
  return { id: workflowId, stepName: 'ordinary-bound-step', target, configuredThroughCanvas: true }
}

export async function start(guest, signal, workflow, input, runs) {
  const previous = await request(guest, 'GET', '/api/workflows/' + encodeURIComponent(workflow.id) + '/runs')
  await fill(guest, signal, ui('run-input'), input)
  await click(guest, signal, ui('run'))
  const run = await waitFor(signal, async () => {
    const records = await request(guest, 'GET', '/api/workflows/' + encodeURIComponent(workflow.id) + '/runs')
    return records.find(record => !previous.some(old => old.id === record.id)) ?? false
  }, 'C14W_UI_RUN_ADMISSION_UNAVAILABLE', 60000)
  runs.push(run.id)
  return waitFor(signal, async () => {
    const record = await request(guest, 'GET', runPath(run.id))
    const item = record.uar_delegations?.find(item => item.step_name === workflow.stepName)
    return item?.delegation?.uarTaskId ? { runId: run.id, delegation: item.delegation } : false
  }, 'C14W_REAL_WORKFLOW_UAR_CORRELATION_UNAVAILABLE', 60000)
}

export async function observe(guest, signal, started, prepared, workflow, completed) {
  const current = await waitFor(signal, async () => {
    const value = await retainedDelegation(guest, started.runId, started.delegation.bossTaskId)
    return (!completed || terminal(value.executionState)) && value.uarRunId ? value : false
  }, 'C14W_NATIVE_EXECUTION_STATE_UNAVAILABLE', 120000, 1000)
  requireFact(current.definitionMode === 'bound' && current.targetBindingId === prepared.binding.id &&
    current.workspaceId === prepared.workspace.workspaceId && current.selectedInstanceId === prepared.runtimeId &&
    current.workflow?.workflowId === workflow.id && current.workflow.workflowRunId === started.runId &&
    current.workflow.stepName === workflow.stepName && current.definition.digest === workflow.target.definition.digest &&
    current.delegatedHostContextId === workflow.target.delegatedHostContextId &&
    current.delegationId && current.uarRootRunId && current.uarTaskId && current.uarRunId,
  'C14W_AUTHORITATIVE_CORRELATION_MISMATCH')
  const selector = ui('delegation') + '[data-boss-task-id=' + JSON.stringify(current.bossTaskId) + ']'
  await waitFor(signal, () => guest(`(() => {
    const node=document.querySelector(${JSON.stringify(selector)});
    if(!node)return false;node.scrollIntoView({block:'center'});
    return node.dataset.uarTaskId===${JSON.stringify(current.uarTaskId)} &&
      node.dataset.uarRunId===${JSON.stringify(current.uarRunId)} &&
      node.dataset.delegationId===${JSON.stringify(current.delegationId)} &&
      node.dataset.workflowRunId===${JSON.stringify(started.runId)};
  })()`), 'C14W_VISIBLE_NATIVE_CORRELATION_UNAVAILABLE')
  return { current, selector, receipt: { ...projection(current),
    observationSource: runPath(started.runId), observationMode: 'retained-workflow-projection' } }
}

export async function output(guest, signal, observed, marker) {
  requireFact(observed.current.executionState === 'completed' && observed.current.output?.includes(marker),
    'C14W_REAL_OUTPUT_NOT_COMPLETED')
  await waitFor(signal, () => guest(`document.querySelector(${JSON.stringify(observed.selector + ' ' + ui('output'))})?.textContent.includes(${JSON.stringify(marker)})`),
    'C14W_VISIBLE_NATIVE_OUTPUT_UNAVAILABLE', 60000)
  return { sha256: digest(observed.current.output), length: observed.current.output.length, expectedMarkerVisible: true }
}

export async function cancel(guest, signal, observed) {
  requireFact(!terminal(observed.current.executionState), 'C14W_CANCELLATION_BOUNDARY_ALREADY_TERMINAL')
  await click(guest, signal, observed.selector + ' ' + ui('cancel'))
  await click(guest, signal, observed.selector + ' ' + ui('cancel-confirm'))
  const receipt = await waitFor(signal, async () => {
    const value = await retainedDelegation(guest, observed.current.workflow.workflowRunId, observed.current.bossTaskId)
    return value.cancellation?.terminal && value.executionState === 'cancelled' ? value : false
  }, 'C14W_AUTHORITATIVE_CANCELLATION_UNSETTLED', 120000, 1000)
  requireFact(receipt.cancellation.requested && receipt.cancellation.acknowledged && !receipt.cancellation.cleanupUncertain &&
    receipt.uarTaskId === observed.current.uarTaskId && receipt.uarRunId === observed.current.uarRunId &&
    receipt.selectedInstanceId === observed.current.selectedInstanceId, 'C14W_CANCELLATION_ORIGINAL_AUTHORITY_MISMATCH')
  return projection(receipt)
}
