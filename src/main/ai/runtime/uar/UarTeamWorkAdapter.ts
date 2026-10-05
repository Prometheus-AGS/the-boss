import { createHash } from 'node:crypto'

import * as z from 'zod'

import { application } from '@application'
import type {
  UarSubmitTeamTaskInput,
  UarTeamApproval,
  UarTeamApprovalDecision,
  UarTeamExecutionSelector,
  UarTeamInstance
} from '@shared/types/uarTeams'

import { rawPendingApproval } from './uarApprovalLifecycle'
import { UAR_CODING_TEAM_ID } from './uarCodingTeamPackage'
import { scopedRequest } from './UarDurableAdministrationAdapter'
import { admitUarTeamTask, readUarTeamExecution } from './UarTeamExecutionAdapter'
import { addUarTeamTask, claimUarTeamTask, planningState, scopedTeam } from './UarTeamsAdministrationAdapter'

function commandId(id: string, stage: string): string {
  const hex = createHash('sha256')
    .update(id + ':' + stage)
    .digest('hex')
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-4' +
    hex.slice(13, 16) +
    '-8' +
    hex.slice(17, 20) +
    '-' +
    hex.slice(20, 32)
  )
}

async function target(input: UarTeamExecutionSelector) {
  const state = await planningState(input.workspaceId)
  if (!state.coding) throw new Error('TEAM_CAPABILITY_UNSUPPORTED')
  const path = '/api/v1/collaboration/team-instances/' + encodeURIComponent(input.teamInstanceId)
  const team = scopedTeam(await scopedRequest(state.workspaceId, path, state.generation), state.workspaceId)
  if (team.id !== input.teamInstanceId || team.definition.id !== UAR_CODING_TEAM_ID)
    throw new Error('TEAM_SCOPE_DENIED')
  return { ...state, path, team }
}

export async function submitUarTeamTask(input: UarSubmitTeamTaskInput): Promise<UarTeamInstance> {
  const state = await target(input)
  let team = state.team
  await application.get('UarTeamHostService').ensure(team, state.generation)
  const taskId = 'work-' + input.commandId
  let task = team.tasks.find((record) => record.id === taskId)
  if (task && JSON.stringify(task.input) !== JSON.stringify({ request: input.prompt }))
    throw new Error('TEAM_REVISION_CONFLICT')
  if (!task) {
    team = await addUarTeamTask({
      ...input,
      commandId: commandId(input.commandId, 'add'),
      taskId,
      expectedTeamRevision: team.revision,
      title: input.prompt.slice(0, 160),
      role: 'coordinator',
      input: { request: input.prompt },
      outputContract: { type: 'string' },
      dependsOn: []
    })
    task = team.tasks.find((record) => record.id === taskId)
  }
  if (!task) throw new Error('TEAM_SCOPE_DENIED')
  const coordinator = team.members.find(
    (member) => member.role === 'coordinator' && !['revoked', 'stopped'].includes(member.status)
  )
  if (!coordinator) throw new Error('TEAM_SCOPE_DENIED')
  if (!task.assigneeMemberId) {
    team = await claimUarTeamTask({
      ...input,
      commandId: commandId(input.commandId, 'claim'),
      taskId,
      expectedTeamRevision: team.revision,
      expectedTaskRevision: task.revision,
      memberId: coordinator.id
    })
    task = team.tasks.find((record) => record.id === taskId)!
  }
  if (task.assigneeMemberId !== coordinator.id) throw new Error('TEAM_SCOPE_DENIED')
  const execution = await readUarTeamExecution(input)
  if (!execution.attempts.some((attempt) => attempt.taskId === taskId)) {
    await admitUarTeamTask({
      ...input,
      commandId: commandId(input.commandId, 'admit'),
      taskId,
      expectedTeamRevision: team.revision,
      expectedTaskRevision: task.revision,
      memberId: coordinator.id,
      reservation: { tokens: 4096, costMicrounits: 500000, elapsedSeconds: 180 },
      contextArtifactIds: []
    })
  }
  return scopedTeam(await scopedRequest(state.workspaceId, state.path, state.generation), state.workspaceId)
}

export async function readUarTeamApprovals(input: UarTeamExecutionSelector): Promise<{ approvals: UarTeamApproval[] }> {
  const state = await target(input)
  const execution = await readUarTeamExecution(input)
  const records = await Promise.all(
    execution.attempts
      .filter((attempt) => attempt.status === 'running')
      .map(async (attempt) => {
        const result = rawPendingApproval.parse(
          await scopedRequest(
            state.workspaceId,
            '/api/uar/runs/' + encodeURIComponent(attempt.runId) + '/tool-approval/pending',
            state.generation
          )
        )
        if (result.runId !== attempt.runId) throw new Error('TEAM_SCOPE_DENIED')
        const pending = result.pending
        return pending
          ? {
              attemptId: attempt.id,
              runId: attempt.runId,
              approvalId: pending.approvalId,
              admissionOwner: pending.admissionOwner,
              eventId: pending.eventId,
              cursor: pending.cursor,
              toolName: pending.name,
              argumentsJson: pending.argumentsJson,
              riskReason: pending.riskReason
            }
          : null
      })
  )
  return { approvals: records.filter((record): record is UarTeamApproval => record !== null) }
}

export async function decideUarTeamApproval(input: UarTeamApprovalDecision): Promise<{ resolved: true }> {
  const state = await target(input)
  const execution = await readUarTeamExecution(input)
  const attempt = execution.attempts.find((record) => record.id === input.attemptId && record.status === 'running')
  if (!attempt) throw new Error('TEAM_SCOPE_DENIED')
  const path = '/api/uar/runs/' + encodeURIComponent(attempt.runId) + '/tool-approval'
  const result = rawPendingApproval.parse(await scopedRequest(state.workspaceId, path + '/pending', state.generation))
  const pending = result.pending
  if (
    result.runId !== attempt.runId ||
    !pending ||
    pending.approvalId !== input.approvalId ||
    pending.eventId !== input.eventId ||
    pending.cursor !== input.cursor
  )
    throw new Error('UAR_APPROVAL_STALE')
  if (!pending.admissionId) throw new Error('UAR_APPROVAL_STALE')
  if (pending.admissionOwner === 'paired-host') {
    const bridge = application.get('UarTeamHostService').bridge(state.team, state.generation)
    if (!bridge || !(await bridge.recordHumanDecision(pending.admissionId, input.approved)))
      throw new Error('UAR_APPROVAL_STALE')
  }
  return z.object({ resolved: z.literal(true) }).parse(
    await scopedRequest(state.workspaceId, path, state.generation, 'POST', {
      approved: input.approved,
      approval_id: input.approvalId
    })
  )
}
