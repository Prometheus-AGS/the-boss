import { lifecycleRoute, persistedRouteExpression } from '../uar-administration-operation/clients.mjs'
import { requireFact, waitFor } from './io.mjs'

export const actions = ['activate', 'passivate', 'drain', 'disable', 'restart', 'cancel']

export async function ipc(evaluate, name, input) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(name)},${JSON.stringify(input)})`)
  if (!result?.ok) {
    const error = new Error(typeof result?.error?.message === 'string' ? result.error.message : '')
    Object.assign(error, { code: 'C14C_APPLICATION_API_REFUSED', channel: name,
      nativeCode: result?.error?.code })
    throw error
  }
  return result.data
}

export async function select(evaluate, instanceId) {
  const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
  return ipc(evaluate, 'prometheus.uar.instances.select', { expectedRevision: inventory.revision, instanceId })
}

export async function open(evaluate, signal, instanceId, workspaceId, panel = 'durable-agent-instances') {
  const route = lifecycleRoute(instanceId, workspaceId, panel)
  await ipc(evaluate, 'navigation.open_route_in_main', { path: route })
  await waitFor(signal, () => evaluate(`(() => {
    const current=${persistedRouteExpression};
    return current && new URL(current,'http://local').searchParams.get('panel')===${JSON.stringify(panel)} &&
      new URL(current,'http://local').searchParams.get('adminInstanceId')===${JSON.stringify(instanceId)} &&
      new URL(current,'http://local').searchParams.get('adminWorkspaceId')===${JSON.stringify(workspaceId)} &&
      Boolean(document.querySelector('[aria-current="page"]'));
  })()`), 'C14C_ADMIN_ROUTE_UNAVAILABLE')
}

export async function controls(evaluate, signal, instanceId, snapshot) {
  const expected = actions.filter((action) => snapshot.capabilities.instances &&
    snapshot.operations['agent-instances.' + action]?.available)
  const observed = await waitFor(signal, () => evaluate(`(() => {
    const row=[...document.querySelectorAll('[data-ui="uar-durable-instance"]')].find(node=>
      node.getClientRects().length&&node.dataset.instanceId===${JSON.stringify(instanceId)});
    if(!row)return false;
    return [...row.querySelectorAll('[data-ui="uar-durable-action"]')].filter(node=>node.getClientRects().length)
      .map(node=>({action:node.dataset.instanceAction,disabled:node.disabled}));
  })()`), 'C14C_DURABLE_INSTANCE_NOT_VISIBLE')
  requireFact(JSON.stringify(observed.map((item) => item.action)) === JSON.stringify(expected),
    'C14C_SUPPORTED_CONTROL_VISIBILITY_MISMATCH')
  return { advertised: expected, unsupported: actions.filter((action) => !expected.includes(action)), observed }
}

export async function drain(evaluate, signal, instanceId) {
  await waitFor(signal, () => evaluate(`(() => {
    const button=[...document.querySelectorAll('[data-ui="uar-durable-action"]')].find(node=>
      node.dataset.instanceId===${JSON.stringify(instanceId)}&&node.dataset.instanceAction==='drain');
    if(!button?.getClientRects().length||button.disabled)return false;
    button.scrollIntoView({block:'center'});button.focus();button.click();return true;
  })()`), 'C14C_VISIBLE_DRAIN_UNAVAILABLE')
}

export async function hidden(evaluate, signal, workspaceId) {
  return waitFor(signal, () => evaluate(`(() => {
    const panel=document.querySelector('[data-ui="uar-durable-panel"]');
    if(!panel?.getClientRects().length||panel.dataset.workspaceId!==${JSON.stringify(workspaceId)}||
      panel.dataset.loading!=='false'||panel.dataset.capabilityInstances!=='false')return false;
    const controls=[...document.querySelectorAll('[data-ui="uar-durable-action"]')].filter(node=>node.getClientRects().length);
    const rows=[...document.querySelectorAll('[data-ui="uar-durable-instance"]')].filter(node=>node.getClientRects().length);
    return { loaded:true, capabilityInstances:false, visibleActionCount:controls.length, visibleInstanceCount:rows.length };
  })()`), 'C14C_REFUSAL_OR_UNSUPPORTED_PANEL_NOT_VISIBLE')
}

export async function fence(evaluate, signal) {
  return waitFor(signal, () => evaluate(`(() => {
    const section=[...document.querySelectorAll('section[aria-live="polite"]')].find(node=>node.getClientRects().length);
    const statuses=[...document.querySelectorAll('[role="status"]')].filter(node=>node.getClientRects().length);
    const panel=document.querySelector('[data-ui="uar-durable-panel"]');
    const workspace=document.querySelector('[data-ui="uar-teams-workspace"]');
    const buttons=[...(section?.querySelectorAll('button')??[])].filter(node=>node.getClientRects().length);
    if(!section||!statuses.length||panel||workspace||buttons.length!==1)return false;
    return {accessibleStatusVisible:true,detailWorkspaceVisible:false,durablePanelVisible:false,
      detailRecoveryNavigationVisible:true};
  })()`), 'C14C_INDEPENDENT_ADMIN_ACTION_FENCE_UNAVAILABLE')
}
