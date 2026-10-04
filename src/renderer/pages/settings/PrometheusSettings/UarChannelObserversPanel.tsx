import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, ConfirmDialog } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import { IpcError } from '@shared/ipc/errors/IpcError'
import type {
  UarChannelDeliveries,
  UarChannelObserverAction,
  UarChannelObserversSnapshot,
  UarChannelSubscription
} from '@shared/types/uarChannelObservers'

const errorKey = (value: unknown) => {
  const code = value instanceof IpcError ? value.code.replace('UAR_CHANNEL_', '') : 'requestFailed'
  return ['authority', 'conflict', 'missing', 'unavailable', 'scope', 'stale'].includes(code) ? code : 'requestFailed'
}

export function UarChannelObserversPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`settings.prometheus.integration.uarAdmin.channelObservers.${key}`)
  const durable = (key: string) => t(`settings.prometheus.integration.uarAdmin.durable.${key}`)
  const [snapshot, setSnapshot] = useState<UarChannelObserversSnapshot>()
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<UarChannelObserverAction>()
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<UarChannelSubscription>()
  const [expanded, setExpanded] = useState<string>()
  const [inventory, setInventory] = useState<UarChannelDeliveries>()
  const [inventoryLoading, setInventoryLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    setPendingRevoke(undefined)
    setExpanded(undefined)
    setInventory(undefined)
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.channel_observers.read', { workspaceId }))
      setRefreshRequired(false)
    } catch (value) {
      setError(errorKey(value))
      setRefreshRequired(true)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const act = async (record: UarChannelSubscription, action: UarChannelObserverAction) => {
    if (!snapshot) return
    setBusy(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const updated = await ipcApi.request('prometheus.uar.channel_observers.action', {
        workspaceId,
        subscriptionId: record.subscriptionId,
        generation: snapshot.generation,
        expectedRevision: record.revision,
        action
      })
      setSnapshot({
        ...snapshot,
        subscriptions: snapshot.subscriptions.map((item) =>
          item.subscriptionId === updated.subscriptionId ? updated : item
        )
      })
      setStatus(action)
      await refresh()
    } catch (value) {
      setError(errorKey(value))
      setRefreshRequired(true)
    } finally {
      setBusy(false)
    }
  }

  const showDeliveries = async (record: UarChannelSubscription) => {
    if (!snapshot) return
    if (expanded === record.subscriptionId) {
      setExpanded(undefined)
      return
    }
    setExpanded(record.subscriptionId)
    setInventory(undefined)
    setInventoryLoading(true)
    setError(undefined)
    try {
      setInventory(
        await ipcApi.request('prometheus.uar.channel_observers.deliveries', {
          workspaceId,
          subscriptionId: record.subscriptionId,
          generation: snapshot.generation
        })
      )
    } catch (value) {
      setError(errorKey(value))
      setRefreshRequired(true)
    } finally {
      setInventoryLoading(false)
    }
  }

  const disabled = busy || loading || inventoryLoading || refreshRequired
  return (
    <SettingGroup>
      <SettingTitle className="gap-3">
        <span>{tr('title')}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || loading || inventoryLoading}
          onClick={() => void refresh()}>
          <RefreshCw
            className={loading ? 'animate-spin motion-reduce:animate-none' : undefined}
            size={14}
            aria-hidden="true"
          />
          {t('common.refresh')}
        </Button>
      </SettingTitle>
      <SettingDescription>{tr('description')}</SettingDescription>
      {loading && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {t('common.loading')}
        </p>
      )}
      {status && (
        <p className="mt-3 text-sm" role="status">
          {t('settings.prometheus.integration.uarAdmin.durable.observerActionSucceeded', { action: tr(status) })}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {tr(`error.${error}`)}
        </p>
      )}
      {refreshRequired && <p className="mt-2 text-sm text-muted-foreground">{durable('refreshBeforeAction')}</p>}
      {snapshot && !snapshot.supported && (
        <p className="mt-3 text-sm text-muted-foreground">{tr(snapshot.unavailableReason ?? 'methodUnavailable')}</p>
      )}
      {snapshot?.supported && snapshot.subscriptions.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{tr('empty')}</p>
      )}
      <div className="mt-4 space-y-3">
        {snapshot &&
          snapshot.subscriptions.map((record) => {
            const action = record.paused ? 'resume' : 'pause'
            const isExpanded = expanded === record.subscriptionId
            const detailsId = `channel-deliveries-${record.subscriptionId}`
            const identity = [
              [tr('provider'), record.source.provider],
              [tr('account'), record.source.account],
              [durable('workspaceTitle'), record.workspaceId],
              [tr('sourceWorkspace'), record.source.workspace],
              [tr('room'), record.source.room],
              [tr('thread'), record.source.thread ?? '—'],
              [tr('sender'), record.source.sender],
              [durable('observerInstance'), record.observerInstanceId],
              [durable('revision'), record.revision],
              [durable('cursor'), record.cursor ?? '—']
            ]
            return (
              <article key={record.subscriptionId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="min-w-0 break-all text-sm font-medium">{record.subscriptionId}</h3>
                  <Badge variant="outline">
                    {durable(record.revoked ? 'revoked' : record.paused ? 'paused' : 'active')}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1 text-xs">
                  {identity.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || record.revoked || !snapshot.operations[action]}
                    title={snapshot.operations[action] ? undefined : durable('capabilityDisabled')}
                    onClick={() => void act(record, action)}>
                    {tr(action)}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={disabled || record.revoked || !snapshot.operations.revoke}
                    title={snapshot.operations.revoke ? undefined : durable('capabilityDisabled')}
                    onClick={() => setPendingRevoke(record)}>
                    {tr('revoke')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    disabled={disabled || !snapshot.operations.deliveries}
                    title={snapshot.operations.deliveries ? undefined : tr('inventoryUnavailable')}
                    onClick={() => void showDeliveries(record)}>
                    {tr('deliveries')}
                  </Button>
                </div>
                {!snapshot.operations.deliveries && (
                  <p className="mt-2 text-xs text-muted-foreground">{tr('inventoryUnavailable')}</p>
                )}
                {isExpanded && (
                  <div id={detailsId} className="mt-3 space-y-2 border-t border-border pt-3">
                    {inventoryLoading && (
                      <p className="text-sm text-muted-foreground" role="status">
                        {t('common.loading')}
                      </p>
                    )}
                    {inventory && (
                      <>
                        <p className="break-all text-xs">
                          {durable('cursor')}: {inventory.cursor ?? '—'}
                        </p>
                        {inventory.deliveries.length === 0 && (
                          <p className="text-sm text-muted-foreground">{tr('noDeliveries')}</p>
                        )}
                        {inventory.deliveries.map((delivery) => (
                          <div key={delivery.deliveryId} className="rounded border border-border p-2 text-xs">
                            <Badge variant="outline">{tr(`state.${delivery.status}`)}</Badge>
                            <dl className="mt-2 space-y-1">
                              {[
                                [tr('deliveryId'), delivery.deliveryId],
                                [tr('occurrenceId'), delivery.occurrenceId],
                                [durable('cursor'), delivery.subscriberCursorId],
                                [tr('admittedAt'), delivery.admittedAt],
                                [tr('updatedAt'), delivery.updatedAt]
                              ].map(([label, value]) => (
                                <div key={label} className="flex flex-wrap gap-x-2">
                                  <dt className="text-muted-foreground">{label}</dt>
                                  <dd className="break-all">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </article>
            )
          })}
      </div>
      <ConfirmDialog
        open={pendingRevoke !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(undefined)
        }}
        title={tr('revokeTitle')}
        description={tr('revokeDescription')}
        content={<p className="break-all text-sm">{pendingRevoke?.subscriptionId}</p>}
        confirmText={tr('revoke')}
        cancelText={t('common.cancel')}
        destructive
        confirmLoading={busy}
        confirmDisabled={disabled || !snapshot?.operations.revoke}
        onConfirm={async () => {
          if (pendingRevoke) await act(pendingRevoke, 'revoke')
        }}
      />
    </SettingGroup>
  )
}
