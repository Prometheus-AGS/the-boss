import { uarApprovalHistorySchema, type UarTeamApprovalHistory } from '@shared/types/uarApprovalRecords'
import type { UarTeamExecutionAttempt } from '@shared/types/uarTeams'

import { rawAdmissionEvidence } from './uarApprovalLifecycle'
import { scopedRequest } from './UarDurableAdministrationAdapter'

export async function readTeamApprovalHistory(
  workspaceId: string,
  generation: number,
  attempts: UarTeamExecutionAttempt[]
): Promise<UarTeamApprovalHistory[]> {
  const pages = await Promise.all(
    attempts.map(async (attempt) => {
      const path = '/api/uar/runs/' + encodeURIComponent(attempt.runId)
      const [page, evidence] = await Promise.all([
        scopedRequest(workspaceId, path + '/tool-approval', generation).then((value) =>
          uarApprovalHistorySchema.parse(value)
        ),
        scopedRequest(workspaceId, path + '/tool-admission-evidence', generation).then((value) =>
          rawAdmissionEvidence.parse(value)
        )
      ])
      if (page.runId !== attempt.runId || evidence.runId !== attempt.runId) throw new Error('TEAM_SCOPE_DENIED')
      return page.records.map((record): UarTeamApprovalHistory => {
        if (record.rootRunId !== attempt.runId || record.workspaceId !== workspaceId) throw new Error('TEAM_SCOPE_DENIED')
        const effects = evidence.records.filter(
          (entry) => record.admissionId !== null && entry.admission_id === record.admissionId
        )
        effects.sort((left, right) => new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime())
        return {
          ...record,
          attemptId: attempt.id,
          runId: attempt.runId,
          durable: page.durable,
          effectState: effects.at(-1)?.state
        }
      })
    })
  )
  return pages.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
