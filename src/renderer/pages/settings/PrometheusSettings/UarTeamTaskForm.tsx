import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamInstance } from '@shared/types/uarTeams'

interface Props {
  workspaceId: string
  instance: UarTeamInstance
  planning: boolean
  onAdded: () => Promise<void>
}

export function UarTeamTaskForm({ workspaceId, instance, planning, onAdded }: Props) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<string>()
  const [inputText, setInputText] = useState('{}')
  const [outputText, setOutputText] = useState('{"type":"object"}')
  const [dependencies, setDependencies] = useState<string[]>([])
  const intentRef = useRef<
    | {
        fingerprint: string
        commandId: string
        taskId: string
        expectedTeamRevision: number
      }
    | undefined
  >(undefined)
  const roles = [...new Set(instance.members.map((member) => member.role))]
  const selectedRole = roles.includes(role ?? '') ? role : undefined

  const addTask = async () => {
    if (!title.trim() || !selectedRole) return
    let input: unknown
    let outputContract: Record<string, unknown>
    try {
      input = JSON.parse(inputText)
    } catch {
      setError(tr('invalidTaskInput'))
      return
    }
    try {
      const parsed = JSON.parse(outputText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid contract')
      outputContract = parsed
    } catch {
      setError(tr('invalidOutputContract'))
      return
    }
    const fingerprint = JSON.stringify([
      workspaceId,
      instance.id,
      title.trim(),
      selectedRole,
      input,
      outputContract,
      dependencies
    ])
    const intent =
      intentRef.current?.fingerprint === fingerprint
        ? intentRef.current
        : {
            fingerprint,
            commandId: crypto.randomUUID(),
            taskId: crypto.randomUUID(),
            expectedTeamRevision: instance.revision
          }
    intentRef.current = intent
    setBusy(true)
    setError(undefined)
    setStatus(undefined)
    try {
      await ipcApi.request('prometheus.uar.teams.add_task', {
        workspaceId,
        teamInstanceId: instance.id,
        commandId: intent.commandId,
        taskId: intent.taskId,
        expectedTeamRevision: intent.expectedTeamRevision,
        title: title.trim(),
        role: selectedRole,
        input,
        outputContract,
        dependsOn: dependencies
      })
      intentRef.current = undefined
      setTitle('')
      setInputText('{}')
      setOutputText('{"type":"object"}')
      setDependencies([])
      setStatus(tr('taskAdded'))
      await onAdded()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingGroup>
      <SettingTitle>{tr('addTaskTitle')}</SettingTitle>
      <SettingDescription>{tr('addTaskDescription')}</SettingDescription>
      {error && (
        <p className="mt-3 text-sm text-error" role="alert">
          {error} {tr('retryGuidance')}
        </p>
      )}
      {status && (
        <p className="mt-3 text-sm text-success" role="status">
          {status}
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="uar-team-task-title" className="mb-1.5 block text-sm font-medium">
            {tr('taskTitle')}
          </label>
          <Input
            id="uar-team-task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor="uar-team-task-role" className="mb-1.5 block text-sm font-medium">
            {tr('taskRole')}
          </label>
          <Select value={selectedRole} onValueChange={setRole} disabled={busy}>
            <SelectTrigger id="uar-team-task-role">
              <SelectValue placeholder={tr('chooseRole')} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="uar-team-task-input" className="mb-1.5 block text-sm font-medium">
            {tr('taskInput')}
          </label>
          <Textarea.Input
            id="uar-team-task-input"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            rows={4}
            className="font-mono text-xs"
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor="uar-team-task-output" className="mb-1.5 block text-sm font-medium">
            {tr('outputContract')}
          </label>
          <Textarea.Input
            id="uar-team-task-output"
            value={outputText}
            onChange={(event) => setOutputText(event.target.value)}
            rows={4}
            className="font-mono text-xs"
            disabled={busy}
          />
        </div>
      </div>
      <fieldset className="mt-4" disabled={busy}>
        <legend className="text-sm font-medium">{tr('dependencies')}</legend>
        {instance.tasks.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{tr('noDependencies')}</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {instance.tasks.map((task) => (
              <label key={task.id} className="flex min-w-0 items-center gap-2 text-sm">
                <Checkbox
                  checked={dependencies.includes(task.id)}
                  onCheckedChange={(checked) =>
                    setDependencies((current) =>
                      checked === true ? [...current, task.id] : current.filter((id) => id !== task.id)
                    )
                  }
                />
                <span className="min-w-0 break-words">{task.title}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Button
        className="mt-4"
        disabled={!planning || !title.trim() || !selectedRole || busy}
        onClick={() => void addTask()}>
        {busy ? tr('addingTask') : tr('addTask')}
      </Button>
    </SettingGroup>
  )
}
