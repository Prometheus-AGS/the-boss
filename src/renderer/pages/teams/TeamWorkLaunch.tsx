import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@cherrystudio/ui'
import { uarTeamError } from '@renderer/components/uarTeams/uarTeamError'
import { UarTeamModelPicker } from '@renderer/components/uarTeams/UarTeamModelPicker'
import { ipcApi } from '@renderer/ipc'
import type {
  UarTeamDefinition,
  UarTeamInstance,
  UarTeamModelSelection,
  UarTeamsSnapshot
} from '@shared/types/uarTeams'

const definitionKey = (definition: UarTeamDefinition) =>
  JSON.stringify([definition.id, definition.version, definition.digest])
type LaunchIntent = {
  fingerprint: string
  createCommandId: string
  submitCommandId: string
  instance?: UarTeamInstance
}

export function TeamWorkLaunch({
  workspaceId,
  snapshot,
  onCreated,
  onChanged
}: {
  workspaceId: string
  snapshot: UarTeamsSnapshot
  onCreated: (id: string) => void
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const id = useId()
  const [selection, setSelection] = useState<string>('')
  const [bindingId, setBindingId] = useState<string>('')
  const [model, setModel] = useState<UarTeamModelSelection>()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<'setup' | 'start'>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const intent = useRef<LaunchIntent | undefined>(undefined)
  const definition = snapshot.definitions.find((item) => definitionKey(item) === selection)
  const bindings = snapshot.bindings.filter(
    (binding) =>
      definition &&
      binding.package.id === definition.package.id &&
      binding.package.version === definition.package.version &&
      binding.package.digest === definition.package.digest
  )
  const binding = bindings.find((item) => item.id === bindingId)
  const reportError = (cause: unknown) =>
    setError(
      uarTeamError(cause instanceof Error ? cause.message : String(cause), (key) =>
        t('settings.prometheus.integration.uarAdmin.teams.execution.' + key)
      )
    )

  const setup = async () => {
    if (!model || busy || !snapshot.capabilities.coding) return
    setBusy('setup')
    setError(undefined)
    setStatus(undefined)
    try {
      const installedBinding = await ipcApi.request('prometheus.uar.teams.setup_coding', { workspaceId, model })
      const next = await ipcApi.request('prometheus.uar.teams.snapshot', { workspaceId })
      const installed = next.definitions.find(
        (item) =>
          item.package.id === installedBinding.package.id && item.package.digest === installedBinding.package.digest
      )
      if (installed) {
        setSelection(definitionKey(installed))
        setBindingId(installedBinding.id)
      }
      setStatus(t('work.teams.presetReady'))
      await onChanged()
    } catch (cause) {
      reportError(cause)
    } finally {
      setBusy(undefined)
    }
  }

  const start = async () => {
    if (
      !definition ||
      !binding ||
      !prompt.trim() ||
      busy ||
      !snapshot.capabilities.coding ||
      !snapshot.capabilities.execution
    )
      return
    const fingerprint = JSON.stringify([workspaceId, definitionKey(definition), binding.id, prompt.trim()])
    const command: LaunchIntent =
      intent.current?.fingerprint === fingerprint
        ? intent.current
        : {
            fingerprint,
            createCommandId: crypto.randomUUID(),
            submitCommandId: crypto.randomUUID()
          }
    intent.current = command
    setBusy('start')
    setError(undefined)
    setStatus(undefined)
    try {
      command.instance ??= await ipcApi.request('prometheus.uar.teams.create', {
        workspaceId,
        commandId: command.createCommandId,
        deploymentBindingId: binding.id,
        teamDefinition: { id: definition.id, version: definition.version, digest: definition.digest },
        input: { prompt: prompt.trim() },
        memberSlots: definition.members.map((member) => ({ role: member.role, count: member.min }))
      })
      onCreated(command.instance.id)
      await ipcApi.request('prometheus.uar.teams.submit_task', {
        workspaceId,
        teamInstanceId: command.instance.id,
        commandId: command.submitCommandId,
        prompt: prompt.trim()
      })
      intent.current = undefined
      setPrompt('')
      setStatus(t('work.teams.started'))
      await onChanged()
    } catch (cause) {
      reportError(cause)
      await onChanged()
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="space-y-4 border-t border-border-subtle pt-4" aria-label={t('work.teams.newTask')}>
      <div>
        <h2 className="text-sm font-medium">{t('work.teams.newTask')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('work.teams.codingHelp')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={id + '-definition'} className="mb-1.5 block text-sm font-medium">
            {t('settings.prometheus.integration.uarAdmin.teams.definition')}
          </label>
          <Select
            value={definition ? selection : ''}
            disabled={Boolean(busy)}
            onValueChange={(value) => {
              setSelection(value)
              setBindingId('')
            }}>
            <SelectTrigger id={id + '-definition'} data-ui="teams-definition">
              <SelectValue placeholder={t('settings.prometheus.integration.uarAdmin.teams.chooseDefinition')} />
            </SelectTrigger>
            <SelectContent>
              {snapshot.definitions.map((item) => (
                <SelectItem
                  key={definitionKey(item)}
                  value={definitionKey(item)}
                  data-definition-id={item.id}
                  data-definition-digest={item.digest}>
                  {item.title} · {item.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={id + '-binding'} className="mb-1.5 block text-sm font-medium">
            {t('settings.prometheus.integration.uarAdmin.teams.binding')}
          </label>
          <Select value={binding?.id ?? ''} disabled={!definition || Boolean(busy)} onValueChange={setBindingId}>
            <SelectTrigger id={id + '-binding'} data-ui="teams-binding">
              <SelectValue placeholder={t('settings.prometheus.integration.uarAdmin.teams.chooseBinding')} />
            </SelectTrigger>
            <SelectContent>
              {bindings.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.id} · {t('settings.prometheus.integration.uarAdmin.teams.revision')} {item.revision}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {definition && bindings.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('settings.prometheus.integration.uarAdmin.teams.noBindings')}
            </p>
          )}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {t('work.teams.codingPreset')}
        </summary>
        <UarTeamModelPicker value={model} disabled={Boolean(busy)} onChange={setModel} />
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          data-ui="teams-coding-preset"
          disabled={!model || Boolean(busy) || !snapshot.capabilities.coding}
          onClick={() => void setup()}>
          {busy === 'setup' ? t('common.loading') : t('work.teams.codingPreset')}
        </Button>
      </details>
      {!snapshot.capabilities.coding && (
        <p role="status" className="text-sm text-warning-subtle-foreground" data-ui="teams-coding-unavailable">
          {t('work.teams.codingUnavailable')}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void start()
        }}
        className="space-y-3">
        <label htmlFor={id + '-prompt'} className="block text-sm font-medium">
          {t('work.teams.prompt')}
        </label>
        <Textarea.Input
          id={id + '-prompt'}
          data-ui="teams-prompt"
          rows={4}
          maxLength={32000}
          value={prompt}
          disabled={Boolean(busy)}
          onChange={(event) => setPrompt(event.target.value)}
          aria-describedby={id + '-prompt-help'}
        />
        <p id={id + '-prompt-help'} className="text-xs text-muted-foreground">
          {t('work.teams.promptHelp')}
        </p>
        <Button
          type="submit"
          data-ui="teams-start"
          disabled={
            !definition ||
            !binding ||
            !prompt.trim() ||
            Boolean(busy) ||
            !snapshot.capabilities.coding ||
            !snapshot.capabilities.execution
          }>
          {busy === 'start' ? t('common.loading') : t('work.teams.start')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="break-words text-sm text-error">
          {error} {t('settings.prometheus.integration.uarAdmin.teams.retryGuidance')}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-success">
          {status}
        </p>
      )}
    </section>
  )
}
