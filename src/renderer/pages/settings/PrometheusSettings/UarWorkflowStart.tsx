import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamInstance } from '@shared/types/uarTeams'
import { uarWorkflowStartSchema, type UarWorkflowDefinition, type UarWorkflowRun } from '@shared/types/uarWorkflows'

interface Props {
  workspaceId: string
  team: UarTeamInstance
  definition: UarWorkflowDefinition
  onStarted: (run: UarWorkflowRun) => Promise<void>
}

const fields = ['tokens', 'costMicrounits', 'elapsedSeconds'] as const
const inputContract = z.object({
  properties: z.object({ feedback: z.object({ maxLength: z.number().int().positive() }) })
})

export function UarWorkflowStart({ workspaceId, team, definition, onStarted }: Props) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.workflows' })
  const { t: tt } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const id = useId()
  const [feedback, setFeedback] = useState('')
  const [members, setMembers] = useState<Record<string, string>>({})
  const [reservations, setReservations] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const intent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const bound = inputContract.safeParse(definition.input)

  const start = async () => {
    const payload = {
      workspaceId,
      teamId: team.id,
      workflowDefinition: definition.identity,
      expectedTeamRevision: team.revision,
      expectedBindingRevision: team.binding.revision,
      input: { feedback },
      steps: definition.steps.map((step) => ({
        stepId: step.id,
        memberId: members[step.id] ?? '',
        reservation: Object.fromEntries(fields.map((field) => [field, Number(reservations[step.id]?.[field] ?? NaN)]))
      }))
    }
    const fingerprint = JSON.stringify(payload)
    const command =
      intent.current?.fingerprint === fingerprint ? intent.current : { fingerprint, commandId: crypto.randomUUID() }
    const parsed = uarWorkflowStartSchema.safeParse({ ...payload, commandId: command.commandId })
    if (
      !parsed.success ||
      !feedback.trim() ||
      (bound.success && feedback.length > bound.data.properties.feedback.maxLength)
    ) {
      setError(tr('invalidInput'))
      requestAnimationFrame(() => errorRef.current?.focus())
      return
    }
    intent.current = command
    setBusy(true)
    setError(undefined)
    try {
      const run = await ipcApi.request('prometheus.uar.workflows.start', parsed.data)
      intent.current = undefined
      await onStarted(run)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="mt-4 space-y-3"
      data-ui="uar-workflow-start"
      onSubmit={(event) => {
        event.preventDefault()
        void start()
      }}>
      <p ref={errorRef} tabIndex={-1} role="alert" className="break-words text-sm text-error">
        {error && (
          <>
            {error} {tt('execution.denialHelp')}
          </>
        )}
      </p>
      <label htmlFor={id + '-feedback'} className="block text-sm font-medium">
        {tr('feedback')}
      </label>
      <Textarea.Input
        id={id + '-feedback'}
        value={feedback}
        disabled={busy}
        required
        rows={4}
        maxLength={bound.success ? bound.data.properties.feedback.maxLength : undefined}
        onChange={(event) => setFeedback(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">{tr('budgetHelp')}</p>
      {definition.steps.map((step) => (
        <fieldset key={step.id} disabled={busy} className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">
            {tr(step.id)} · {step.role}
          </legend>
          <label htmlFor={id + step.id + '-member'} className="block text-sm">
            {tt('assignee')}
          </label>
          <Select
            value={members[step.id]}
            disabled={busy}
            onValueChange={(value) => setMembers((current) => ({ ...current, [step.id]: value }))}>
            <SelectTrigger id={id + step.id + '-member'}>
              <SelectValue placeholder={tt('chooseAssignee')} />
            </SelectTrigger>
            <SelectContent>
              {team.members
                .filter(
                  (member) => member.role === step.role && !['revoked', 'stopped', 'cancelled'].includes(member.status)
                )
                .map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.role} · {member.ordinal} · {member.id}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="grid gap-3 sm:grid-cols-3">
            {fields.map((field) => (
              <div key={field}>
                <label htmlFor={id + step.id + field} className="mb-1 block text-xs">
                  {tt('execution.' + field)}
                </label>
                <Input
                  id={id + step.id + field}
                  type="number"
                  step={1}
                  min={field === 'costMicrounits' ? 0 : 1}
                  required
                  value={reservations[step.id]?.[field] ?? ''}
                  onChange={(event) =>
                    setReservations((current) => ({
                      ...current,
                      [step.id]: { ...current[step.id], [field]: event.target.value }
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <Button type="submit" disabled={busy}>
        {busy ? tt('execution.admitting') : tr('start')}
      </Button>
    </form>
  )
}
