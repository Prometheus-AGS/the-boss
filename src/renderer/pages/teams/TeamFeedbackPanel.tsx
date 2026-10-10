import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type * as z from 'zod'

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarFeedbackDetail, uarFeedbackSnapshotSchema } from '@shared/types/uarFeedback'
import type { UarTeamsSnapshot } from '@shared/types/uarTeams'
import type { UarWorkflowsSnapshot } from '@shared/types/uarWorkflows'

import { TeamFeedbackRun } from './TeamFeedbackRun'
import { TeamFeedbackStart } from './TeamFeedbackStart'

type Snapshot = z.infer<typeof uarFeedbackSnapshotSchema>

export function TeamFeedbackPanel({ workspaceId, teams, onTeamChanged }: {
  workspaceId: string
  teams: UarTeamsSnapshot
  onTeamChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'work.teams.feedback' })
  const id = useId()
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [workflows, setWorkflows] = useState<UarWorkflowsSnapshot>()
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<UarFeedbackDetail>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [credentialTarget, setCredentialTarget] = useState('')
  const [credential, setCredential] = useState('')
  const [credentialBusy, setCredentialBusy] = useState(false)
  const [credentialSaved, setCredentialSaved] = useState(false)
  const inFlight = useRef(false)
  const readVersion = useRef(0)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const [next, definitions] = await Promise.all([
        ipcApi.request('prometheus.uar.feedback.snapshot', { workspaceId }),
        ipcApi.request('prometheus.uar.workflows.snapshot', { workspaceId })
      ])
      setSnapshot(next)
      setWorkflows(definitions)
      setError(undefined)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { inFlight.current = false; setLoading(false) }
  }, [workspaceId])

  useEffect(() => { if (open) void refresh() }, [open, refresh])
  useEffect(() => {
    if (!open || !selectedId) return
    let reading = false
    let mounted = true
    const read = async () => {
      if (reading) return
      reading = true
      const version = readVersion.current
      try {
        const next = await ipcApi.request('prometheus.uar.feedback.read', { workspaceId, intakeId: selectedId })
        if (mounted && version === readVersion.current) { setDetail(next); setError(undefined) }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : String(cause))
      } finally { reading = false }
    }
    void read()
    const timer = window.setInterval(() => void read(), 3000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [workspaceId, selectedId, open])

  const changed = (next: UarFeedbackDetail) => {
    readVersion.current += 1
    setSelectedId(next.intake.id)
    setDetail(next)
    setSnapshot((current) => current ? { ...current,
      intakes: [next.intake, ...current.intakes.filter((item) => item.id !== next.intake.id)] } : current)
  }
  const started = async (next: UarFeedbackDetail) => {
    changed(next)
    await refresh()
    await onTeamChanged()
  }
  const saveCredential = async (clear = false) => {
    if (credentialBusy) return
    setCredentialBusy(true)
    setCredentialSaved(false)
    setError(undefined)
    try {
      await ipcApi.request('prometheus.uar.feedback.credential', { workspaceId, target: credentialTarget.trim(),
        credential: clear ? { operation: 'clear' } : { operation: 'set', value: credential } })
      setCredential('')
      setCredentialSaved(true)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setCredentialBusy(false) }
  }

  return (
    <section className="space-y-4 border-t border-border-subtle pt-4" data-ui="team-feedback" aria-label={tr('title')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-medium">{tr('title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{tr('entryHelp')}</p></div>
        <Button variant="outline" size="sm" data-ui="team-feedback-open" aria-expanded={open}
          aria-controls={id + '-content'} onClick={() => setOpen((value) => !value)}>{open ? tr('hide') : tr('open')}</Button>
      </div>
      {open && <div id={id + '-content'} className="space-y-5">
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>{t('common.refresh')}</Button>
        {loading && <p role="status" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {error && <p role="alert" className="break-words text-sm text-error">{tr('errorHelp')} {error}</p>}
        {snapshot && workflows && <>
          <TeamFeedbackStart workspaceId={workspaceId} teams={teams} workflows={workflows.definitions}
            disabled={!workflows.available || !teams.capabilities.execution} onStarted={started} />
          {!workflows.available && <p role="status" className="text-sm text-muted-foreground">
            {t('settings.prometheus.integration.uarAdmin.workflows.unavailable')}</p>}
          <details className="space-y-3 border-t border-border-subtle pt-3">
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{tr('credentialTitle')}</summary>
            <p className="text-xs text-muted-foreground">{tr('credentialHelp')}</p>
            <label htmlFor={id + '-credential-target'} className="block text-sm font-medium">{tr('repository')}</label>
            <Input id={id + '-credential-target'} data-ui="team-feedback-credential-target" value={credentialTarget}
              disabled={credentialBusy} maxLength={241} placeholder="owner/repository"
              onChange={(event) => { setCredentialTarget(event.target.value); setCredentialSaved(false) }} />
            <label htmlFor={id + '-credential'} className="block text-sm font-medium">{tr('credential')}</label>
            <Input id={id + '-credential'} data-ui="team-feedback-credential" type="password" autoComplete="off"
              value={credential} disabled={credentialBusy} maxLength={4096} onChange={(event) => setCredential(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" data-ui="team-feedback-credential-save"
                disabled={credentialBusy || !credentialTarget.trim() || !credential.trim()} onClick={() => void saveCredential()}>{t('common.save')}</Button>
              <Button variant="outline" size="sm" disabled={credentialBusy || !credentialTarget.trim()}
                onClick={() => void saveCredential(true)}>{tr('credentialClear')}</Button>
            </div>
            {credentialSaved && <p role="status" className="text-sm text-success">{tr('credentialSaved')}</p>}
            <ul className="space-y-1 text-xs">{snapshot.bindings.map((binding) => <li key={binding.id}>
              {binding.target} · {binding.credentialConfigured ? tr('credentialReady') : tr('credentialMissing')}
            </li>)}</ul>
          </details>
          <div className="space-y-2 border-t border-border-subtle pt-4">
            <label htmlFor={id + '-intake'} className="block text-sm font-medium">{tr('reopen')}</label>
            {snapshot.intakes.length === 0 ? <p className="text-sm text-muted-foreground">{tr('noIntakes')}</p> :
              <Select value={selectedId} onValueChange={(value) => { readVersion.current += 1; setDetail(undefined); setSelectedId(value) }}>
                <SelectTrigger id={id + '-intake'} data-ui="team-feedback-intake"><SelectValue placeholder={tr('reopen')} /></SelectTrigger>
                <SelectContent>{snapshot.intakes.map((item) => <SelectItem key={item.id} value={item.id}>
                  {item.feedback.slice(0, 80)} · {new Date(item.createdAt).toLocaleString()}
                </SelectItem>)}</SelectContent>
              </Select>}
          </div>
          {detail && <TeamFeedbackRun key={detail.intake.id} workspaceId={workspaceId} detail={detail} onChanged={changed} />}
        </>}
      </div>}
    </section>
  )
}
