import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamInstance, UarTeamTask } from '@shared/types/uarTeams'

type Action = 'claim' | 'reassign' | 'reviewer'

interface Props {
  workspaceId: string
  instance: UarTeamInstance
  task: UarTeamTask
  ownership: boolean
  onChanged: () => Promise<void>
}

export function UarTeamTaskActions({ workspaceId, instance, task, ownership, onChanged }: Props) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const assigneeInputId = useId()
  const reviewerInputId = useId()
  const readyReasonInputId = useId()
  const [assigneeId, setAssigneeId] = useState<string>()
  const [reviewerId, setReviewerId] = useState<string>()
  const [busy, setBusy] = useState<Action>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [readyReason, setReadyReason] = useState('')
  const [readyBusy, setReadyBusy] = useState(false)
  const intents = useRef<Partial<Record<Action, { fingerprint: string; commandId: string }>>>({})
  const readyIntent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)
  const assignees = instance.members.filter((member) => member.role === task.role && member.status !== 'revoked')
  const reviewers = instance.members.filter(
    (member) => member.id !== task.assigneeMemberId && member.status !== 'revoked'
  )
  const assigned = Boolean(task.assigneeMemberId)
  const canMarkReady =
    task.status === 'queued' &&
    task.dependsOn.every((id) => instance.tasks.find((candidate) => candidate.id === id)?.status === 'succeeded')

  const markReady = async () => {
    const reason = readyReason.trim()
    if (!ownership || !reason || !canMarkReady) return
    const fingerprint = JSON.stringify([instance.id, task.id, task.revision, instance.revision, 'ready', reason])
    const intent =
      readyIntent.current?.fingerprint === fingerprint
        ? readyIntent.current
        : { fingerprint, commandId: crypto.randomUUID() }
    readyIntent.current = intent
    setReadyBusy(true)
    setError(undefined)
    setStatus(undefined)
    try {
      await ipcApi.request('prometheus.uar.teams.update_task_state', {
        workspaceId,
        teamInstanceId: instance.id,
        taskId: task.id,
        commandId: intent.commandId,
        expectedTeamRevision: instance.revision,
        expectedTaskRevision: task.revision,
        status: 'ready',
        reason
      })
      readyIntent.current = undefined
      setReadyReason('')
      setStatus(tr('taskReady'))
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setReadyBusy(false)
    }
  }

  const mutate = async (action: Action, memberId: string | undefined) => {
    if (!ownership || !memberId || (task.status !== 'ready' && action !== 'reviewer')) return
    const fingerprint = JSON.stringify([instance.id, task.id, task.revision, instance.revision, action, memberId])
    const intent =
      intents.current[action]?.fingerprint === fingerprint
        ? intents.current[action]!
        : { fingerprint, commandId: crypto.randomUUID() }
    intents.current[action] = intent
    setBusy(action)
    setError(undefined)
    setStatus(undefined)
    const input = {
      workspaceId,
      teamInstanceId: instance.id,
      taskId: task.id,
      commandId: intent.commandId,
      expectedTeamRevision: instance.revision,
      expectedTaskRevision: task.revision,
      memberId
    }
    try {
      if (action === 'claim') await ipcApi.request('prometheus.uar.teams.claim_task', input)
      else if (action === 'reassign') await ipcApi.request('prometheus.uar.teams.reassign_task', input)
      else await ipcApi.request('prometheus.uar.teams.assign_reviewer', input)
      delete intents.current[action]
      setStatus(tr(action === 'claim' ? 'taskClaimed' : action === 'reassign' ? 'taskReassigned' : 'reviewerAssigned'))
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="mt-3 grid gap-3 border-t border-border-subtle pt-3 sm:grid-cols-2">
      {task.status === 'queued' && (
        <div className="sm:col-span-2">
          <label htmlFor={readyReasonInputId} className="mb-1.5 block text-xs font-medium">
            {tr('readyReason')}
          </label>
          <Input
            id={readyReasonInputId}
            value={readyReason}
            onChange={(event) => setReadyReason(event.target.value)}
            maxLength={512}
            disabled={!ownership || !canMarkReady || readyBusy}
          />
          {!canMarkReady && <p className="mt-1 text-xs text-muted-foreground">{tr('waitingForDependencies')}</p>}
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            disabled={!ownership || !canMarkReady || !readyReason.trim() || readyBusy || Boolean(busy)}
            onClick={() => void markReady()}>
            {readyBusy ? tr('markingReady') : tr('markReady')}
          </Button>
        </div>
      )}
      <div>
        <label htmlFor={assigneeInputId} className="mb-1.5 block text-xs font-medium">
          {tr('assignee')}
        </label>
        <Select
          value={assigneeId}
          onValueChange={setAssigneeId}
          disabled={!ownership || task.status !== 'ready' || Boolean(busy) || readyBusy}>
          <SelectTrigger id={assigneeInputId}>
            <SelectValue placeholder={tr('chooseAssignee')} />
          </SelectTrigger>
          <SelectContent>
            {assignees.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.role} · {member.ordinal}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          disabled={
            !ownership ||
            task.status !== 'ready' ||
            Boolean(busy) ||
            readyBusy ||
            !assigneeId ||
            assigneeId === task.assigneeMemberId
          }
          onClick={() => void mutate(assigned ? 'reassign' : 'claim', assigneeId)}>
          {busy === 'claim' || busy === 'reassign'
            ? tr('updatingAssignment')
            : tr(assigned ? 'reassignTask' : 'claimTask')}
        </Button>
      </div>
      <div>
        <label htmlFor={reviewerInputId} className="mb-1.5 block text-xs font-medium">
          {tr('reviewer')}
        </label>
        <Select
          value={reviewerId}
          onValueChange={setReviewerId}
          disabled={!ownership || !['queued', 'ready'].includes(task.status) || Boolean(busy) || readyBusy}>
          <SelectTrigger id={reviewerInputId}>
            <SelectValue placeholder={tr('chooseReviewer')} />
          </SelectTrigger>
          <SelectContent>
            {reviewers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.role} · {member.ordinal}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          disabled={
            !ownership ||
            !['queued', 'ready'].includes(task.status) ||
            Boolean(busy) ||
            readyBusy ||
            !reviewerId ||
            reviewerId === task.reviewerMemberId
          }
          onClick={() => void mutate('reviewer', reviewerId)}>
          {busy === 'reviewer' ? tr('assigningReviewer') : tr('assignReviewer')}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-error sm:col-span-2" role="alert">
          {error} {tr('retryGuidance')}
        </p>
      )}
      {status && (
        <p className="text-sm text-success sm:col-span-2" role="status">
          {status}
        </p>
      )}
    </div>
  )
}
