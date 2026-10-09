import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { uarFeedbackStartSchema, type UarFeedbackDetail } from '@shared/types/uarFeedback'
import type { UarTeamInstance, UarTeamsSnapshot } from '@shared/types/uarTeams'
import type { UarWorkflowDefinition } from '@shared/types/uarWorkflows'

const fields = ['tokens', 'costMicrounits', 'elapsedSeconds'] as const
type DraftIntent = { fingerprint: string; createId: string; startId: string; sourceId: string; team?: UarTeamInstance }

export function TeamFeedbackStart({ workspaceId, teams, workflows, disabled, onStarted }: {
  workspaceId: string
  teams: UarTeamsSnapshot
  workflows: UarWorkflowDefinition[]
  disabled: boolean
  onStarted: (detail: UarFeedbackDetail) => Promise<void>
}) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'work.teams.feedback' })
  const { t: tw } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.workflows' })
  const id = useId()
  const navigate = useNavigate()
  const [workflowId, setWorkflowId] = useState('')
  const [definitionId, setDefinitionId] = useState('')
  const [bindingId, setBindingId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [target, setTarget] = useState('')
  const [reservations, setReservations] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const intent = useRef<DraftIntent | undefined>(undefined)
  const supported = workflows.filter((item) => item.supported && item.steps.length === 2 &&
    item.steps[0].id === 'classify' && item.steps[1].id === 'draft')
  const workflow = supported.find((item) => item.identity.digest === workflowId)
  const definitions = teams.definitions.filter((item) => workflow && item.package.digest === workflow.package.digest &&
    item.package.id === workflow.package.id && item.package.version === workflow.package.version &&
    workflow.steps.every((step) => item.members.some((member) => member.role === step.role)))
  const definition = definitions.find((item) => item.digest === definitionId)
  const bindings = teams.bindings.filter((item) => definition && item.activationSupported &&
    item.package.digest === definition.package.digest && item.package.id === definition.package.id &&
    item.package.version === definition.package.version)
  const binding = bindings.find((item) => item.id === bindingId)
  const reservationFor = (step: string) => Object.fromEntries(fields.map((field) => {
    const defaults = { tokens: 8192, costMicrounits: 1000000, elapsedSeconds: 300 }
    return [field, reservations[step]?.[field] ?? String(defaults[field])]
  }))

  const start = async () => {
    if (!workflow || !definition || !binding || busy) return
    const payload = { workspaceId, workflowDefinition: workflow.identity, input: { feedback: feedback.trim() },
      target: target.trim(), steps: workflow.steps.map((step) => ({ stepId: step.id,
        reservation: Object.fromEntries(fields.map((field) => [field, Number(reservationFor(step.id)[field])])) })) }
    const fingerprint = JSON.stringify([payload, definition.digest, binding.id, binding.revision])
    const command: DraftIntent = intent.current?.fingerprint === fingerprint ? intent.current : {
      fingerprint, createId: crypto.randomUUID(), startId: crypto.randomUUID(), sourceId: crypto.randomUUID()
    }
    intent.current = command
    setBusy(true)
    setError(undefined)
    try {
      const preliminary = uarFeedbackStartSchema.safeParse({ ...payload, commandId: command.startId,
        sourceEventId: command.sourceId, teamId: 'pending', expectedTeamRevision: 0,
        expectedBindingRevision: binding.revision, steps: payload.steps.map((step) => ({ ...step, memberId: 'pending' })) })
      if (!preliminary.success) { setError(tw('invalidInput')); return }
      command.team ??= await ipcApi.request('prometheus.uar.teams.create', {
        workspaceId, commandId: command.createId, deploymentBindingId: binding.id,
        teamDefinition: { id: definition.id, version: definition.version, digest: definition.digest },
        input: { prompt: feedback.trim() }, memberSlots: definition.members.map((member) => ({ role: member.role, count: member.min }))
      })
      const team = command.team
      const input = uarFeedbackStartSchema.parse({ ...preliminary.data, teamId: team.id,
        expectedTeamRevision: team.revision, expectedBindingRevision: team.binding.revision,
        steps: preliminary.data.steps.map((step, index) => ({ ...step,
          memberId: team.members.find((member) => member.role === workflow.steps[index].role)?.id ?? '' })) })
      const result = await ipcApi.request('prometheus.uar.feedback.start', input)
      intent.current = undefined
      setFeedback('')
      await onStarted(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }

  return (
    <form className="space-y-4" data-ui="team-feedback-start" aria-busy={busy}
      onSubmit={(event) => { event.preventDefault(); void start() }}>
      <p className="text-sm text-muted-foreground">{tr('description')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={id + '-workflow'} className="mb-1 block text-sm font-medium">{tw('definition')}</label>
          <Select value={workflow?.identity.digest ?? ''} disabled={disabled || busy} onValueChange={(value) => {
            setWorkflowId(value); setDefinitionId(''); setBindingId(''); setReservations({})
          }}>
            <SelectTrigger id={id + '-workflow'} data-ui="team-feedback-workflow"><SelectValue placeholder={tw('definition')} /></SelectTrigger>
            <SelectContent>{supported.map((item) => <SelectItem key={item.identity.digest} value={item.identity.digest}>
              {item.title} · {item.identity.version}
            </SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={id + '-team'} className="mb-1 block text-sm font-medium">{tr('team')}</label>
          <Select value={definition?.digest ?? ''} disabled={disabled || busy || !workflow} onValueChange={(value) => {
            setDefinitionId(value); setBindingId(''); setReservations({})
          }}>
            <SelectTrigger id={id + '-team'} data-ui="team-feedback-definition"><SelectValue placeholder={tr('team')} /></SelectTrigger>
            <SelectContent>{definitions.map((item) => <SelectItem key={item.digest} value={item.digest}>
              {item.title} · {item.version}
            </SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={id + '-binding'} className="mb-1 block text-sm font-medium">
            {t('settings.prometheus.integration.uarAdmin.teams.binding')}
          </label>
          <Select value={binding?.id ?? ''} disabled={disabled || busy || !definition} onValueChange={setBindingId}>
            <SelectTrigger id={id + '-binding'} data-ui="team-feedback-binding"><SelectValue placeholder={t('settings.prometheus.integration.uarAdmin.teams.chooseBinding')} /></SelectTrigger>
            <SelectContent>{bindings.map((item) => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={id + '-target'} className="mb-1 block text-sm font-medium">{tr('repository')}</label>
          <Input id={id + '-target'} data-ui="team-feedback-target" value={target} required maxLength={241}
            disabled={disabled || busy} placeholder="owner/repository" onChange={(event) => setTarget(event.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">{tr('repositoryHelp')}</p>
        </div>
      </div>
      {(supported.length === 0 || (workflow && definitions.length === 0) || (definition && bindings.length === 0)) &&
        <div className="space-y-2"><p role="status" className="text-sm text-muted-foreground">{tr('setupHelp')}</p>
          <Button variant="outline" size="sm" data-ui="team-feedback-setup"
            onClick={() => void navigate({ to: '/settings/uar', search: { panel: 'teams', adminWorkspaceId: workspaceId } })}>{tr('configureTeam')}</Button>
        </div>}
      <label htmlFor={id + '-feedback'} className="block text-sm font-medium">{tw('feedback')}</label>
      <Textarea.Input id={id + '-feedback'} data-ui="team-feedback-input" rows={4} required maxLength={16384}
        disabled={disabled || busy} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
      {workflow && definition && <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{tw('budgetHelp')}</summary>
        <p className="text-xs text-muted-foreground">{tr('budgetHelp')}</p>
        {workflow.steps.map((step) => <fieldset key={step.id} disabled={disabled || busy} className="grid gap-3 sm:grid-cols-3">
          <legend className="py-2 text-sm font-medium">{tw(step.id)} · {step.role}</legend>
          {fields.map((field) => <div key={field}>
            <label htmlFor={id + step.id + field} className="mb-1 block text-xs">{t('settings.prometheus.integration.uarAdmin.teams.execution.' + field)}</label>
            <Input id={id + step.id + field} data-ui={'team-feedback-' + step.id + '-' + field} type="number" step={1}
              min={field === 'costMicrounits' ? 0 : 1} value={reservationFor(step.id)[field]}
              onChange={(event) => setReservations((current) => ({ ...current, [step.id]: { ...current[step.id], [field]: event.target.value } }))} />
          </div>)}
        </fieldset>)}
      </details>}
      <Button type="submit" data-ui="team-feedback-draft" disabled={disabled || busy || !binding || !feedback.trim() || !target.trim()}>
        {busy ? t('common.loading') : tr('start')}
      </Button>
      {error && <p role="alert" className="break-words text-sm text-error">{error}</p>}
    </form>
  )
}
