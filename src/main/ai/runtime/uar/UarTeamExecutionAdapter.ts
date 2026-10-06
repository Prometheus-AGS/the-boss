import * as z from 'zod'

import { application } from '@application'
import {
  uarTeamCommandReceiptSchema,
  uarTeamContextSchema,
  uarTeamContinuationSchema,
  uarTeamWaitSchema
} from '@shared/types/uarTeamContext'
import { uarReasoningSchema, uarTeamDiagnosticDetailsSchema } from '@shared/types/uarTeamProfiles'
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
  status: z.enum([
    'queued',
    'running',
    'cancellation_requested',
    'uncertain',
    'yielded',
    'succeeded',
    'failed',
    'cancelled'
  ]),
  executionFence: z
    .object({
      catalogId: z.string(),
      serviceInstanceId: z.string(),
      incarnationId: z.string(),
      epoch: z.number().int().positive()
    })
    .nullish(),
  effectDisposition: z.enum(['confirmed', 'uncertain']).optional(),
  accountingState: z.enum(['settled', 'reserved-unknown']).optional(),
  effectiveModels: z
    .array(
      z.object({
        route: z.object({ providerId: z.string(), modelId: z.string() }),
        wireModelAlias: z.string(),
        pricingIdentity: z
          .object({ providerId: z.string(), modelId: z.string(), catalogRevision: z.string() })
          .optional(),
        endpointKind: z.string(),
        profile: z.object({ id: z.string(), revision: z.number().int().positive() }),
        settingsRevision: z.number().int().positive(),
        requestedReasoning: uarReasoningSchema,
        effectiveReasoning: uarReasoningSchema,
        support: z.literal('validated'),
        supportEvidenceRef: z.string(),
        limits: z.object({
          contextTokens: z.number().optional(),
          outputTokens: z.number().optional(),
          source: z.string(),
          sourceRevision: z.string().optional()
        }),
        fit: z.object({ mode: z.literal('settings-only'), guaranteedFit: z.literal(false), reason: z.string() })
      })
    )
    .optional(),
  diagnostic: z
    .object({
      code: z.string(),
      field: z.string().optional(),
      retryable: z.boolean(),
      action: z.enum(['rebind', 'change-settings', 'reconcile', 'contact-operator', 'none']),
      protectedDiagnosticRef: z.string().optional(),
      ...uarTeamDiagnosticDetailsSchema.shape
    })
    .nullish(),
  rootId: z.string().optional(),
  approvalScopeId: z.string().optional(),
  queueSequence: z.number().int().nonnegative().optional(),
  continuationOfWaitId: z.string().nullish(),
  executionOutcome: z.enum(['yielded', 'succeeded', 'failed', 'cancelled', 'uncertain']).nullish(),
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
      commandReceipts: z.array(uarTeamCommandReceiptSchema).optional(),
      waits: z.array(uarTeamWaitSchema).optional(),
      continuations: z.array(uarTeamContinuationSchema).optional(),
      contextReceipts: z.array(uarTeamContextSchema).optional(),
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
  for (const receipt of summary.commandReceipts ?? []) {
    if (
      receipt.scope.ownerId !== state.team.ownerId ||
      receipt.scope.workspaceId !== state.workspaceId ||
      receipt.scope.teamId !== state.team.id
    ) {
      throw new Error('TEAM_SCOPE_DENIED')
    }
  }
  for (const record of [
    ...(summary.waits ?? []),
    ...(summary.continuations ?? []),
    ...(summary.contextReceipts ?? [])
  ]) {
    if (
      record.authority.ownerId !== state.team.ownerId ||
      record.authority.workspaceId !== state.workspaceId ||
      record.authority.teamId !== state.team.id
    ) {
      throw new Error('TEAM_SCOPE_DENIED')
    }
  }
  return { ...summary, attempts: summary.attempts.map((value) => scopedAttempt(value, state.team)) }
}

export async function readUarTeamArtifacts(input: UarTeamExecutionSelector): Promise<{ artifacts: UarTeamArtifact[] }> {
  const state = await executionTarget(input)
  const artifacts = z
    .array(artifact)
    .parse(await scopedRequest(state.workspaceId, state.path + '/artifacts', state.generation))
  if (
    artifacts.some(
      (item) =>
        item.ownerId !== state.team.ownerId || item.workspaceId !== state.workspaceId || item.teamId !== state.team.id
    )
  ) {
    throw new Error('UAR team artifact scope mismatch')
  }
  return { artifacts }
}

export async function admitUarTeamTask(input: UarAdmitTeamTaskInput): Promise<UarTeamExecutionAttempt> {
  const state = await executionTarget(input)
  if (state.team.definition.id === 'urn:boss:coding:team')
    await application.get('UarTeamHostService').ensure(state.team, state.generation)
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
  if (state.team.definition.id === 'urn:boss:coding:team')
    await application.get('UarTeamHostService').ensure(state.team, state.generation)
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

async function privilegedTeamRequest(
  state: Awaited<ReturnType<typeof executionTarget>>,
  suffix: string,
  payload: object
): Promise<unknown> {
  const sidecar = application.get('UarSidecarService')
  const response = await sidecar.adminRequest(
    state.path + suffix,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-uar-workspace-id': state.workspaceId },
      body: JSON.stringify(payload)
    },
    state.generation
  )
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(await response.json().catch(() => null))
    throw new Error(
      `UAR request POST ${state.path + suffix} failed with HTTP ${response.status}${error.success ? ` (${error.data.error.code})` : ''}`
    )
  }
  return response.json()
}

export async function queueUarTeamTask(input: UarAdmitTeamTaskInput): Promise<UarTeamExecutionAttempt> {
  const state = await executionTarget(input)
  if (state.team.definition.id === 'urn:boss:coding:team')
    await application.get('UarTeamHostService').ensure(state.team, state.generation)
  return scopedAttempt(
    await privilegedTeamRequest(state, '/tasks/' + encodeURIComponent(input.taskId) + '/admit-queued', {
      commandId: input.commandId,
      expectedTeamRevision: input.expectedTeamRevision,
      expectedTaskRevision: input.expectedTaskRevision,
      memberId: input.memberId,
      reservation: input.reservation,
      contextArtifactIds: input.contextArtifactIds
    }),
    state.team
  )
}

export async function dispatchUarTeamAttempt(
  input: UarTeamExecutionSelector & { commandId: string; expectedTeamRevision: number; attemptId: string }
): Promise<UarTeamExecutionAttempt> {
  const state = await executionTarget(input)
  if (state.team.definition.id === 'urn:boss:coding:team')
    await application.get('UarTeamHostService').ensure(state.team, state.generation)
  return scopedAttempt(
    await privilegedTeamRequest(state, '/attempts/' + encodeURIComponent(input.attemptId) + '/dispatch', {
      commandId: input.commandId,
      expectedTeamRevision: input.expectedTeamRevision
    }),
    state.team
  )
}
