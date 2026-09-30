import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Checkbox, Input } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamArtifact, UarTeamExecutionSummary, UarTeamInstance, UarTeamTask } from '@shared/types/uarTeams'

import { uarTeamError } from './uarTeamError'

interface Props {
  workspaceId: string
  instance: UarTeamInstance
  task: UarTeamTask
  summary: UarTeamExecutionSummary
  artifacts: UarTeamArtifact[]
  disabled: boolean
  onChanged: () => Promise<void>
}

export function UarTeamAdmission({ workspaceId, instance, task, summary, artifacts, disabled, onChanged }: Props) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const id = useId()
  const budget = summary.budget
  const defaults = {
    tokens: Math.max(0, budget.maxTokens - summary.committed.tokens - summary.reserved.tokens),
    costMicrounits: Math.max(
      0,
      budget.maxCostMicrounits - summary.committed.costMicrounits - summary.reserved.costMicrounits
    ),
    elapsedSeconds: Math.max(
      0,
      budget.maxElapsedSeconds - summary.committed.elapsedSeconds - summary.reserved.elapsedSeconds
    )
  }
  const [reservation, setReservation] = useState({
    tokens: String(defaults.tokens),
    costMicrounits: String(defaults.costMicrounits),
    elapsedSeconds: String(defaults.elapsedSeconds)
  })
  const [selected, setSelected] = useState<string[]>([])
  const [queueOnly, setQueueOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const intent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)
  const member = instance.members.find((item) => item.id === task.assigneeMemberId)
  const validReservation =
    Object.values(reservation).every(
      (value) => value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0
    ) &&
    Number(reservation.tokens) > 0 &&
    Number(reservation.elapsedSeconds) > 0
  const dependenciesReady = task.dependsOn.every(
    (dependency) => instance.tasks.find((item) => item.id === dependency)?.status === 'succeeded'
  )
  const activeAttempt = summary.attempts.some(
    (item) =>
      item.taskId === task.id && ['queued', 'running', 'cancellation_requested', 'uncertain'].includes(item.status)
  )
  const denial =
    task.status !== 'ready'
      ? 'execution.needReady'
      : !member || member.status === 'revoked'
        ? 'execution.needAssignee'
        : !dependenciesReady
          ? 'waitingForDependencies'
          : activeAttempt
            ? 'execution.activeAttempt'
            : undefined

  const admit = async () => {
    if (!member || denial || !validReservation || busy || disabled) return
    const payload = {
      workspaceId,
      teamInstanceId: instance.id,
      taskId: task.id,
      expectedTeamRevision: instance.revision,
      expectedTaskRevision: task.revision,
      memberId: member.id,
      reservation: {
        tokens: Number(reservation.tokens),
        costMicrounits: Number(reservation.costMicrounits),
        elapsedSeconds: Number(reservation.elapsedSeconds)
      },
      contextArtifactIds: selected
    }
    const fingerprint = JSON.stringify([payload, queueOnly])
    const nextIntent =
      intent.current?.fingerprint === fingerprint ? intent.current : { fingerprint, commandId: crypto.randomUUID() }
    intent.current = nextIntent
    setBusy(true)
    setError(undefined)
    setStatus(undefined)
    try {
      await ipcApi.request(queueOnly ? 'prometheus.uar.teams.queue_task' : 'prometheus.uar.teams.admit_task', {
        ...payload,
        commandId: nextIntent.commandId
      })
      intent.current = undefined
      setStatus(tr(queueOnly ? 'execution.queuedOnly' : 'execution.admitted'))
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0 rounded-lg border border-border p-3" data-ui="uar-team-admission">
      <h3 className="break-words text-sm font-medium">{task.title}</h3>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        {tr('assignee')}: {member ? member.role + ' · ' + member.ordinal : tr('unassigned')}
      </p>
      <fieldset className="mt-3" disabled={disabled || busy}>
        <legend className="text-xs font-medium">
          {tr('execution.reservation')} · {summary.budget.currency}
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(['tokens', 'costMicrounits', 'elapsedSeconds'] as const).map((field) => (
            <div key={field}>
              <label htmlFor={id + field} className="mb-1.5 block text-xs">
                {tr('execution.' + field)}
              </label>
              <Input
                id={id + field}
                type="number"
                min={field === 'costMicrounits' ? 0 : 1}
                step={1}
                value={reservation[field]}
                onChange={(event) => setReservation((current) => ({ ...current, [field]: event.target.value }))}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{tr('execution.budgetDefaults')}</p>
      </fieldset>
      <fieldset className="mt-3" disabled={disabled || busy}>
        <legend className="text-xs font-medium">{tr('execution.context')}</legend>
        <p className="mt-1 text-xs text-muted-foreground">{tr('execution.contextHelp')}</p>
        {artifacts.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{tr('execution.noArtifacts')}</p>
        ) : (
          <ul className="mt-2 max-h-48 space-y-2 overflow-auto">
            {artifacts.map((artifact) => (
              <li key={artifact.id}>
                <label className="flex min-w-0 items-start gap-2 text-xs">
                  <Checkbox
                    checked={selected.includes(artifact.id)}
                    disabled={disabled || busy}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked === true ? [...current, artifact.id] : current.filter((value) => value !== artifact.id)
                      )
                    }
                  />
                  <span className="min-w-0 break-all">
                    {instance.tasks.find((item) => item.id === artifact.taskId)?.title ?? artifact.taskId} ·{' '}
                    {artifact.id}
                  </span>
                </label>
                <details className="ml-6 mt-1 text-xs">
                  <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {tr('execution.output')}
                  </summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(artifact.content, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {!validReservation && <p className="mt-2 text-xs text-muted-foreground">{tr('execution.validReservation')}</p>}
      {denial && (
        <p id={id + 'denial'} className="mt-2 text-xs text-muted-foreground">
          {tr(denial)}
        </p>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs">
        <Checkbox
          checked={queueOnly}
          disabled={disabled || busy}
          onCheckedChange={(checked) => setQueueOnly(checked === true)}
        />
        <span>{tr('execution.queueOnly')}</span>
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{tr('execution.queueOnlyHelp')}</p>
      <Button
        className="mt-3"
        size="sm"
        disabled={disabled || busy || Boolean(denial) || !validReservation}
        aria-describedby={denial ? id + 'denial' : undefined}
        onClick={() => void admit()}>
        {busy ? tr('execution.admitting') : tr('execution.admit')}
      </Button>
      {error && (
        <p className="mt-2 break-words text-sm text-error" role="alert">
          {uarTeamError(error, (key) => tr('execution.' + key))} {tr('execution.denialHelp')}
        </p>
      )}
      {status && (
        <p className="mt-2 text-sm text-success" role="status">
          {status}
        </p>
      )}
    </div>
  )
}
