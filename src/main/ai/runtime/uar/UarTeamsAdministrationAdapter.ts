import * as z from 'zod'

import type {
  UarAddTeamTaskInput,
  UarCreateTeamInput,
  UarTeamInstance,
  UarTeamMailboxMessage,
  UarTeamMailboxPage,
  UarTeamMailboxSendInput,
  UarTeamTaskCommandInput,
  UarTeamTaskStateInput,
  UarTeamsSnapshot
} from '@shared/types/uarTeams'

import { capabilityState, rawBinding, scopedRequest, workspace } from './UarDurableAdministrationAdapter'

const basePath = '/api/v1/collaboration/team-instances'
const identity = z.object({ id: z.string(), version: z.string(), digest: z.string() })
const definition = identity.extend({
  title: z.string(),
  purpose: z.string(),
  package: identity,
  budget: z
    .object({
      maxTokens: z.number(),
      maxCostMicrounits: z.number(),
      currency: z.string(),
      maxElapsedSeconds: z.number()
    })
    .optional(),
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
  output: z.unknown().nullable(),
  dependsOn: z.array(z.string()),
  status: z.enum(['queued', 'ready', 'running', 'blocked', 'succeeded', 'failed', 'cancelled']),
  revision: z.number().int().nonnegative(),
  assigneeMemberId: z.string().nullable().default(null),
  ownershipEpoch: z.number().int().nonnegative().default(0),
  assignmentAuthority: z
    .object({
      bindingId: z.string(),
      bindingRevision: z.number().int().nonnegative(),
      workspaceId: z.string(),
      role: z.string(),
      memberId: z.string(),
      ownershipEpoch: z.number().int().nonnegative(),
      canExecute: z.literal(false),
      canUseTools: z.literal(false)
    })
    .nullable()
    .default(null),
  reviewerMemberId: z.string().nullable().default(null),
  reviewerEpoch: z.number().int().nonnegative().default(0),
  stateReason: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
})
const instance = z.object({
  id: z.string(),
  ownerId: z.string(),
  workspaceId: z.string(),
  revision: z.number().int().nonnegative(),
  status: z.enum(['inactive', 'running', 'revoked', 'stopped', 'cancelled']),
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
      status: z.enum(['inactive', 'running', 'revoked', 'stopped', 'cancelled'])
    })
  ),
  tasks: z.array(task),
  createdAt: z.string(),
  updatedAt: z.string()
})
const mailboxMessage = z.object({
  messageId: z.string(),
  ownerId: z.string(),
  workspaceId: z.string(),
  teamId: z.string(),
  senderOwnerId: z.string(),
  recipientMemberId: z.string(),
  recipientMemberRevision: z.number().int().nonnegative(),
  taskId: z.string().nullish(),
  taskEpoch: z.number().int().nonnegative().nullish(),
  mode: z.enum(['queue-only', 'trigger-turn']),
  content: z.string(),
  status: z.enum(['accepted', 'delivered', 'processed']),
  acceptedAt: z.string(),
  deliveredAt: z.string().nullish(),
  processedAt: z.string().nullish(),
  processedTurnId: z.string().nullish()
})

export function scopedTeam(value: unknown, workspaceId: string): UarTeamInstance {
  const team = instance.parse(value)
  if (team.workspaceId !== workspaceId) throw new Error('UAR team workspace scope mismatch')
  return team
}

export async function planningState(workspaceId: string) {
  const resolved = workspace(workspaceId)
  const state = await capabilityState()
  const capabilities = z
    .object({
      collaboration: z.object({
        activation: z.object({
          teamPlanning: z.boolean().default(false),
          taskOwnership: z.boolean().default(false),
          teamMailbox: z.boolean().default(false),
          teamExecution: z.boolean().default(false)
        })
      })
    })
    .parse(await scopedRequest(resolved, '/api/v1/collaboration/capabilities', state.generation))
  return {
    workspaceId: resolved,
    generation: state.generation,
    planning: capabilities.collaboration.activation.teamPlanning,
    ownership: capabilities.collaboration.activation.taskOwnership,
    mailbox: capabilities.collaboration.activation.teamMailbox,
    execution: capabilities.collaboration.activation.teamExecution
  }
}

export async function readUarTeams(workspaceId: string): Promise<UarTeamsSnapshot> {
  const state = await planningState(workspaceId)
  if (!state.planning) {
    return {
      schemaVersion: 1,
      workspaceId: state.workspaceId,
      generation: state.generation,
      capabilities: { planning: false, ownership: false, mailbox: false, execution: false },
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
    capabilities: { planning: true, ownership: state.ownership, mailbox: state.mailbox, execution: state.execution },
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

async function mutateTeamTask(
  input: Omit<UarTeamTaskCommandInput, 'memberId'>,
  action: 'claim' | 'reassign' | 'reviewer' | 'state',
  payload: object
): Promise<UarTeamInstance> {
  const state = await planningState(input.workspaceId)
  if (!state.ownership) throw new Error('UAR team task ownership is unavailable')
  const target = `${basePath}/${encodeURIComponent(input.teamInstanceId)}`
  scopedTeam(await scopedRequest(state.workspaceId, target, state.generation), state.workspaceId)
  return scopedTeam(
    await scopedRequest(
      state.workspaceId,
      `${target}/tasks/${encodeURIComponent(input.taskId)}/${action}`,
      state.generation,
      'POST',
      {
        commandId: input.commandId,
        expectedTeamRevision: input.expectedTeamRevision,
        expectedTaskRevision: input.expectedTaskRevision,
        ...payload
      }
    ),
    state.workspaceId
  )
}

export async function claimUarTeamTask(input: UarTeamTaskCommandInput): Promise<UarTeamInstance> {
  return mutateTeamTask(input, 'claim', { memberId: input.memberId })
}

export async function reassignUarTeamTask(input: UarTeamTaskCommandInput): Promise<UarTeamInstance> {
  return mutateTeamTask(input, 'reassign', { memberId: input.memberId })
}

export async function assignUarTeamReviewer(input: UarTeamTaskCommandInput): Promise<UarTeamInstance> {
  return mutateTeamTask(input, 'reviewer', { memberId: input.memberId })
}

export async function updateUarTeamTaskState(input: UarTeamTaskStateInput): Promise<UarTeamInstance> {
  return mutateTeamTask(input, 'state', { status: input.status, reason: input.reason })
}

function scopedMailboxMessage(value: unknown, workspaceId: string, teamId: string): UarTeamMailboxMessage {
  const message = mailboxMessage.parse(value)
  if (message.workspaceId !== workspaceId || message.teamId !== teamId) {
    throw new Error('UAR team mailbox scope mismatch')
  }
  return message
}

export async function readUarTeamMailbox(input: {
  workspaceId: string
  teamInstanceId: string
}): Promise<UarTeamMailboxPage> {
  const state = await planningState(input.workspaceId)
  if (!state.mailbox) throw new Error('UAR team mailbox is unavailable')
  const target = `${basePath}/${encodeURIComponent(input.teamInstanceId)}`
  scopedTeam(await scopedRequest(state.workspaceId, target, state.generation), state.workspaceId)
  const page = z
    .object({ messages: z.array(z.unknown()) })
    .parse(await scopedRequest(state.workspaceId, `${target}/messages`, state.generation))
  return {
    messages: page.messages.map((value) => scopedMailboxMessage(value, state.workspaceId, input.teamInstanceId))
  }
}

export async function sendUarTeamMailboxMessage(input: UarTeamMailboxSendInput): Promise<UarTeamMailboxMessage> {
  const state = await planningState(input.workspaceId)
  if (!state.mailbox) throw new Error('UAR team mailbox is unavailable')
  const target = `${basePath}/${encodeURIComponent(input.teamInstanceId)}`
  scopedTeam(await scopedRequest(state.workspaceId, target, state.generation), state.workspaceId)
  return scopedMailboxMessage(
    await scopedRequest(state.workspaceId, `${target}/messages`, state.generation, 'POST', {
      commandId: input.commandId,
      messageId: input.commandId,
      recipientMemberId: input.recipientMemberId,
      mode: input.mode,
      content: input.content
    }),
    state.workspaceId,
    input.teamInstanceId
  )
}
