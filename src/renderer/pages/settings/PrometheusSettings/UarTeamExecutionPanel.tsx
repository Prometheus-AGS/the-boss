import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Input } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamArtifact, UarTeamExecutionSummary, UarTeamInstance } from '@shared/types/uarTeams'

import { UarEffectiveModel } from './UarEffectiveModel'
import { UarTeamAdmission } from './UarTeamAdmission'
import { uarTeamError } from './uarTeamError'

interface Props {
  workspaceId: string
  instance: UarTeamInstance
  available: boolean
  onChanged: () => Promise<void>
}

export function UarTeamExecutionPanel({ workspaceId, instance, available, onChanged }: Props) {
  const { t, i18n } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const id = useId()
  const [summary, setSummary] = useState<UarTeamExecutionSummary>()
  const [artifacts, setArtifacts] = useState<UarTeamArtifact[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [commandError, setCommandError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [reason, setReason] = useState('')
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const intents = useRef<Record<string, { fingerprint: string; commandId: string }>>({})

  const refresh = useCallback(
    async (quiet = false) => {
      if (!available || inFlight.current) return
      inFlight.current = true
      if (!quiet) setLoading(true)
      try {
        const selector = { workspaceId, teamInstanceId: instance.id }
        const [next, page] = await Promise.all([
          ipcApi.request('prometheus.uar.teams.execution', selector),
          ipcApi.request('prometheus.uar.teams.artifacts', selector)
        ])
        if (mounted.current) {
          setSummary(next)
          setArtifacts(page.artifacts)
          setError(undefined)
        }
      } catch (cause) {
        if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        inFlight.current = false
        if (mounted.current) setLoading(false)
      }
    },
    [available, workspaceId, instance.id]
  )

  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => {
      mounted.current = false
    }
  }, [refresh])

  useEffect(() => {
    if (!available) return
    const timer = window.setInterval(() => {
      void refresh(true)
      void onChanged()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [available, refresh, onChanged])

  const changed = async () => {
    await onChanged()
    await refresh(true)
  }

  const control = async (action: 'cancel' | 'recover' | 'revoke' | 'dispatch', target: string) => {
    if (busy || !available || (action !== 'dispatch' && !reason.trim())) return
    const input = {
      workspaceId,
      teamInstanceId: instance.id,
      expectedTeamRevision: instance.revision,
      reason: reason.trim()
    }
    const key = action + ':' + target
    const fingerprint = JSON.stringify([input, target])
    const intent =
      intents.current[key]?.fingerprint === fingerprint
        ? intents.current[key]
        : { fingerprint, commandId: crypto.randomUUID() }
    intents.current[key] = intent
    setBusy(key)
    setCommandError(undefined)
    setStatus(undefined)
    try {
      const payload = { ...input, commandId: intent.commandId }
      if (action === 'dispatch')
        await ipcApi.request('prometheus.uar.teams.dispatch_attempt', {
          workspaceId,
          teamInstanceId: instance.id,
          commandId: intent.commandId,
          expectedTeamRevision: instance.revision,
          attemptId: target
        })
      else if (action === 'cancel')
        await ipcApi.request('prometheus.uar.teams.cancel_attempt', { ...payload, attemptId: target })
      else if (action === 'revoke')
        await ipcApi.request('prometheus.uar.teams.revoke_member', { ...payload, memberId: target })
      else await ipcApi.request('prometheus.uar.teams.recover', payload)
      delete intents.current[key]
      setStatus(tr('execution.controlApplied'))
      await changed()
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const counters: ReadonlyArray<readonly ['reserved' | 'committed', UarTeamExecutionSummary['reserved']]> = summary
    ? [
        ['reserved', summary.reserved],
        ['committed', summary.committed]
      ]
    : []

  return (
    <SettingGroup data-ui="uar-team-execution">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SettingTitle>{tr('execution.title')}</SettingTitle>
          <SettingDescription>{tr('execution.description')}</SettingDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!available || loading || Boolean(busy)}
          onClick={() => void changed()}>
          <RefreshCw size={14} aria-hidden="true" />
          {t('common.refresh')}
        </Button>
      </div>
      {!available && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {tr('execution.unavailable')}
        </p>
      )}
      {loading && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {t('common.loading')}
        </p>
      )}
      {error && (
        <p className="mt-3 break-words text-sm text-error" role="alert">
          {uarTeamError(error, (key) => tr('execution.' + key))} {tr('execution.denialHelp')}
        </p>
      )}
      {commandError && (
        <p className="mt-3 break-words text-sm text-error" role="alert">
          {uarTeamError(commandError, (key) => tr('execution.' + key))} {tr('execution.denialHelp')}
        </p>
      )}
      {busy && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {t('common.loading')}
        </p>
      )}
      {status && (
        <p className="mt-3 text-sm text-success" role="status">
          {status}
        </p>
      )}
      {available && summary && (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {counters.map(([label, usage]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <dt className="text-sm font-medium">
                  {label === 'reserved' ? tr('execution.reserved') : tr('execution.committed')}
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground">
                  {tr('execution.usage', { ...usage })} · {summary.budget.currency}
                </dd>
              </div>
            ))}
          </dl>
          {summary.uncertainAttempts.length > 0 && (
            <p
              className="rounded-lg border border-warning-border bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"
              role="status">
              {tr('execution.uncertainty')}
            </p>
          )}
          {instance.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr('noTasks')}</p>
          ) : (
            <div className="space-y-3">
              {instance.tasks
                .filter((task) => !['succeeded', 'failed', 'cancelled'].includes(task.status))
                .map((task) => (
                  <UarTeamAdmission
                    key={task.id}
                    workspaceId={workspaceId}
                    instance={instance}
                    task={task}
                    summary={summary}
                    artifacts={artifacts}
                    disabled={Boolean(busy) || Boolean(error)}
                    onChanged={changed}
                  />
                ))}
            </div>
          )}
          <div>
            <label htmlFor={id + 'reason'} className="mb-1.5 block text-sm font-medium">
              {tr('execution.reason')}
            </label>
            <Input
              id={id + 'reason'}
              value={reason}
              maxLength={512}
              disabled={Boolean(busy)}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={id + 'reasonHelp'}
            />
            <p id={id + 'reasonHelp'} className="mt-1 text-xs text-muted-foreground">
              {tr('execution.reasonHelp')}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium">{tr('execution.attempts')}</h3>
            {summary.attempts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{tr('execution.noAttempts')}</p>
            ) : (
              <ol className="mt-2 space-y-3">
                {summary.attempts.map((attempt) => (
                  <li key={attempt.id} className="min-w-0 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="break-words text-sm font-medium">
                        {instance.tasks.find((task) => task.id === attempt.taskId)?.title ?? attempt.taskId}
                      </h4>
                      <Badge variant="outline">{tr('execution.status.' + attempt.status)}</Badge>
                    </div>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {attempt.runId} · {new Date(attempt.updatedAt).toLocaleString(i18n.language)}
                    </p>
                    {attempt.executionOutcome && (
                      <p className="mt-2 text-xs">
                        {tr('execution.outcome')}: {tr('execution.status.' + attempt.executionOutcome)}
                      </p>
                    )}
                    <dl className="mt-2 space-y-1 text-xs">
                      <div>
                        <dt className="inline font-medium">{tr('execution.reservation')}: </dt>
                        <dd className="inline">{tr('execution.usage', { ...attempt.reservation })}</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">{tr('execution.committed')}: </dt>
                        <dd className="inline">
                          {attempt.usage ? tr('execution.usage', { ...attempt.usage }) : tr('execution.usagePending')}
                        </dd>
                      </div>
                    </dl>
                    {attempt.accountingState === 'reserved-unknown' && (
                      <p className="mt-2 text-xs text-warning-subtle-foreground">
                        {tr(
                          attempt.executionOutcome === 'succeeded' && attempt.output != null
                            ? 'execution.knownOutputUnknownUsage'
                            : 'execution.usagePending'
                        )}
                      </p>
                    )}
                    {attempt.effectDisposition === 'uncertain' && (
                      <p className="mt-2 text-xs text-warning-subtle-foreground">{tr('execution.effectsUncertain')}</p>
                    )}
                    {attempt.effectiveModels?.map((model, index) => (
                      <UarEffectiveModel key={index} model={model} />
                    ))}
                    {attempt.diagnostic && (
                      <p className="mt-2 break-words text-xs text-error" role="alert">
                        {uarTeamError(attempt.diagnostic.code, (key) => tr('execution.' + key))}
                        {attempt.diagnostic.field ? ' · ' + attempt.diagnostic.field : ''}
                        {attempt.diagnostic.protectedDiagnosticRef
                          ? ' · ' +
                            tr('execution.diagnosticReference') +
                            ': ' +
                            attempt.diagnostic.protectedDiagnosticRef
                          : ''}
                      </p>
                    )}
                    {attempt.stateReason && (
                      <p className="mt-2 break-words text-xs text-muted-foreground">
                        {uarTeamError(attempt.stateReason, (key) => tr('execution.' + key))}
                      </p>
                    )}
                    {attempt.output != null && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {tr('execution.output')}
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background-subtle p-2">
                          {JSON.stringify(attempt.output, null, 2)}
                        </pre>
                      </details>
                    )}
                    {attempt.status === 'queued' && (
                      <Button
                        className="mt-3 mr-2"
                        size="sm"
                        disabled={Boolean(busy)}
                        onClick={() => void control('dispatch', attempt.id)}>
                        {tr('execution.dispatchQueued')}
                      </Button>
                    )}
                    {['queued', 'running'].includes(attempt.status) && (
                      <Button
                        className="mt-3"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy) || !reason.trim()}
                        aria-describedby={id + 'reasonHelp'}
                        onClick={() => void control('cancel', attempt.id)}>
                        {tr('execution.cancel')}
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="border-t border-border-subtle pt-3">
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={Boolean(busy) || !reason.trim()}
              onClick={() => void control('recover', instance.id)}>
              {tr('execution.recover')}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">{tr('execution.recoveryHelp')}</p>
            <h3 className="mt-4 text-sm font-medium">{tr('membersTitle')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{tr('execution.revokeHelp')}</p>
            <ul className="mt-2 space-y-2">
              {instance.members.map((member) => (
                <li
                  key={member.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      {member.role} · {member.ordinal}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">{member.id}</p>
                  </div>
                  {member.status === 'revoked' ? (
                    <Badge variant="outline">{tr('execution.revoked')}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={Boolean(busy) || !reason.trim()}
                      aria-describedby={id + 'reasonHelp'}
                      onClick={() => void control('revoke', member.id)}>
                      {tr('execution.revoke')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </SettingGroup>
  )
}
