import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarDurableCommand, UarDurableInstance } from '@shared/types/uarDurableAdministration'

import { UarDurableRunPanel } from './UarDurableRunPanel'

export function UarDurableTurnControls({ workspaceId, instance, disabled, refresh }: {
  workspaceId: string
  instance: UarDurableInstance
  disabled: boolean
  refresh: () => Promise<void>
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.' + key)
  const id = useId()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [submitted, setSubmitted] = useState<UarDurableCommand>()
  // A failed transport may have admitted the command. Retain its ID for a deliberate retry.
  const [request, setRequest] = useState<{ commandId: string; prompt: string }>()
  const current = submitted && (instance.commands.find((command) => command.commandId === submitted.commandId) ?? submitted)
  const submit = async () => {
    const next = request ?? { commandId: crypto.randomUUID(), prompt: prompt.trim() }
    setRequest(next); setBusy(true); setError(undefined)
    try {
      setSubmitted(await ipcApi.request('prometheus.uar.durable.submit_turn', { workspaceId,
        instanceId: instance.instanceId, ...next }))
      setRequest(undefined); setPrompt('')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const runId = current?.rootRunId ?? instance.activeRunId ?? instance.commands.findLast((command) => command.kind === 'turn' && command.rootRunId)?.rootRunId
  return <div className="mt-4 space-y-2" data-ui="uar-durable-turn" data-instance-id={instance.instanceId}>
    <label htmlFor={id} className="block text-sm font-medium">{tr('durable.turnPrompt')}</label>
    <Textarea.Input id={id} value={prompt} disabled={disabled || busy || Boolean(request)}
      onValueChange={setPrompt} />
    <p className="text-xs text-muted-foreground">{tr('durable.turnHelp')}</p>
    <Button size="sm" disabled={disabled || busy || (!request && !prompt.trim()) || instance.lifecycle === 'disabled' ||
      instance.lifecycle === 'draining' || instance.recovery !== 'ready'} onClick={() => void submit()}>
      {busy ? t('common.loading') : request ? t('common.retry') : tr('durable.submitTurn')}
    </Button>
    {current && <div className="break-all text-xs" role="status" data-command-id={current.commandId}>
      {tr('lifecycle.detail.command')}: {current.commandId} · {current.status === 'completed' ? t('common.completed') :
        current.status === 'accepted' ? tr('teams.messageStatus.accepted') : tr('teams.execution.status.' + current.status)}
      {current.rootRunId && <p>{tr('lifecycle.detail.rootRun')}: {current.rootRunId}</p>}
    </div>}
    {runId && <UarDurableRunPanel key={workspaceId + ":" + instance.instanceId + ":" + runId} workspaceId={workspaceId} instanceId={instance.instanceId} runId={runId} />}
    {error && <p className="break-words text-sm text-error" role="alert">{error}</p>}
  </div>
}
