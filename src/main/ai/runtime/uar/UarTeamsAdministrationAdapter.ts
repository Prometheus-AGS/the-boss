import * as z from 'zod'

import type { UarAddTeamTaskInput, UarCreateTeamInput, UarTeamInstance, UarTeamsSnapshot } from '@shared/types/uarTeams'

import { capabilityState, rawBinding, scopedRequest, workspace } from './UarDurableAdministrationAdapter'

const basePath = '/api/v1/collaboration/team-instances'
const identity = z.object({ id: z.string(), version: z.string(), digest: z.string() })
const definition = identity.extend({
  title: z.string(),
  purpose: z.string(),
  package: identity,
  members: z.array(
    z.object({
      role: z.string(),
      kind: z.enum(['agent', 'team']),
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
      definition: identity
    })
  )
})
const task = z.object({
  id: z.string(),
  title: z.string(),
  role: z.string(),
  input: z.unknown(),
  outputContract: z.unknown(),
  output: z.null(),
  dependsOn: z.array(z.string()),
  status: z.literal('queued'),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
})
const instance = z.object({
  id: z.string(),
  ownerId: z.string(),
  workspaceId: z.string(),
  revision: z.number().int().nonnegative(),
  status: z.literal('inactive'),
  definition: identity,
  package: identity,
  binding: z.object({ id: z.string(), revision: z.number().int().nonnegative() }),
  input: z.unknown(),
  members: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      ordinal: z.number().int().nonnegative(),
      definition: identity,
      revision: z.number().int().nonnegative(),
      status: z.literal('inactive')
    })
  ),
  tasks: z.array(task),
  createdAt: z.string(),
  updatedAt: z.string()
})

function scopedTeam(value: unknown, workspaceId: string): UarTeamInstance {
  const team = instance.parse(value)
  if (team.workspaceId !== workspaceId) throw new Error('UAR team workspace scope mismatch')
  return team
}

async function planningState(workspaceId: string) {
  const resolved = workspace(workspaceId)
  const state = await capabilityState()
  const capabilities = z
    .object({
      collaboration: z.object({
        activation: z.object({ teamPlanning: z.boolean().default(false) })
      })
    })
    .parse(await scopedRequest(resolved, '/api/v1/collaboration/capabilities', state.generation))
  return {
    workspaceId: resolved,
    generation: state.generation,
    planning: capabilities.collaboration.activation.teamPlanning
  }
}

export async function readUarTeams(workspaceId: string): Promise<UarTeamsSnapshot> {
  const state = await planningState(workspaceId)
  if (!state.planning) {
    return {
      schemaVersion: 1,
      workspaceId: state.workspaceId,
      generation: state.generation,
      capabilities: { planning: false },
      unavailableReason: 'team_planning_unsupported',
      definitions: [],
      bindings: [],
      instances: []
    }
  }
  const [definitions, bindings, instances] = await Promise.all([
    scopedRequest(state.workspaceId, '/api/v1/collaboration/team-definitions', state.generation),
    scopedRequest(state.workspaceId, '/api/v1/collaboration/deployment-bindings', state.generation),
    scopedRequest(state.workspaceId, basePath, state.generation)
  ])
  const scopedBindings = z.array(rawBinding).parse(bindings)
  if (scopedBindings.some((binding) => binding.workspaceId !== state.workspaceId)) {
    throw new Error('UAR team binding workspace scope mismatch')
  }
  return {
    schemaVersion: 1,
    workspaceId: state.workspaceId,
    generation: state.generation,
    capabilities: { planning: true },
    definitions: z.array(definition).parse(definitions),
    bindings: scopedBindings,
    instances: z
      .array(z.unknown())
      .parse(instances)
      .map((value) => scopedTeam(value, state.workspaceId))
  }
}

export async function createUarTeam(input: UarCreateTeamInput): Promise<UarTeamInstance> {
  const state = await planningState(input.workspaceId)
  if (!state.planning) throw new Error('UAR team planning is unavailable')
  return scopedTeam(
    await scopedRequest(state.workspaceId, basePath, state.generation, 'POST', {
      commandId: input.commandId,
      deploymentBindingId: input.deploymentBindingId,
      teamDefinition: input.teamDefinition,
      input: input.input,
      ...(input.memberSlots ? { memberSlots: input.memberSlots } : {})
    }),
    state.workspaceId
  )
}

export async function addUarTeamTask(input: UarAddTeamTaskInput): Promise<UarTeamInstance> {
  const state = await planningState(input.workspaceId)
  if (!state.planning) throw new Error('UAR team planning is unavailable')
  const target = `${basePath}/${encodeURIComponent(input.teamInstanceId)}`
  scopedTeam(await scopedRequest(state.workspaceId, target, state.generation), state.workspaceId)
  return scopedTeam(
    await scopedRequest(state.workspaceId, `${target}/tasks`, state.generation, 'POST', {
      commandId: input.commandId,
      taskId: input.taskId,
      expectedTeamRevision: input.expectedTeamRevision,
      title: input.title,
      role: input.role,
      input: input.input,
      outputContract: input.outputContract,
      dependsOn: input.dependsOn
    }),
    state.workspaceId
  )
}
