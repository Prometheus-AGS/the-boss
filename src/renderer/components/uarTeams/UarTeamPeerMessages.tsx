import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamPeerMessages as PeerPage } from '@shared/types/uarTeamContext'
import type { UarTeamInstance } from '@shared/types/uarTeams'

import { uarTeamError } from './uarTeamError'

export function UarTeamPeerMessages({
  workspaceId,
  instance,
  available
}: {
  workspaceId: string
  instance: UarTeamInstance
  available: boolean
}) {
  const { t, i18n } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const [page, setPage] = useState<PeerPage>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    setBusy(true)
    setPage(undefined)
    setError(undefined)
    try {
      setPage(await ipcApi.request('prometheus.uar.teams.peer_messages', { workspaceId, teamInstanceId: instance.id }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [workspaceId, instance.id])
  useEffect(() => {
    if (available) void refresh()
  }, [available, refresh])
  const memberName = (id: string) => {
    const member = instance.members.find((item) => item.id === id)
    return member ? member.role + ' · ' + member.ordinal : id
  }
  return (
    <SettingGroup data-ui="uar-team-peer-messages">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SettingTitle>{tr('cooperation.messages')}</SettingTitle>
          <SettingDescription>{tr('cooperation.messagesHelp')}</SettingDescription>
        </div>
        <Button size="sm" variant="outline" disabled={!available || busy} onClick={() => void refresh()}>
          {busy ? t('common.loading') : t('common.refresh')}
        </Button>
      </div>
      {!available && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {tr('cooperation.unavailable')}
        </p>
      )}
      {error && (
        <p className="mt-3 break-words text-sm text-error" role="alert">
          {uarTeamError(error, (key) => tr('execution.' + key))}
        </p>
      )}
      {available && page?.messages.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{tr('noMessages')}</p>
      )}
      <ol className="mt-3 divide-y divide-border-subtle">
        {page?.messages.map(({ message, delivery }) => (
          <li key={message.messageId} className="min-w-0 py-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="break-words text-sm font-medium">
                {tr('cooperation.messageRoute', {
                  sender: memberName(message.senderMemberId),
                  recipient: memberName(message.recipientMemberId)
                })}
              </span>
              <Badge variant="outline">{tr('messageStatus.' + delivery.status)}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{tr('cooperation.untrustedData')}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.payload.text}</p>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              {message.messageId} · {new Date(message.acceptedAt).toLocaleString(i18n.language)}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {tr('cooperation.senderAttempt')}: {message.senderAttemptId}
            </p>
            {delivery.selectedAttemptId && (
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {tr('cooperation.selectedAttempt')}: {delivery.selectedAttemptId}
              </p>
            )}
            {delivery.consumedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {tr('cooperation.consumedAt')}: {new Date(delivery.consumedAt).toLocaleString(i18n.language)}
              </p>
            )}
            {delivery.rejectionCode && (
              <p className="mt-1 break-words text-xs text-warning-subtle-foreground">
                {uarTeamError(delivery.rejectionCode, (key) => tr('execution.' + key))}
              </p>
            )}
            {message.payload.artifactIds.length > 0 && (
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {tr('cooperation.artifactCount', { count: message.payload.artifactIds.length })} ·{' '}
                {message.payload.artifactIds.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </SettingGroup>
  )
}
