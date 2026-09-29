import * as z from 'zod'

import type {
  UarAdmitTeamTaskInput,
  UarTeamArtifact,
  UarTeamControlInput,
  UarTeamExecutionAttempt,
  UarTeamExecutionSelector,
  UarTeamExecutionSummary,
  UarTeamInstance
} from '@shared/types/uarTeams'

import { scopedRequest } from './UarDurableAdministrationAdapter'
import { planningState, scopedTeam } from './UarTeamsAdministrationAdapter'

const reservation = z.object({
  tokens: z.number().int().nonnegative(),
  costMicrounits: z.number().int().nonnegative(),
  elapsedSeconds: z.number().int().nonnegative()
})
const attempt = z.object({
  id: z.string(),
  runId: z.string(),
  ownerId: z.string(),
  workspaceId: z.string(),
  teamId: z.string(),
  taskId: z.string(),
  memberId: z.string(),
  memberRevision: z.number().int().nonnegative(),
  ownershipEpoch: z.number().int().nonnegative(),
  bindingRevision: z.number().int().nonnegative(),
  executionEpoch: z.number().int().nonnegative(),
  status: z.enum(['queued', 'running', 'cancellation_requested', 'uncertain', 'succeeded', 'failed', 'cancelled']),
  executionOutcome: z.enum(['succeeded', 'failed', 'cancelled', 'uncertain']).nullish(),
  reservation,
  contextArtifactIds: z.array(z.string()),
  usage: reservation.nullable(),
  usageRevision: z.number().int().nonnegative(),
  output: z.unknown().nullable(),
  stateReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
const artifact = z.object({
  id: z.string(),
  ownerId: z.string(),
  workspaceId: z.string(),
  teamId: z.string(),
  taskId: z.string(),
  memberId: z.string(),
  attemptId: z.string(),
  content: z.unknown(),
  createdAt: z.string()
})

async function executionTarget(input: UarTeamExecutionSelector) {
  const state = await planningState(input.workspaceId)
  if (!state.execution) throw new Error('UAR team execution is unavailable')
  const path = '/api/v1/collaboration/team-instances/' + encodeURIComponent(input.teamInstanceId)
  const team = scopedTeam(await scopedRequest(state.workspaceId, path, state.generation), state.workspaceId)
  if (team.id !== input.teamInstanceId) throw new Error('UAR team execution selector mismatch')
  return { ...state, path, team }
}

function scopedAttempt(value: unknown, team: UarTeamInstance): UarTeamExecutionAttempt {
  const result = attempt.parse(value)
  if (result.ownerId !== team.ownerId || result.workspaceId !== team.workspaceId || result.teamId !== team.id) {
    throw new Error('UAR team execution scope mismatch')
  }
  return result
}

export async function readUarTeamExecution(input: UarTeamExecutionSelector): Promise<UarTeamExecutionSummary> {
  const state = await executionTarget(input)
  const summary = z
    .object({
      attempts: z.array(z.unknown()),
      committed: reservation,
      reserved: reservation,
      uncertainAttempts: z.array(z.string()),
      budget: z.object({
        maxTokens: z.number().int().nonnegative(),
        maxCostMicrounits: z.number().int().nonnegative(),
        currency: z.string(),
        maxElapsedSeconds: z.number().int().nonnegative()
      }),
      limits: z.object({
        concurrentTurns: z.number().int().nonnegative(),
        maxMembers: z.number().int().nonnegative(),
        maxDepth: z.number().int().nonnegative(),
        maxPendingTasks: z.number().int().nonnegative()
      })
    })
    .parse(await scopedRequest(state.workspaceId, state.path + '/execution', state.generation))
  return { ...summary, attempts: summary.attempts.map((value) => scopedAttempt(value, state.team)) }
}

export async function readUarTeamArtifacts(input: UarTeamExecutionSelector): Promise<{ artifacts: UarTeamArtifact[] }> {
  const state = await executionTarget(input)
  const page = z
    .object({ artifacts: z.array(artifact) })
    .parse(await scopedRequest(state.workspaceId, state.path + '/artifacts', state.generation))
  if (
    page.artifacts.some(
      (item) =>
        item.ownerId !== state.team.ownerId || item.workspaceId !== state.workspaceId || item.teamId !== state.team.id
    )
  ) {
    throw new Error('UAR team artifact scope mismatch')
  }
  return page
}

export async function admitUarTeamTask(input: UarAdmitTeamTaskInput): Promise<UarTeamExecutionAttempt> {
  const state = await executionTarget(input)
  return scopedAttempt(
    await scopedRequest(
      state.workspaceId,
      state.path + '/tasks/' + encodeURIComponent(input.taskId) + '/admit',
      state.generation,
      'POST',
      {
        commandId: input.commandId,
        expectedTeamRevision: input.expectedTeamRevision,
        expectedTaskRevision: input.expectedTaskRevision,
        memberId: input.memberId,
        reservation: input.reservation,
        contextArtifactIds: input.contextArtifactIds
      }
    ),
    state.team
  )
}

function controlBody(input: UarTeamControlInput) {
  return { commandId: input.commandId, expectedTeamRevision: input.expectedTeamRevision, reason: input.reason }
}

export async function cancelUarTeamAttempt(
  input: UarTeamControlInput & { attemptId: string }
): Promise<UarTeamExecutionAttempt> {
  const state = await executionTarget(input)
  return scopedAttempt(
    await scopedRequest(
      state.workspaceId,
      state.path + '/attempts/' + encodeURIComponent(input.attemptId) + '/cancel',
      state.generation,
      'POST',
      controlBody(input)
    ),
    state.team
  )
}

export async function recoverUarTeamExecution(input: UarTeamControlInput): Promise<UarTeamExecutionAttempt[]> {
  const state = await executionTarget(input)
  const result = z
    .array(z.unknown())
    .parse(
      await scopedRequest(state.workspaceId, state.path + '/recover', state.generation, 'POST', controlBody(input))
    )
  return result.map((value) => scopedAttempt(value, state.team))
}

export async function revokeUarTeamMember(input: UarTeamControlInput & { memberId: string }): Promise<UarTeamInstance> {
  const state = await executionTarget(input)
  return scopedTeam(
    await scopedRequest(
      state.workspaceId,
      state.path + '/members/' + encodeURIComponent(input.memberId) + '/revoke',
      state.generation,
      'POST',
      controlBody(input)
    ),
    state.workspaceId
  )
}
