import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type * as z from 'zod'

import { Badge, Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarFeedbackDetail, uarFeedbackPreviewSchema } from '@shared/types/uarFeedback'

type Preview = z.infer<typeof uarFeedbackPreviewSchema>
const uncertainStates = ['unknown', 'uncertain', 'reconciling', 'dispatched', 'dispatching']

export function TeamFeedbackRun({ workspaceId, detail, onChanged }: {
  workspaceId: string
  detail: UarFeedbackDetail
  onChanged: (detail: UarFeedbackDetail) => void
}) {
  const { t, i18n } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'work.teams.feedback' })
  const { t: tw } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.workflows' })
  const [review, setReview] = useState<Preview>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const intent = useRef<Record<string, { fingerprint: string; commandId: string }>>({})
  const { intake, effect, workflow, issueUrl } = detail
  const uncertain = effect && uncertainStates.includes(effect.status)
  const terminal = Boolean(issueUrl || intake.duplicateOf) || ['published', 'rejected', 'cancelled', 'duplicate'].includes(intake.status) ||
    Boolean(effect && ['confirmed', 'rejected', 'cancelled'].includes(effect.status))
  const retryable = effect?.status === 'rejected' && Boolean(effect.dispatchId) && !issueUrl && !intake.duplicateOf &&
    !['published', 'rejected', 'cancelled', 'duplicate'].includes(intake.status)
  const waiting = workflow?.status === 'awaiting_decision' || workflow?.status === 'accepted'
  const preview = review?.intake.revision === intake.revision ? review.preview : undefined
  const stateLabel = (state: string) => {
    const feedbackKey = 'work.teams.feedback.status.' + state
    const workflowKey = 'settings.prometheus.integration.uarAdmin.workflows.' + state
    const executionKey = 'settings.prometheus.integration.uarAdmin.teams.execution.status.' + state
    return i18n.exists(feedbackKey) ? t(feedbackKey) : i18n.exists(workflowKey) ? t(workflowKey) :
      i18n.exists(executionKey) ? t(executionKey) : state
  }

  const act = async (action: 'preview' | 'approve' | 'retry' | 'reject' | 'cancel' | 'reconcile') => {
    if (busy) return
    const selector = { workspaceId, intakeId: intake.id }
    const payload = { ...selector, expectedRevision: intake.revision }
    const fingerprint = JSON.stringify([action, payload, action === 'approve' || action === 'retry' ? preview : null,
      action === 'retry' ? [effect?.id, effect?.dispatchId] : null])
    const command = intent.current[action]?.fingerprint === fingerprint ? intent.current[action] :
      { fingerprint, commandId: crypto.randomUUID() }
    intent.current[action] = command
    setBusy(action)
    setError(undefined)
    try {
      if (action === 'preview') {
        const next = await ipcApi.request('prometheus.uar.feedback.preview', selector)
        onChanged(next)
        setReview(next)
      } else {
        const input = { ...payload, commandId: command.commandId }
        let next: UarFeedbackDetail
        if (action === 'approve') {
          if (!preview || uncertain || terminal) return
          next = await ipcApi.request('prometheus.uar.feedback.approve_publish', { ...input,
            artifactId: preview.artifactId, artifactDigest: preview.artifactDigest,
            payloadDigest: preview.payloadDigest, target: preview.target })
        } else if (action === 'retry') {
          if (!preview || !retryable || !effect?.dispatchId || uncertain) return
          next = await ipcApi.request('prometheus.uar.feedback.retry_publish', { ...input,
            artifactId: preview.artifactId, artifactDigest: preview.artifactDigest,
            payloadDigest: preview.payloadDigest, target: preview.target,
            expectedEffectId: effect.id, expectedDispatchId: effect.dispatchId })
        } else if (action === 'reject') next = await ipcApi.request('prometheus.uar.feedback.reject', input)
        else if (action === 'cancel') next = await ipcApi.request('prometheus.uar.feedback.cancel', input)
        else next = await ipcApi.request('prometheus.uar.feedback.reconcile', selector)
        onChanged(next)
        setReview(undefined)
      }
      delete intent.current[action]
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(undefined) }
  }

  return (
    <section className="space-y-4 border-t border-border-subtle pt-4" data-ui="team-feedback-run"
      data-intake-id={intake.id} data-intake-revision={intake.revision} data-workflow-run-id={workflow?.id}
      data-status={intake.status} data-effect-status={effect?.status} aria-busy={Boolean(busy)}>
      <div className="flex flex-wrap gap-2" role="status" aria-live="polite">
        <Badge variant="outline">{tr('state', { state: stateLabel(intake.status) })}</Badge>
        {workflow && <Badge variant="outline">{tr('workflowState', { state: stateLabel(workflow.status) })}</Badge>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{intake.feedback}</p>
      {intake.classification && <p className="text-sm">{tr('classification', { value: intake.classification })}</p>}
      {intake.duplicateOf && <p className="break-all text-sm text-muted-foreground">{tr('duplicate', { id: intake.duplicateOf })}</p>}
      {workflow && <ol className="grid gap-3 sm:grid-cols-2" aria-label={tr('progress')}>
        {workflow.steps.map((step) => <li key={step.stepId} className="space-y-1 border-l-2 border-border ps-3"
          data-ui="team-feedback-step" data-step-id={step.stepId} data-status={step.status}>
          <h3 className="text-sm font-medium">{tw(step.stepId)}</h3>
          <p className="text-xs text-muted-foreground">{tr('state', { state: stateLabel(step.status) })}</p>
          <p className="break-all text-xs text-muted-foreground">{step.memberId}</p>
          {step.artifact && <details className="text-xs"><summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{tr('artifact')}</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words bg-background-subtle p-2">
              {JSON.stringify(step.artifact.content, null, 2)}</pre></details>}
        </li>)}
      </ol>}
      {workflow?.stateReason && <p role="status" className="break-words text-sm text-warning-subtle-foreground">{workflow.stateReason}</p>}
      {effect?.status === 'rejected' && <p role="alert" className="text-sm text-error" data-ui="team-feedback-publication-rejected">{tr('publicationRejected')}</p>}
      {uncertain && <div className="space-y-2" role="status">
        <p className="text-sm text-warning-subtle-foreground">{tr('unknownHelp')}</p>
        <Button variant="outline" data-ui="team-feedback-reconcile" disabled={Boolean(busy)} onClick={() => void act('reconcile')}>{tr('reconcile')}</Button>
      </div>}
      {(waiting || retryable) && !uncertain && (!terminal || retryable) && !preview && <Button variant="outline" data-ui="team-feedback-preview"
        disabled={Boolean(busy)} onClick={() => void act('preview')}>{tr('preview')}</Button>}
      {preview && (!terminal || retryable) && !uncertain && <section className="space-y-3" data-ui="team-feedback-preview-content"
        data-artifact-id={preview.artifactId} data-artifact-digest={preview.artifactDigest} data-payload-digest={preview.payloadDigest}>
        <h3 className="text-sm font-medium">{tr('preview')}</h3>
        <p className="break-all text-sm font-medium" data-ui="team-feedback-preview-target">{preview.target}</p>
        <h4 className="whitespace-pre-wrap break-words text-base font-medium" data-ui="team-feedback-preview-title">{preview.title}</h4>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background-subtle p-3 text-sm" data-ui="team-feedback-preview-body">{preview.body}</pre>
        <p className="text-sm text-warning-subtle-foreground">{tr(retryable ? 'retryHelp' : 'approvalHelp')}</p>
        {retryable ? <Button data-ui="team-feedback-retry-publish" disabled={Boolean(busy)}
          onClick={() => void act('retry')}>{tr('retryApprove')}</Button> :
          <Button data-ui="team-feedback-approve-publish" disabled={Boolean(busy)} onClick={() => void act('approve')}>{tr('approve')}</Button>}
      </section>}
      {!terminal && !uncertain && <div className="flex flex-wrap gap-2">
        {(waiting || intake.issueDraft) && <Button variant="outline" data-ui="team-feedback-reject" disabled={Boolean(busy)} onClick={() => void act('reject')}>{tw('reject')}</Button>}
        <Button variant="outline" data-ui="team-feedback-cancel" disabled={Boolean(busy)} onClick={() => void act('cancel')}>{t('common.cancel')}</Button>
      </div>}
      {issueUrl && <div className="space-y-2" role="status" data-ui="team-feedback-published">
        <p className="text-sm text-success">{tr('published')}</p>
        <a href={issueUrl} target="_blank" rel="noreferrer" className="break-all text-sm text-link underline" data-ui="team-feedback-issue-url">{issueUrl}</a>
      </div>}
      {busy && <p role="status" className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {error && <p role="alert" className="break-words text-sm text-error">{tr('errorHelp')} {error}</p>}
      <details className="text-xs"><summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{tw('details')}</summary>
        <p className="mt-2 break-all">{intake.id} · {intake.revision} · {intake.updatedAt}</p>
        {intake.issueApproval && <p className="break-all">{intake.issueApproval.id} · {intake.issueApproval.decidedAt}</p>}
        {effect && <p className="break-all">{effect.id} · {effect.status} · {effect.receipt?.disposition}</p>}
      </details>
    </section>
  )
}
