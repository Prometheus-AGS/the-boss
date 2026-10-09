import * as z from 'zod'

import { uarApprovalHistorySchema } from '@shared/types/uarApprovalRecords'
import type { UarDurableApprovalDecision, UarDurableRunSnapshot } from '@shared/types/uarDurableAdministration'
import { uarTeamRunEventsSchema } from '@shared/types/uarTeamRunEvents'

import { rawAdmissionEvidence, rawPendingApproval } from './uarApprovalLifecycle'
import { capabilityState, scopedRequest, workspace } from './UarDurableAdministrationAdapter'
import { projectInstance } from './uarDurableProjections'

async function target(input: { workspaceId: string; instanceId: string; runId: string }) {
  const workspaceId = workspace(input.workspaceId)
  const state = await capabilityState()
  const instance = projectInstance(await scopedRequest(workspaceId,
    '/api/uar/agent-instances/v1/' + encodeURIComponent(input.instanceId), state.generation), workspaceId)
  const command = instance.commands.find((entry) => entry.kind === 'turn' && entry.rootRunId === input.runId)
  if (instance.instanceId !== input.instanceId || !command) throw new Error('TEAM_SCOPE_DENIED')
  return { workspaceId, generation: state.generation, command, path: '/api/uar/runs/' + encodeURIComponent(input.runId) }
}

export async function readUarDurableRun(input: {
  workspaceId: string; instanceId: string; runId: string; after?: number
}): Promise<UarDurableRunSnapshot> {
  const state = await target(input)
  const after = input.after ?? 0
  const [events, pending, history, effects] = await Promise.all([
    scopedRequest(state.workspaceId, state.path + '/events?after=' + after, state.generation).then((value) => uarTeamRunEventsSchema.parse(value)),
    scopedRequest(state.workspaceId, state.path + '/tool-approval/pending', state.generation).then((value) => rawPendingApproval.parse(value)),
    scopedRequest(state.workspaceId, state.path + '/tool-approval', state.generation).then((value) => uarApprovalHistorySchema.parse(value)),
    scopedRequest(state.workspaceId, state.path + '/tool-admission-evidence', state.generation).then((value) => rawAdmissionEvidence.parse(value))
  ])
  if ([events.runId, pending.runId, history.runId, effects.runId].some((id) => id !== input.runId) || events.after !== after) {
    throw new Error('TEAM_SCOPE_DENIED')
  }
  let cursor = after
  for (const event of events.events) {
    if (event.eventId <= cursor || event.eventId > events.cursor) throw new Error('UAR run event sequence mismatch')
    cursor = event.eventId
  }
  if (history.records.some((record) => record.workspaceId !== state.workspaceId || record.rootRunId !== input.runId)) {
    throw new Error('TEAM_SCOPE_DENIED')
  }
  const approval = pending.pending
  if (approval && (approval.rootRunId !== input.runId || !approval.issuerId || !approval.challengeId)) {
    throw new Error('UAR_APPROVAL_STALE')
  }
  const attemptId = state.command.attemptId ?? state.command.commandId
  return {
    instanceId: input.instanceId, events,
    approval: approval ? { attemptId, runId: input.runId, approvalId: approval.approvalId,
      issuerId: approval.issuerId!, challengeId: approval.challengeId!, rootRunId: approval.rootRunId,
      toolCallId: approval.toolCallId, callIndex: approval.callIndex, admissionOwner: approval.admissionOwner,
      eventId: approval.eventId, cursor: approval.cursor, toolName: approval.name,
      argumentsJson: approval.argumentsJson, riskReason: approval.riskReason } : null,
    effects: effects.records.map((effect) => ({ toolName: effect.tool_name, state: effect.state, admissionId: effect.admission_id ?? null, invocationId: effect.invocation_id })),
    history: history.records.map((record) => ({ ...record, attemptId, runId: input.runId, durable: history.durable,
      effectState: effects.records.filter((effect) => record.admissionId !== null && effect.admission_id === record.admissionId).at(-1)?.state }))
  }
}

export async function decideUarDurableApproval(input: UarDurableApprovalDecision): Promise<{ resolved: true }> {
  const state = await target(input)
  const pending = rawPendingApproval.parse(await scopedRequest(state.workspaceId, state.path + '/tool-approval/pending', state.generation))
  const approval = pending.pending
  if (pending.runId !== input.runId || !approval || approval.admissionOwner !== 'uar-runtime' ||
    approval.rootRunId !== input.runId || approval.approvalId !== input.approvalId ||
    approval.issuerId !== input.issuerId || approval.challengeId !== input.challengeId ||
    approval.eventId !== input.eventId || approval.cursor !== input.cursor) throw new Error('UAR_APPROVAL_STALE')
  const history = uarApprovalHistorySchema.parse(await scopedRequest(state.workspaceId, state.path + '/tool-approval', state.generation))
  const challenge = history.records.find((record) => record.issuerId === input.issuerId && record.challengeId === input.challengeId)
  if (history.runId !== input.runId || !challenge || challenge.workspaceId !== state.workspaceId ||
    challenge.rootRunId !== input.runId || challenge.state !== 'pending' || !challenge.resolvable) throw new Error('UAR_APPROVAL_STALE')
  return z.object({ resolved: z.literal(true) }).parse(await scopedRequest(state.workspaceId,
    state.path + '/tool-approval', state.generation, 'POST', { approved: input.approved, approval_id: input.approvalId }))
}
