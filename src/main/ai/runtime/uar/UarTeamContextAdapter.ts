import {
  uarTeamContextSchema,
  uarTeamPeerMessagesSchema,
  type UarTeamContextReceipt,
  type UarTeamPeerMessages
} from '@shared/types/uarTeamContext'
import type { UarTeamExecutionSelector } from '@shared/types/uarTeams'

import { scopedRequest } from './UarDurableAdministrationAdapter'
import { planningState, scopedTeam } from './UarTeamsAdministrationAdapter'

export async function readUarTeamContext(
  input: UarTeamExecutionSelector & { attemptId: string }
): Promise<UarTeamContextReceipt> {
  const state = await planningState(input.workspaceId)
  if (!state.cooperation) throw new Error('TEAM_CAPABILITY_UNSUPPORTED')
  const path = '/api/v1/collaboration/team-instances/' + encodeURIComponent(input.teamInstanceId)
  const team = scopedTeam(await scopedRequest(state.workspaceId, path, state.generation), state.workspaceId)
  if (team.id !== input.teamInstanceId) throw new Error('TEAM_SCOPE_DENIED')
  const receipt = uarTeamContextSchema.parse(
    await scopedRequest(
      state.workspaceId,
      path + '/attempts/' + encodeURIComponent(input.attemptId) + '/context',
      state.generation
    )
  )
  if (
    receipt.authority.ownerId !== team.ownerId ||
    receipt.authority.workspaceId !== state.workspaceId ||
    receipt.authority.teamId !== team.id ||
    receipt.authority.attemptId !== input.attemptId
  ) {
    throw new Error('TEAM_SCOPE_DENIED')
  }
  return receipt
}

export async function readUarTeamPeerMessages(input: UarTeamExecutionSelector): Promise<UarTeamPeerMessages> {
  const state = await planningState(input.workspaceId)
  if (!state.cooperation) throw new Error('TEAM_CAPABILITY_UNSUPPORTED')
  const path = '/api/v1/collaboration/team-instances/' + encodeURIComponent(input.teamInstanceId)
  const team = scopedTeam(await scopedRequest(state.workspaceId, path, state.generation), state.workspaceId)
  if (team.id !== input.teamInstanceId) throw new Error('TEAM_SCOPE_DENIED')
  const page = uarTeamPeerMessagesSchema.parse(
    await scopedRequest(state.workspaceId, path + '/peer-messages', state.generation)
  )
  for (const { message, delivery } of page.messages) {
    if (
      message.ownerId !== team.ownerId ||
      message.workspaceId !== state.workspaceId ||
      message.teamId !== team.id ||
      message.messageId !== delivery.messageId ||
      message.recipientMemberId !== delivery.recipientMemberId
    ) {
      throw new Error('TEAM_SCOPE_DENIED')
    }
  }
  return page
}
