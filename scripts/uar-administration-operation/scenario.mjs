import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

import { setup } from '../approval-lifecycle-operation/setup.mjs'
import { startCooperationHost } from '../cadence/uar-team-cooperation-host.mjs'
import { team, task, current, workspace } from '../cadence/uar-team-operation-tools.mjs'
import { digest, write, same, requireFact } from './io.mjs'
import { ipc, click, waitFor, open, visible, selectInstance, selectWorkspace, lifecycleRoute, persistedRouteExpression, assertIdentity } from './clients.mjs'

const snapshot = (evaluate, serviceInstanceId, workspaceId) =>
  ipc(evaluate, 'prometheus.uar.lifecycle.snapshot', { serviceInstanceId, workspaceId })
const selected = async (evaluate) => (await ipc(evaluate, 'prometheus.uar.instances.read', {})).selectedInstanceId
const sourceReceipt = (value) => ({
  requested: value.requested,
  effective: value.effective,
  captureStartedAt: value.captureStartedAt,
  capturedAt: value.capturedAt,
  consistency: value.consistency,
  executionProfileStage: value.teams.data?.executionProfileStage ?? null,
  sources: Object.fromEntries(['agents', 'durable', 'teams', 'workflows', 'ownership', 'approvals'].map((name) => {
    const { state, scope, readAt, reason } = value[name]
    return [name, { state, scope, readAt, ...(reason ? { reason } : {}) }]
  }))
})

function isolated(value, teamId, taskIds) {
  requireFact(
    !value.teams.data.instances.some((item) => item.id === teamId || item.tasks.some((task) => taskIds.includes(task.id))),
    'C141_TASK_SCOPE_LEAK'
  )
}

async function managedRecords(evaluate, signal, view, selector, assignment, dependentId) {
  requireFact(
    [selector.teamInstanceId, selector.teamInstanceId + '/' + assignment.taskId, selector.teamInstanceId + '/' + dependentId]
      .every((id) => view.recordIds.includes(id)),
    'C141_MANAGED_TASK_RECORD_NOT_VISIBLE'
  )
  await waitFor(signal, () => evaluate(`(() => {
    const records=[...document.querySelectorAll('[data-ui~="uar-lifecycle-record"]')];
    const assigned=records.find(node=>node.dataset.recordId===${JSON.stringify(selector.teamInstanceId + '/' + assignment.taskId)});
    const dependent=records.find(node=>node.dataset.recordId===${JSON.stringify(selector.teamInstanceId + '/' + dependentId)});
    return assigned?.textContent.includes(${JSON.stringify(assignment.memberId)})&&
      [...(dependent?.querySelectorAll('a')??[])].some(node=>node.textContent===${JSON.stringify(assignment.taskId)});
  })()`), 'C141_ASSIGNMENT_OR_DEPENDENCY_NOT_VISIBLE')
}

export async function scenario({ evaluate, signal }, configuration) {
  const evidence = {
    schemaVersion: 1,
    kind: 'selected-uar-administration-packaged-operation',
    creationTaskRef: 'C14.1',
    complete: false,
    acceptanceScope: 'selected lifecycle administration increment; no full C14.1 or Windows installed acceptance',
    normalProfile: true,
    experimentalOptIn: false,
    credentialValueRecorded: false,
    startedAt: new Date().toISOString(),
    sourceRefs: configuration.sourceRefs,
    checks: []
  }
  let host, stage = 'setup'
  try {
    await waitFor(signal, () => evaluate(`(() => {
      const skip=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&node.innerText.trim()==='Set up later');
      if(skip)skip.click();return Boolean(document.querySelector('#app-sidebar'));
    })()`), 'C141_PACKAGED_ONBOARDING_UNAVAILABLE')
    const configurationSelection = await setup(evaluate, configuration)
    const managedId = await selected(evaluate)
    const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
    requireFact(inventory.instances.some((item) => item.id === managedId && item.ownership === 'managed'), 'C141_MANAGED_RUNTIME_REQUIRED')
    const selector = await team(evaluate, configurationSelection.workspaceId, configurationSelection.model, configuration.marker)
    const assignment = await task(evaluate, selector, 'coordinator', configuration.marker + ' assigned task', 'Inspect lifecycle assignment', null)
    const dependentId = randomUUID()
    const beforeDependency = await current(evaluate, selector)
    await ipc(evaluate, 'prometheus.uar.teams.add_task', {
      ...selector, commandId: randomUUID(), taskId: dependentId, expectedTeamRevision: beforeDependency.revision,
      title: configuration.marker + ' dependent task', role: 'worker', input: { instruction: 'Inspect lifecycle dependency' },
      outputContract: { type: 'string' }, dependsOn: [assignment.taskId]
    })
    const before = await current(evaluate, selector)
    const assigned = before.tasks.find((item) => item.id === assignment.taskId)
    const dependent = before.tasks.find((item) => item.id === dependentId)
    requireFact(assigned?.assigneeMemberId === assignment.memberId && dependent?.dependsOn.includes(assignment.taskId), 'C141_DURABLE_TASK_SETUP_UNAVAILABLE')
    const otherWorkspaceId = await workspace(evaluate, configuration.marker + ' isolated workspace')
    host = await startCooperationHost({ evaluate, signal, repository: configuration.repository, selectInstance: false, experimentalStage: false })
    host.setOwner(before.ownerId)
    requireFact(await selected(evaluate) === managedId, 'C141_HOST_SETUP_CHANGED_WORK_SELECTION')
    evidence.workSelection = managedId
    evidence.selector = selector
    evidence.taskIds = [assignment.taskId, dependentId]
    evidence.externalRuntime = host.evidence
    evidence.checks.push('real-managed-and-external-packaged-runtimes-with-disposable-surrealdb', 'normal-profile-without-experimental-stage')

    stage = 'actual-runtime-scope'
    const managed = await snapshot(evaluate, managedId, selector.workspaceId)
    const external = await snapshot(evaluate, host.instanceId, selector.workspaceId)
    const other = await snapshot(evaluate, managedId, otherWorkspaceId)
    assertIdentity(managed, managedId, selector.workspaceId, 'managed')
    assertIdentity(external, host.instanceId, selector.workspaceId, 'external')
    assertIdentity(other, managedId, otherWorkspaceId, 'managed')
    requireFact(external.effective.runtimeId === host.instanceId && external.effective.runtimeId !== managed.effective.runtimeId, 'C141_RUNTIME_IDENTITY_COLLISION')
    requireFact(managed.teams.data.instances.some((item) => item.id === before.id && same(item.tasks, before.tasks)), 'C141_MANAGED_RECORDS_MISSING')
    isolated(external, selector.teamInstanceId, evidence.taskIds)
    isolated(other, selector.teamInstanceId, evidence.taskIds)
    const actualExternalTeams = await host.trustedRequest({ workspaceId: selector.workspaceId, path: '/api/v1/collaboration/team-instances' })
    requireFact(Array.isArray(actualExternalTeams) && actualExternalTeams.length === 0 && external.teams.data.instances.length === 0, 'C141_EXTERNAL_EMPTY_INVENTORY_MISMATCH')
    evidence.snapshots = { managed: sourceReceipt(managed), external: sourceReceipt(external), otherWorkspace: sourceReceipt(other) }
    evidence.checks.push('effective-requested-runtime-and-workspace-identity', 'per-source-state-scope-read-times-and-non-atomic-capture', 'actual-task-isolation-between-runtimes-and-workspaces')

    stage = 'managed-ui'
    const managedView = await open(evaluate, signal, managedId, selector.workspaceId)
    await managedRecords(evaluate, signal, managedView, selector, assignment, dependentId)
    requireFact(managedView.sourceStates.some((item) => item.state === 'unknown' && item.scope === 'workspace'), 'C141_UNKNOWN_APPROVAL_SOURCE_NOT_VISIBLE')
    await click(evaluate, signal, '[data-ui~="uar-lifecycle-refresh"]')
    await managedRecords(evaluate, signal, await visible(evaluate, signal, managedId, selector.workspaceId), selector, assignment, dependentId)
    evidence.checks.push('managed-overview-assignment-dependency-and-source-status-visible', 'overview-refresh-operated')

    stage = 'selected-ui-isolation'
    await selectInstance(evaluate, signal, host.instanceId)
    const externalView = await visible(evaluate, signal, host.instanceId, selector.workspaceId)
    requireFact(!externalView.recordIds.includes(selector.teamInstanceId) && externalView.disabledDetails >= 4, 'C141_EXTERNAL_DETAIL_ACTIONS_OR_TASK_SCOPE_UNSAFE')
    requireFact(await selected(evaluate) === managedId, 'C141_INSPECTION_CHANGED_WORK_SELECTION')
    await selectWorkspace(evaluate, signal, otherWorkspaceId)
    const otherView = await visible(evaluate, signal, host.instanceId, otherWorkspaceId)
    requireFact(!otherView.recordIds.includes(selector.teamInstanceId), 'C141_WORKSPACE_SELECTOR_LEAKED_TASKS')
    await selectWorkspace(evaluate, signal, selector.workspaceId)
    await visible(evaluate, signal, host.instanceId, selector.workspaceId)
    evidence.checks.push('administration-runtime-and-workspace-selectors-operated-without-work-selection-change', 'external-overview-excludes-managed-tasks-and-disables-global-detail-actions')

    stage = 'route-reopening'
    await evaluate('setTimeout(()=>location.reload(),50);true')
    await delay(1000, undefined, { signal })
    const reopened = await visible(evaluate, signal, host.instanceId, selector.workspaceId)
    const routeText = decodeURIComponent(reopened.route)
    requireFact(routeText.includes('adminInstanceId=' + host.instanceId) && routeText.includes('adminWorkspaceId=' + selector.workspaceId), 'C141_REOPEN_LOST_INSPECTION_SELECTORS')
    requireFact(await selected(evaluate) === managedId, 'C141_REOPEN_CHANGED_WORK_SELECTION')
    evidence.checks.push('renderer-reopening-retains-administration-selectors')

    stage = 'external-detail-route-block'
    await ipc(evaluate, 'navigation.open_route_in_main', { path: lifecycleRoute(host.instanceId, selector.workspaceId, 'teams') })
    await waitFor(signal, () => evaluate(`(() => {
      const route=decodeURIComponent(${persistedRouteExpression}??'');
      return route.includes('panel=teams')&&route.includes(${JSON.stringify('adminInstanceId=' + host.instanceId)})&&
        !document.querySelector('[data-ui~="uar-lifecycle"]')&&!document.querySelector('[data-ui~="uar-teams-workspace"]')&&
        !document.querySelector('[data-ui~="teams-run"]');
    })()`), 'C141_EXTERNAL_DETAIL_ROUTE_NOT_BLOCKED')
    await open(evaluate, signal, host.instanceId, selector.workspaceId)
    requireFact(await selected(evaluate) === managedId && same((await current(evaluate, selector)).tasks, before.tasks), 'C141_INSPECTION_MUTATED_MANAGED_TASKS')
    const externalAfter = await host.trustedRequest({ workspaceId: selector.workspaceId, path: '/api/v1/collaboration/team-instances' })
    requireFact(same(externalAfter, actualExternalTeams), 'C141_INSPECTION_MUTATED_EXTERNAL_TASKS')
    await selectInstance(evaluate, signal, managedId)
    await managedRecords(evaluate, signal, await visible(evaluate, signal, managedId, selector.workspaceId), selector, assignment, dependentId)
    evidence.checks.push('direct-external-detail-route-blocked', 'inspection-and-detail-navigation-preserve-both-runtimes-and-work-selection')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted ? 'C141_OPERATION_CANCELLED_OR_TIMED_OUT'
      : /^C14[12]_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C141_REAL_APPLICATION_CONTRACT_UNAVAILABLE'
  } finally {
    try { await host?.stop() } catch {
      evidence.complete = false
      evidence.failureCode = 'C141_OWNED_RUNTIME_CLEANUP_FAILED'
    }
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return {
    passed: evidence.complete,
    observedBehavior: JSON.stringify({ complete: evidence.complete, checks: evidence.checks, failureCode: evidence.failureCode,
      evidence: configuration.evidence, evidenceSha256: digest(fs.readFileSync(configuration.evidence)) })
  }
}
