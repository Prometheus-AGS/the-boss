import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Input } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarWorkflowRun } from '@shared/types/uarWorkflows'

export function UarWorkflowRunView({
  workspaceId,
  run,
  onChanged
}: {
  workspaceId: string
  run: UarWorkflowRun
  onChanged: (run: UarWorkflowRun) => void
}) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.workflows' })
  const { t: tt } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const id = useId()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const intent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)
  const terminal = ['accepted', 'rejected', 'cancelled', 'failed'].includes(run.status)
  const artifact = run.wait
    ? run.steps.find((step) => step.artifact?.id === run.wait?.artifactId)?.artifact
    : run.steps.find((step) => step.stepId === 'draft')?.artifact
  const draftContent = artifact?.content
  const draft =
    draftContent &&
    typeof draftContent === 'object' &&
    'title' in draftContent &&
    'body' in draftContent &&
    typeof draftContent.title === 'string' &&
    typeof draftContent.body === 'string'
      ? draftContent
      : undefined
  const status = ['awaiting_decision', 'reconciling', 'accepted', 'rejected'].includes(run.status)
    ? tr(run.status)
    : tt(run.status === 'ready' ? 'taskStatus.ready' : 'execution.status.' + run.status)

  const act = async (action: 'accept' | 'reject' | 'cancel' | 'recover') => {
    const deciding = run.status === 'awaiting_decision' && run.wait && action !== 'recover'
    const payload = deciding
      ? {
          workspaceId,
          runId: run.id,
          expectedRunRevision: run.revision,
          waitId: run.wait!.id,
          decision: action,
          artifactId: run.wait!.artifactId,
          artifactDigest: run.wait!.artifactDigest
        }
      : { workspaceId, runId: run.id, expectedRunRevision: run.revision, reason }
    const fingerprint = JSON.stringify([action, payload])
    const command =
      intent.current?.fingerprint === fingerprint ? intent.current : { fingerprint, commandId: crypto.randomUUID() }
    intent.current = command
    setBusy(true)
    setError(undefined)
    try {
      const next =
        payload.waitId !== undefined
          ? await ipcApi.request('prometheus.uar.workflows.decide', { ...payload, commandId: command.commandId })
          : await ipcApi.request(
              action === 'recover' ? 'prometheus.uar.workflows.recover' : 'prometheus.uar.workflows.cancel',
              { ...payload, commandId: command.commandId }
            )
      intent.current = undefined
      onChanged(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-4 min-w-0 space-y-3" data-ui="uar-workflow-run" aria-label={run.id}>
      <div className="flex flex-wrap items-center gap-2" role="status">
        <Badge variant="outline">{status}</Badge>
        <span className="text-xs text-muted-foreground">
          {tt('revision')} {run.revision}
        </span>
      </div>
      <p className="break-all text-xs text-muted-foreground">
        {run.definition.id} · {run.definition.version} · {run.definition.digest}
      </p>
      {run.stateReason && <p className="break-words text-sm text-warning-subtle-foreground">{run.stateReason}</p>}
      {run.accounting.unresolvedAttemptIds.length > 0 && (
        <p role="status" className="text-sm text-warning-subtle-foreground">
          {tr('accountingUnresolved')}
        </p>
      )}
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium">{tt('execution.committed')}</dt>
          <dd>{tt('execution.usage', run.accounting.committed)}</dd>
        </div>
        <div>
          <dt className="font-medium">{tt('execution.reserved')}</dt>
          <dd>{tt('execution.usage', run.accounting.reserved)}</dd>
        </div>
      </dl>
      {artifact && (
        <div>
          <h3 className="text-sm font-medium">{tr('draft')}</h3>
          <pre
            className="mt-2 whitespace-pre-wrap break-words rounded-md bg-background-subtle p-3 text-sm"
            data-ui="uar-workflow-draft">
            {draft ? draft.title + '\n\n' + draft.body : JSON.stringify(artifact.content, null, 2)}
          </pre>
          <p className="mt-2 text-sm text-muted-foreground">{tr('internalOnly')}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {artifact.id} · {artifact.digest}
          </p>
        </div>
      )}
      {run.wait && (
        <p className="break-all text-xs text-muted-foreground">
          {tr('wait')}: {run.wait.id}
        </p>
      )}
      {run.status === 'awaiting_decision' && run.wait && artifact && (
        <div className="flex flex-wrap gap-2">
          {run.wait.decisions.map((decision) => (
            <Button
              key={decision}
              disabled={busy}
              variant={decision === 'accept' ? 'default' : decision === 'reject' ? 'destructive' : 'outline'}
              onClick={() => void act(decision)}>
              {tr(decision)}
            </Button>
          ))}
        </div>
      )}
      {run.decision && (
        <div data-ui="uar-workflow-receipt">
          <h3 className="text-sm font-medium">{tr('receipt')}</h3>
          <p className="break-all text-xs text-muted-foreground">
            {run.decision.id} · {run.decision.committedAt}
          </p>
        </div>
      )}
      {!terminal && (
        <div className="space-y-2">
          <label htmlFor={id + '-reason'} className="block text-sm font-medium">
            {tt('execution.reason')}
          </label>
          <Input
            id={id + '-reason'}
            value={reason}
            maxLength={512}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{tr('recoveryHelp')}</p>
          <div className="flex flex-wrap gap-2">
            {run.status !== 'awaiting_decision' && (
              <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => void act('cancel')}>
                {tr('cancel')}
              </Button>
            )}
            <Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act('recover')}>
              {tr('recover')}
            </Button>
          </div>
        </div>
      )}
      <p role="alert" className="break-words text-sm text-error">
        {error && (
          <>
            {error} {tt('execution.denialHelp')}
          </>
        )}
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {tr('details')}
        </summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-background-subtle p-3">
          {JSON.stringify(run, null, 2)}
        </pre>
      </details>
    </section>
  )
}
