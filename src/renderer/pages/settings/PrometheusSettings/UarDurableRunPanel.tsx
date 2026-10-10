import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { UarTeamApprovalRecord } from '@renderer/components/uarTeams/UarTeamApprovalRecord'
import { uarTeamError } from '@renderer/components/uarTeams/uarTeamError'
import { ipcApi } from '@renderer/ipc'
import type { UarDurableRunSnapshot } from '@shared/types/uarDurableAdministration'

export function UarDurableRunPanel({ workspaceId, instanceId, runId }: {
  workspaceId: string; instanceId: string; runId: string
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.teams.execution.' + key)
  const [snapshot, setSnapshot] = useState<UarDurableRunSnapshot>()
  const [text, setText] = useState('')
  const [gap, setGap] = useState(false)
  const [error, setError] = useState<string>()
  const [decisionError, setDecisionError] = useState<string>()
  const [runError, setRunError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const cursor = useRef(0)
  const inFlight = useRef(false)
  const active = useRef(true)
  const refresh = useCallback(async () => {
    if (inFlight.current || !active.current) return
    inFlight.current = true
    try {
      const next = await ipcApi.request('prometheus.uar.durable.run', { workspaceId, instanceId, runId, after: cursor.current })
      if (!active.current) return
      let addition = ''
      for (const event of next.events.events) {
        if (!event.data || typeof event.data !== 'object') continue
        const data = event.data as Record<string, unknown>
        if (data.request_id !== runId) continue
        if (event.eventName === 'agui.message.delta' && data.delta && typeof data.delta === 'object') {
          const delta = data.delta as Record<string, unknown>
          if (typeof delta.text === 'string') addition += delta.text
        }
        if (event.eventName === 'agui.error' && typeof data.message === 'string') setRunError(data.message)
      }
      setText((previous) => (next.events.gapReason ? '' : previous) + addition)
      setGap((previous) => previous || next.events.gapReason !== null)
      cursor.current = next.events.gapReason === 'cursor-ahead' ? 0 : next.events.cursor
      setSnapshot(next); setError(undefined)
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally { inFlight.current = false }
  }, [workspaceId, instanceId, runId])
  useEffect(() => {
    active.current = true
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => { active.current = false; window.clearInterval(timer) }
  }, [refresh])
  const decide = async (approved: boolean) => {
    const pending = snapshot?.approval
    if (!pending || busy) return
    setBusy(true); setDecisionError(undefined)
    try {
      await ipcApi.request('prometheus.uar.durable.decide_approval', { workspaceId, instanceId, runId,
        approvalId: pending.approvalId, issuerId: pending.issuerId, challengeId: pending.challengeId,
        eventId: pending.eventId, cursor: pending.cursor, approved })
      await refresh()
    } catch (cause) { setDecisionError(cause instanceof Error ? cause.message : String(cause)); await refresh() }
    finally { setBusy(false) }
  }
  return <section className="mt-3 space-y-3" data-ui="uar-durable-run" data-run-id={runId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">{tr('liveOutput')}</h3>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>{t('common.refresh')}</Button>
    </div>
    <p className="text-xs text-muted-foreground">{tr('liveOutputPartial')}</p>
    {gap && <p role="status" className="text-xs text-warning-subtle-foreground">{tr('liveOutputGap')}</p>}
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background-subtle p-2 text-xs"
      data-ui="uar-durable-output" role="log" aria-live="polite" aria-atomic={false}>{text || tr('liveOutputWaiting')}</pre>
    {(error || runError || decisionError) && <p role="alert" className="break-words text-sm text-error">
      {uarTeamError(decisionError ?? error ?? runError!, tr)}
    </p>}
    {snapshot && snapshot.history.length > 0 && <div className="space-y-3">
      <h3 className="text-sm font-medium">{t('work.teams.approvals')}</h3>
      <p className="text-xs text-muted-foreground">{t('work.teams.approvalHelp')} {t('work.teams.lifecycle.historyHelp')}</p>
      {snapshot.history.map((record) => {
        const pending = snapshot.approval
        const matched = pending?.issuerId === record.issuerId && pending?.challengeId === record.challengeId
        const actionable = matched && pending && (pending.decisionOwner ?? pending.admissionOwner) === 'uar-runtime' && record.state === 'pending' && record.resolvable
        return <div className="rounded-md border border-border p-3" key={record.issuerId + ':' + record.challengeId}
          data-approval-id={matched && pending ? pending.approvalId : undefined}>
          <UarTeamApprovalRecord record={record} />
          {matched && pending && record.state === 'pending' && <>
            <p className="mt-2 break-words text-xs">{pending.riskReason}</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{pending.argumentsJson}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" data-ui="uar-durable-approve" disabled={!actionable || busy || Boolean(error)}
                onClick={() => void decide(true)}>{t('work.teams.approve')}</Button>
              <Button size="sm" variant="outline" data-ui="uar-durable-deny" disabled={!actionable || busy || Boolean(error)}
                onClick={() => void decide(false)}>{t('work.teams.deny')}</Button>
            </div>
          </>}
        </div>
      })}
    </div>}
  </section>
}
