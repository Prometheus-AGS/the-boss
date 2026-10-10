import { useTranslation } from 'react-i18next'

import type { UarTeamLiveOutput } from '@renderer/hooks/useUarTeamLiveOutput'
import type { UarTeamExecutionAttempt } from '@shared/types/uarTeams'

export function UarTeamAttemptOutput({
  attempt,
  live,
  memberRole
}: {
  attempt: UarTeamExecutionAttempt
  live?: UarTeamLiveOutput
  memberRole: string
}) {
  const { t } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.execution' })
  const current = live?.runId === attempt.runId ? live : undefined
  const persisted = attempt.output != null
  if (!current && !persisted) return null

  return (
    <section
      className="mt-3 text-xs"
      data-ui="teams-member-output"
      aria-label={t(persisted ? 'liveOutputFinal' : 'liveOutput')}>
      <p className="break-words font-medium">{t(persisted ? 'liveOutputFinal' : 'liveOutput')}</p>
      <p className="mt-1 break-all text-muted-foreground">
        {memberRole} · {attempt.memberId}
        {attempt.effectiveModels
          ?.map((model) => ' · ' + model.route.providerId + ' / ' + model.wireModelAlias)
          .join('')}
      </p>
      {!persisted && (
        <p className="mt-1 text-muted-foreground" role="status">
          {t('liveOutputPartial')}
        </p>
      )}
      {current?.gap && (
        <p className="mt-1 text-warning-subtle-foreground" role="status">
          {t('liveOutputGap')}
        </p>
      )}
      {current?.disconnected && !persisted && (
        <p className="mt-1 text-warning-subtle-foreground" role="status">
          {t('liveOutputDisconnected')}
        </p>
      )}
      <pre
        className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background-subtle p-2"
        data-ui="teams-output-text"
        role="log"
        aria-live={persisted ? 'off' : 'polite'}
        aria-atomic={false}>
        {persisted
          ? typeof attempt.output === 'string'
            ? attempt.output
            : JSON.stringify(attempt.output, null, 2)
          : current?.text || t('liveOutputWaiting')}
      </pre>
    </section>
  )
}
