import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamApproval } from '@shared/types/uarTeams'

import { uarTeamError } from './uarTeamError'

export function UarTeamApprovals({
  workspaceId,
  teamInstanceId,
  available
}: {
  workspaceId: string
  teamInstanceId: string
  available: boolean
}) {
  const { t } = useTranslation()
  const [approvals, setApprovals] = useState<UarTeamApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [commandError, setCommandError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [status, setStatus] = useState<string>()
  const refresh = useCallback(async () => {
    if (!available) return
    try {
      const snapshot = await ipcApi.request('prometheus.uar.teams.approvals', { workspaceId, teamInstanceId })
      setApprovals(snapshot.approvals)
      setError(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [available, workspaceId, teamInstanceId])
  useEffect(() => {
    void refresh()
    if (!available) return
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(timer)
  }, [refresh, available])

  const decide = async (approval: UarTeamApproval, approved: boolean) => {
    if (busy) return
    setBusy(approval.approvalId)
    setCommandError(undefined)
    setStatus(undefined)
    try {
      await ipcApi.request('prometheus.uar.teams.decide_approval', {
        workspaceId,
        teamInstanceId,
        attemptId: approval.attemptId,
        approvalId: approval.approvalId,
        eventId: approval.eventId,
        cursor: approval.cursor,
        approved
      })
      setStatus(t('work.teams.approvalResolved'))
      await refresh()
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section
      className="space-y-3 border-t border-border-subtle pt-4"
      data-ui="teams-approvals"
      aria-label={t('work.teams.approvals')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('work.teams.approvals')}</h2>
        <Button variant="outline" size="sm" disabled={!available || Boolean(busy)} onClick={() => void refresh()}>
          {t('common.refresh')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('work.teams.approvalHelp')}</p>
      {!available && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('work.teams.approvalsUnavailable')}
        </p>
      )}
      {available && loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('common.loading')}
        </p>
      )}
      {available && !loading && !error && approvals.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('work.teams.noApprovals')}</p>
      )}
      <ul className="space-y-3">
        {approvals.map((approval) => (
          <li
            key={approval.attemptId + ':' + approval.approvalId}
            className="min-w-0 rounded-md border border-border p-3"
            data-approval-id={approval.approvalId}
            data-attempt-id={approval.attemptId}
            data-run-id={approval.runId}
            data-tool-name={approval.toolName}>
            <h3 className="break-words text-sm font-medium">{approval.toolName}</h3>
            <p className="mt-1 break-words text-xs text-muted-foreground">{approval.riskReason}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background-subtle p-2 text-xs">
              {approval.argumentsJson}
            </pre>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                size="sm"
                data-ui="teams-approve"
                disabled={Boolean(busy) || Boolean(error)}
                onClick={() => void decide(approval, true)}>
                {t('work.teams.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-ui="teams-deny"
                disabled={Boolean(busy) || Boolean(error)}
                onClick={() => void decide(approval, false)}>
                {t('work.teams.deny')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="break-words text-sm text-error">
          {uarTeamError(error, (key) => t('settings.prometheus.integration.uarAdmin.teams.execution.' + key))}
        </p>
      )}
      {commandError && (
        <p role="alert" className="break-words text-sm text-error">
          {uarTeamError(commandError, (key) => t('settings.prometheus.integration.uarAdmin.teams.execution.' + key))}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-success">
          {status}
        </p>
      )}
    </section>
  )
}
