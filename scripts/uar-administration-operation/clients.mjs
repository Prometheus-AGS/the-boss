import { ipc, click } from '../approval-lifecycle-operation/clients.mjs'
import { waitFor } from '../approval-lifecycle-operation/io.mjs'
import { requireFact } from './io.mjs'

export { ipc, click, waitFor }
export const lifecycleRoute = (serviceInstanceId, workspaceId, panel = 'lifecycle') =>
  '/settings/uar?' + new URLSearchParams({ panel, adminInstanceId: serviceInstanceId, adminWorkspaceId: workspaceId })
export const persistedRouteExpression = `(() => {
  const cache=JSON.parse(localStorage.getItem('cs_cache_persist')??'{}');
  const tabs=[...(cache['ui.tab.normal_tabs']??[]),...(cache['ui.tab.pinned_tabs']??[])];
  return tabs.find(tab=>tab.id===cache['ui.tab.active_tab_id'])?.url??null;
})()`

export async function open(evaluate, signal, serviceInstanceId, workspaceId) {
  await ipc(evaluate, 'navigation.open_route_in_main', { path: lifecycleRoute(serviceInstanceId, workspaceId) })
  return visible(evaluate, signal, serviceInstanceId, workspaceId)
}

export async function visible(evaluate, signal, serviceInstanceId, workspaceId) {
  return waitFor(signal, () => evaluate(`(() => {
    const root=document.querySelector('[data-ui~="uar-lifecycle"]');
    const instance=document.querySelector('[data-ui~="uar-administration-instance"]');
    const workspace=document.querySelector('[data-ui~="uar-teams-workspace"]');
    const refresh=root?.querySelector('[data-ui~="uar-lifecycle-refresh"]');
    const sources=[...(root?.querySelectorAll('[data-ui~="uar-lifecycle-source"]')??[])];
    const route=${persistedRouteExpression};
    if(!root?.getClientRects().length||!instance||!workspace||!refresh||refresh.disabled||!sources.length)return false;
    if(!root.textContent.includes(${JSON.stringify(serviceInstanceId)})||!root.textContent.includes(${JSON.stringify(workspaceId)}))return false;
    if(!route||!decodeURIComponent(route).includes(${JSON.stringify('adminInstanceId=' + serviceInstanceId)})||
      !decodeURIComponent(route).includes(${JSON.stringify('adminWorkspaceId=' + workspaceId)}))return false;
    return { instanceText:instance.textContent, workspaceText:workspace.textContent,
      sourceStates:sources.map(node=>({state:node.dataset.sourceState,scope:node.dataset.sourceScope,
        readAt:node.querySelector('time')?.dateTime??null})),
      recordIds:[...root.querySelectorAll('[data-ui~="uar-lifecycle-record"]')].map(node=>node.dataset.recordId),
      disabledDetails:[...root.querySelectorAll('button')].filter(node=>node.disabled).length,
      route };
  })()`), 'C141_SELECTED_LIFECYCLE_NOT_VISIBLE')
}

export async function selectInstance(evaluate, signal, instanceId) {
  await click(evaluate, signal, '[data-ui~="uar-administration-instance"]')
  await waitFor(signal, () => evaluate(`(() => {
    const node=[...document.querySelectorAll('[role="option"]')].find(item=>
      item.getClientRects().length&&item.textContent.includes(${JSON.stringify(instanceId)}));
    if(!node||node.getAttribute('aria-disabled')==='true')return false;
    node.click();return true;
  })()`), 'C141_INSTANCE_SELECTOR_UNAVAILABLE')
}

export async function selectWorkspace(evaluate, signal, workspaceId) {
  await click(evaluate, signal, '[data-ui~="uar-teams-workspace"]')
  await click(evaluate, signal, '[role="option"][data-workspace-id=' + JSON.stringify(workspaceId) + ']')
}

export function assertSources(snapshot) {
  requireFact(snapshot.schemaVersion === 1 && snapshot.consistency === 'non-atomic', 'C141_SOURCE_CONSISTENCY_MISSING')
  requireFact(
    Number.isFinite(Date.parse(snapshot.captureStartedAt)) && Number.isFinite(Date.parse(snapshot.capturedAt)),
    'C141_CAPTURE_TIMES_MISSING'
  )
  for (const name of ['agents', 'durable', 'teams', 'workflows', 'ownership', 'approvals']) {
    const source = snapshot[name]
    requireFact(source && ['available', 'unsupported', 'unknown', 'failed'].includes(source.state), 'C141_SOURCE_STATE_MISSING')
    requireFact(source.scope === (['agents', 'ownership'].includes(name) ? 'runtime' : 'workspace'), 'C141_SOURCE_SCOPE_MISMATCH')
    requireFact(source.state !== 'available' || (source.data !== null && Number.isFinite(Date.parse(source.readAt))), 'C141_READ_TIME_MISSING')
  }
  requireFact(snapshot.teams.state === 'available', 'C141_REAL_TEAM_INVENTORY_UNAVAILABLE')
}

export function assertIdentity(snapshot, instanceId, workspaceId, ownership) {
  requireFact(
    snapshot.requested.serviceInstanceId === instanceId && snapshot.requested.workspaceId === workspaceId &&
      snapshot.effective.serviceInstanceId === instanceId && snapshot.effective.workspaceId === workspaceId &&
      snapshot.effective.ownership === ownership && snapshot.effective.runtimeId && snapshot.effective.uarVersion,
    'C141_EFFECTIVE_IDENTITY_MISMATCH'
  )
  assertSources(snapshot)
}
