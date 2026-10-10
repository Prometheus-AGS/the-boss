import {
  uarTeamRunEventsSchema,
  type UarTeamRunEventsSnapshot
} from '@shared/types/uarTeamRunEvents'
import type { UarTeamExecutionSelector } from '@shared/types/uarTeams'

import { scopedRequest } from './UarDurableAdministrationAdapter'
import { readUarTeamExecution } from './UarTeamExecutionAdapter'
import { planningState } from './UarTeamsAdministrationAdapter'

export async function readUarTeamRunEvents(
  input: UarTeamExecutionSelector & { attemptId: string; after?: number }
): Promise<UarTeamRunEventsSnapshot> {
  const state = await planningState(input.workspaceId)
  const summary = await readUarTeamExecution(input)
  const attempt = summary.attempts.find((item) => item.id === input.attemptId)
  if (!attempt) throw new Error('TEAM_SCOPE_DENIED')
  const after = input.after ?? 0
  const page = uarTeamRunEventsSchema.parse(
    await scopedRequest(
      state.workspaceId,
      '/api/uar/runs/' + encodeURIComponent(attempt.runId) + '/events?after=' + after,
      state.generation
    )
  )
  if (page.runId !== attempt.runId || page.after !== after) throw new Error('TEAM_SCOPE_DENIED')
  let previous = after
  for (const event of page.events) {
    if (event.eventId <= previous || event.eventId > page.cursor) throw new Error('UAR run event sequence mismatch')
    previous = event.eventId
  }
  return { ...page, teamInstanceId: input.teamInstanceId, attemptId: input.attemptId }
}
