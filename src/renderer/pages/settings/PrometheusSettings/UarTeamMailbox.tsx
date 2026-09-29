import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamInstance, UarTeamMailboxMessage } from '@shared/types/uarTeams'

type Mode = 'queue-only' | 'trigger-turn'

interface Props {
  workspaceId: string
  instance: UarTeamInstance
  available: boolean
}

export function UarTeamMailbox({ workspaceId, instance, available }: Props) {
  const { i18n, t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const recipientInputId = useId()
  const modeInputId = useId()
  const contentInputId = useId()
  const [messages, setMessages] = useState<UarTeamMailboxMessage[]>([])
  const [recipientMemberId, setRecipientMemberId] = useState<string>()
  const [mode, setMode] = useState<Mode>('queue-only')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const sendIntent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const page = await ipcApi.request('prometheus.uar.teams.mailbox_list', {
        workspaceId,
        teamInstanceId: instance.id
      })
      setMessages(page.messages)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, instance.id])

  useEffect(() => {
    if (available) void refresh()
  }, [available, refresh])

  const send = async () => {
    const text = content.trim()
    if (!available || !recipientMemberId || !text) return
    const fingerprint = JSON.stringify([workspaceId, instance.id, recipientMemberId, mode, text])
    const intent =
      sendIntent.current?.fingerprint === fingerprint
        ? sendIntent.current
        : { fingerprint, commandId: crypto.randomUUID() }
    sendIntent.current = intent
    setSending(true)
    setError(undefined)
    setStatus(undefined)
    try {
      await ipcApi.request('prometheus.uar.teams.mailbox_send', {
        workspaceId,
        teamInstanceId: instance.id,
        commandId: intent.commandId,
        recipientMemberId,
        content: text,
        mode
      })
      sendIntent.current = undefined
      setContent('')
      setStatus(tr('messageStatus.accepted'))
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSending(false)
    }
  }

  const memberName = (id: string) => {
    const member = instance.members.find((candidate) => candidate.id === id)
    return member ? `${member.role} · ${member.ordinal}` : id
  }
  const messageStatus = (message: UarTeamMailboxMessage) => tr(`messageStatus.${message.status}`)
  const formatTime = (value: string) => new Date(value).toLocaleString(i18n.language)

  return (
    <SettingGroup>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SettingTitle>{tr('mailboxTitle')}</SettingTitle>
          <SettingDescription>{tr('mailboxDescription')}</SettingDescription>
        </div>
        <Button variant="outline" size="sm" disabled={!available || loading || sending} onClick={() => void refresh()}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
          {t('common.refresh')}
        </Button>
      </div>
      {!available && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {tr('mailboxUnavailable')}
        </p>
      )}
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
          <label htmlFor={recipientInputId} className="mb-1.5 block text-sm font-medium">
            {tr('recipient')}
          </label>
          <Select value={recipientMemberId} onValueChange={setRecipientMemberId} disabled={!available || sending}>
            <SelectTrigger id={recipientInputId}>
              <SelectValue placeholder={tr('chooseRecipient')} />
            </SelectTrigger>
            <SelectContent>
              {instance.members
                .filter((member) => member.status !== 'revoked')
                .map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {memberName(member.id)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={modeInputId} className="mb-1.5 block text-sm font-medium">
            {tr('deliveryMode')}
          </label>
          <Select value={mode} onValueChange={(value) => setMode(value as Mode)} disabled={!available || sending}>
            <SelectTrigger id={modeInputId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queue-only">{tr('deliveryMode.queueOnly')}</SelectItem>
              <SelectItem value="trigger-turn">{tr('deliveryMode.triggerTurn')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{tr('execution.mailboxHelp')}</p>
      <div className="mt-3">
        <label htmlFor={contentInputId} className="mb-1.5 block text-sm font-medium">
          {tr('messageContent')}
        </label>
        <Textarea.Input
          id={contentInputId}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={16000}
          rows={3}
          disabled={!available || sending}
        />
      </div>
      <Button
        className="mt-3"
        disabled={!available || sending || !recipientMemberId || !content.trim()}
        onClick={() => void send()}>
        {sending ? tr('sendingMessage') : tr('sendMessage')}
      </Button>
      <div className="mt-5 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-medium">{tr('messageHistory')}</h3>
        {loading && (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {t('common.loading')}
          </p>
        )}
        {available && !loading && messages.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{tr('noMessages')}</p>
        )}
        <ol className="mt-3 space-y-2">
          {messages.map((message) => (
            <li key={message.messageId} className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{tr('toMember', { member: memberName(message.recipientMemberId) })}</span>
                <Badge variant="outline">{messageStatus(message)}</Badge>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{message.content}</p>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {tr(message.mode === 'trigger-turn' ? 'deliveryMode.triggerTurn' : 'deliveryMode.queueOnly')} ·{' '}
                {formatTime(message.acceptedAt)} · {message.messageId}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </SettingGroup>
  )
}
