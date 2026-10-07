import { application } from '@application'
import type {
  UarLifecycleSelector,
  UarLifecycleSnapshot,
  UarLifecycleSource
} from '@shared/types/uarLifecycleAdministration'

import { readUarAdministrationSnapshot } from './UarAdministrationAdapter'
import { readUarAgentDefinitions } from './UarCatalogAdministrationAdapter'
import { readUarDurableWorkspace, workspace } from './UarDurableAdministrationAdapter'
import { readUarExecutionOwner } from './UarExecutionOwnershipAdapter'
import { readUarTeamExecution } from './UarTeamExecutionAdapter'
import { readUarTeams } from './UarTeamsAdministrationAdapter'
import { readUarWorkflows } from './UarWorkflowExecutionAdapter'

function unavailable<TData>(
  scope: UarLifecycleSource<TData>['scope'],
  reason: string,
  state: 'unsupported' | 'unknown' = 'unsupported'
): UarLifecycleSource<TData> {
  return { state, scope, readAt: null, reason, data: null }
}

async function source<TData>(
  scope: UarLifecycleSource<TData>['scope'],
  supported: boolean,
  read: () => Promise<TData>
): Promise<UarLifecycleSource<TData>> {
  if (!supported) return unavailable(scope, 'method_unavailable')
  try {
    const data = await read()
    return { state: 'available', scope, readAt: new Date().toISOString(), data }
  } catch {
    // Remote diagnostics can contain protected authority material; retain only the source failure state.
    return { state: 'failed', scope, readAt: new Date().toISOString(), reason: 'source_read_failed', data: null }
  }
}

export async function readUarLifecycleSnapshot(input: UarLifecycleSelector): Promise<UarLifecycleSnapshot> {
  const captureStartedAt = new Date().toISOString()
  const workspaceId = workspace(input.workspaceId)
  const sidecar = application.get('UarSidecarService')
  const endpoint = input.serviceInstanceId
    ? await sidecar.resolveInstance(input.serviceInstanceId)
    : await sidecar.resolveSelected()
  const administration = await readUarAdministrationSnapshot(endpoint)
  const supports = (id: string) =>
    administration.surfaces.some(
      (surface) =>
        (surface.availability === 'available' || surface.availability === 'host_controlled') &&
        surface.methods.some(
          (method) =>
            method.id === id &&
            method.method === 'GET' &&
            method.adapter === 'available' &&
            method.apply === 'read'
        )
    )
  const [agents, durable, teams, workflows, ownership] = await Promise.all([
    source('runtime', supports('agents.discovery'), () => readUarAgentDefinitions(endpoint)),
    source(
      'workspace',
      ['collaboration.deployment_bindings.list', 'agent-instances.list', 'observers.list'].some(supports),
      () => readUarDurableWorkspace(workspaceId, endpoint)
    ),
    source('workspace', supports('collaboration.capabilities'), () => readUarTeams(workspaceId, endpoint)),
    source('workspace', supports('collaboration.capabilities'), () => readUarWorkflows(workspaceId, endpoint)),
    source('runtime', supports('team-execution.owner.read'), () => readUarExecutionOwner(endpoint))
  ])
  if (teams.data && !teams.data.capabilities.planning) {
    teams.state = 'unsupported'
    teams.reason = teams.data.unavailableReason ?? 'team_planning_unsupported'
  }
  const executions = await Promise.all(
    (teams.data?.instances ?? []).map(async (team) => ({
      teamInstanceId: team.id,
      ...(await source(
        'workspace',
        teams.data?.capabilities.execution === true && supports('team-instances.execution'),
        () => readUarTeamExecution({ workspaceId, teamInstanceId: team.id }, endpoint)
      ))
    }))
  )
  return {
    schemaVersion: 1,
    requested: { serviceInstanceId: input.serviceInstanceId ?? null, workspaceId: input.workspaceId },
    effective: {
      serviceInstanceId: endpoint.instanceId,
      runtimeId: endpoint.observed.id,
      ownership: endpoint.ownership,
      workspaceId,
      generation: endpoint.generation,
      uarVersion: endpoint.uarVersion
    },
    captureStartedAt,
    capturedAt: new Date().toISOString(),
    consistency: 'non-atomic',
    administration,
    agents,
    durable,
    teams,
    workflows,
    ownership,
    approvals: unavailable('workspace', 'workspace_scoped_approval_inventory_unavailable', 'unknown'),
    executions
  }
}
