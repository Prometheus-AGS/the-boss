import { useTranslation } from 'react-i18next'

import { Badge } from '@cherrystudio/ui'
import type { UarTeamExecutionSummary, UarTeamInstance } from '@shared/types/uarTeams'

import { UarTeamOutcomes } from './UarTeamContextView'
import { uarTeamError } from './uarTeamError'

export function UarTeamWaits({ summary, instance }: { summary: UarTeamExecutionSummary; instance: UarTeamInstance }) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const taskName = (id: string) => instance.tasks.find((task) => task.id === id)?.title ?? id
  const delegations = summary.commandReceipts?.filter((receipt) => receipt.operation === 'team_delegate') ?? []
  return (
    <section className="border-t border-border-subtle pt-4" data-ui="uar-team-waits">
      <h3 className="text-sm font-medium">{tr('cooperation.waits')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{tr('cooperation.waitHelp')}</p>
      {delegations.length > 0 && (
        <ul className="mt-3 space-y-2" data-ui="uar-team-delegations">
          {delegations.map((receipt) => (
            <li key={receipt.commandId} className="min-w-0 text-xs">
              <p className="break-words font-medium">{receipt.taskId ? taskName(receipt.taskId) : receipt.commandId}</p>
              <p className="mt-1 break-all text-muted-foreground">
                {tr('cooperation.delegatedBy')}: {receipt.senderMemberId} · {receipt.senderAttemptId}
              </p>
              {receipt.attemptId && (
                <p className="mt-1 break-all text-muted-foreground">
                  {tr('cooperation.selectedAttempt')}: {receipt.attemptId}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {!summary.waits?.length && <p className="mt-3 text-sm text-muted-foreground">{tr('cooperation.noWaits')}</p>}
      <ol className="mt-3 divide-y divide-border-subtle">
        {summary.waits?.map((wait) => {
          const continuation = summary.continuations?.find((item) => item.waitId === wait.waitId)
          return (
            <li key={wait.waitId} className="min-w-0 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="break-words text-sm font-medium">{taskName(wait.authority.taskId)}</h4>
                <Badge variant="outline">{tr('cooperation.waitState.' + wait.state)}</Badge>
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {wait.waitId} · {wait.authority.attemptId}
              </p>
              <p className="mt-2 break-words text-xs">
                {tr('cooperation.waitTargets')}: {wait.targetTaskIds.map(taskName).join(', ')}
              </p>
              {wait.reasonCode && (
                <p className="mt-2 break-words text-xs text-warning-subtle-foreground">
                  {uarTeamError(wait.reasonCode, (key) => tr('execution.' + key))}
                </p>
              )}
              {wait.wakeOutcomes.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    {tr('cooperation.targetOutcomes')}
                  </summary>
                  <UarTeamOutcomes outcomes={wait.wakeOutcomes} />
                </details>
              )}
              {continuation && (
                <dl className="mt-3 space-y-1 text-xs">
                  <div>
                    <dt className="font-medium">{tr('cooperation.continuation')}</dt>
                    <dd className="break-all">{continuation.continuationAttemptId}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">{tr('cooperation.previousAttempt')}</dt>
                    <dd className="break-all">{continuation.previousAttemptId}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">{tr('cooperation.root')}</dt>
                    <dd className="break-all">{continuation.rootId}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">{tr('cooperation.approvalScope')}</dt>
                    <dd className="break-all">{continuation.approvalScopeId}</dd>
                  </div>
                </dl>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
