import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Badge,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarDurableObserver, UarDurableOperation, UarObserverAction } from '@shared/types/uarDurableAdministration'

import { UarChannelObserversPanel } from './UarChannelObserversPanel'
import { useUarDurableWorkspace } from './useUarDurableWorkspace'

export function UarObserversPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.durable' })
  const { snapshot, loading, busy, error, status, refreshRequired, refresh, run } = useUarDurableWorkspace(workspaceId)
  const [observerId, setObserverId] = useState<string>()
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [conversationFilter, setConversationFilter] = useState('')
  const canUse = (operation: UarDurableOperation) =>
    Boolean(snapshot?.capabilities.observers && snapshot.operations[operation]?.available)
  const reason = (operation: UarDurableOperation) => snapshot?.operations[operation]?.reason
  const availableSources = snapshot?.instances.filter((instance) => instance.instanceId !== observerId) ?? []
  const selectedSources = sourceIds.filter((id) => availableSources.some((instance) => instance.instanceId === id))

  const create = () => {
    if (!observerId || selectedSources.length === 0) return
    const conversationIds = [
      ...new Set(
        conversationFilter
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ]
    void run(
      () =>
        ipcApi.request('prometheus.uar.durable.create_observer', {
          workspaceId,
          observerInstanceId: observerId,
          sourceInstanceIds: selectedSources,
          ...(conversationIds.length ? { conversationIds } : {})
        }),
      tr('observerCreated')
    )
  }
  const act = (observer: UarDurableObserver, action: UarObserverAction) => {
    void run(
      () =>
        ipcApi.request('prometheus.uar.durable.observer_action', {
          workspaceId,
          subscriptionId: observer.subscriptionId,
          action,
          expectedRevision: observer.revision
        }),
      tr('observerActionSucceeded', { action: tr(`action.${action}`) })
    )
  }
  const acknowledge = (observer: UarDurableObserver, gap: UarDurableObserver['gaps'][number]) => {
    void run(
      () =>
        ipcApi.request('prometheus.uar.durable.acknowledge_gap', {
          workspaceId,
          subscriptionId: observer.subscriptionId,
          expectedRevision: observer.revision,
          sourceInstanceId: gap.sourceInstanceId,
          missingFrom: gap.missingFrom,
          missingThrough: gap.missingThrough
        }),
      tr('gapAcknowledged')
    )
  }

  return (
    <div className="space-y-4">
      <SettingGroup>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SettingTitle>{tr('observersTitle')}</SettingTitle>
            <SettingDescription>{tr('observersDescription')}</SettingDescription>
          </div>
          <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => void refresh()}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
        {loading && (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {t('common.loading')}
          </p>
        )}
        {error && (
          <div
            className="mt-4 rounded-lg border border-error-border bg-error-subtle p-3 text-sm text-error-subtle-foreground"
            role="alert">
            {error} {refreshRequired && tr('refreshBeforeAction')}
          </div>
        )}
        {status && (
          <p className="mt-4 text-sm text-success" role="status">
            {status}
          </p>
        )}
        {snapshot && !canUse('observers.list') && (
          <p className="mt-4 text-sm text-muted-foreground">
            {tr('unavailable')}: {reason('observers.list') ?? tr('capabilityDisabled')}
          </p>
        )}
      </SettingGroup>

      {snapshot && (
        <>
          <SettingGroup>
            <SettingTitle>{tr('createObserver')}</SettingTitle>
            <SettingDescription>{tr('createObserverDescription')}</SettingDescription>
            <div className="mt-4">
              <label htmlFor="uar-observer-instance" className="mb-1.5 block text-sm font-medium">
                {tr('observerInstance')}
              </label>
              <Select
                value={observerId}
                onValueChange={(id) => {
                  setObserverId(id)
                  setSourceIds((current) => current.filter((source) => source !== id))
                }}
                disabled={busy || refreshRequired}>
                <SelectTrigger id="uar-observer-instance">
                  <SelectValue placeholder={tr('chooseInstance')} />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.instances.map((instance) => (
                    <SelectItem key={instance.instanceId} value={instance.instanceId}>
                      {instance.instanceId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="mt-4 space-y-2" disabled={busy || refreshRequired}>
              <legend className="text-sm font-medium">{tr('sourceInstances')}</legend>
              <p className="text-xs text-muted-foreground">{tr('sourceInstancesDescription')}</p>
              {availableSources.length === 0 && <p className="text-sm text-muted-foreground">{tr('noSources')}</p>}
              {availableSources.map((instance) => (
                <label key={instance.instanceId} className="flex items-center gap-2 break-all text-sm">
                  <Checkbox
                    checked={selectedSources.includes(instance.instanceId)}
                    onCheckedChange={(checked) =>
                      setSourceIds((current) =>
                        checked === true
                          ? [...new Set([...current, instance.instanceId])]
                          : current.filter((id) => id !== instance.instanceId)
                      )
                    }
                  />
                  {instance.instanceId}
                </label>
              ))}
            </fieldset>
            <div className="mt-4">
              <label htmlFor="uar-observer-conversations" className="mb-1.5 block text-sm font-medium">
                {tr('conversationFilter')}
              </label>
              <Input
                id="uar-observer-conversations"
                value={conversationFilter}
                onChange={(event) => setConversationFilter(event.target.value)}
                placeholder={tr('conversationFilterPlaceholder')}
                disabled={busy || refreshRequired}
              />
              <p className="mt-1 text-xs text-muted-foreground">{tr('conversationFilterDescription')}</p>
            </div>
            {!canUse('observers.create') && (
              <p className="mt-3 text-sm text-muted-foreground">
                {tr('unavailable')}: {reason('observers.create') ?? tr('capabilityDisabled')}
              </p>
            )}
            <Button
              className="mt-4"
              disabled={
                !observerId || selectedSources.length === 0 || busy || refreshRequired || !canUse('observers.create')
              }
              onClick={create}>
              {tr('createObserver')}
            </Button>
          </SettingGroup>
          <SettingGroup>
            <SettingTitle>{tr('observerInventory')}</SettingTitle>
            {snapshot.observers.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">{tr('noObservers')}</p>
            )}
            <div className="mt-4 space-y-3">
              {snapshot.observers.map((observer) => {
                const action: UarObserverAction = observer.paused ? 'resume' : 'pause'
                const operation = `observers.${action}` as UarDurableOperation
                return (
                  <article key={observer.subscriptionId} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-all text-sm font-medium">{observer.subscriptionId}</h3>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {tr('observerInstance')}: {observer.observerInstanceId}
                        </p>
                      </div>
                      <Badge variant={observer.revoked ? 'outline' : 'secondary'}>
                        {observer.revoked ? tr('revoked') : observer.paused ? tr('paused') : tr('active')}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {tr('revision')}: {observer.revision}
                      </span>
                      <span>
                        {tr('backlogDepth')}: {observer.backlogDepth}
                      </span>
                      <span>
                        {tr('deadLetters')}: {observer.deadLetterCount}
                      </span>
                      <span>
                        {tr('sourceCount')}: {observer.sourceInstanceIds.length}
                      </span>
                    </div>
                    {observer.conversationIds && (
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        {tr('conversationFilter')}: {observer.conversationIds.join(', ')}
                      </p>
                    )}
                    <div className="mt-3">
                      <h4 className="text-xs font-medium">{tr('sourceProgress')}</h4>
                      <div className="mt-1 space-y-1">
                        {observer.sources.map((source) => {
                          const openGap = observer.gaps.some(
                            (gap) => gap.sourceInstanceId === source.sourceInstanceId && !gap.acknowledgedAt
                          )
                          return (
                            <div
                              key={source.sourceInstanceId}
                              className="flex flex-wrap items-center gap-2 border-b border-border-subtle py-1.5 text-xs last:border-0">
                              <span className="min-w-0 break-all font-medium">{source.sourceInstanceId}</span>
                              <span className="text-muted-foreground">
                                {tr('cursor')}: {source.cursor ?? tr('unknown')}
                              </span>
                              <span className="text-muted-foreground">
                                {tr('retainedLow')}: {source.retainedLow ?? tr('unknown')}
                              </span>
                              <span className="text-muted-foreground">
                                {tr('sourceHigh')}: {source.sourceHigh ?? tr('unknown')}
                              </span>
                              {openGap && <Badge variant="outline">{tr('retentionGaps')}</Badge>}
                              <span className="text-muted-foreground">{tr('lagUnknown')}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {observer.gaps.length > 0 && (
                      <div className="mt-3 rounded-lg border border-warning-border bg-warning-subtle p-3">
                        <h4 className="text-sm font-medium text-warning-subtle-foreground">{tr('retentionGaps')}</h4>
                        <div className="mt-2 space-y-2">
                          {observer.gaps.map((gap) => (
                            <div
                              key={`${gap.sourceInstanceId}:${gap.missingFrom}:${gap.missingThrough}`}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="break-all">
                                {gap.sourceInstanceId} · {gap.missingFrom}–{gap.missingThrough}
                              </span>
                              {gap.acknowledgedAt ? (
                                <Badge variant="outline">{tr('acknowledged')}</Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  title={
                                    canUse('observers.gap.acknowledge')
                                      ? undefined
                                      : (reason('observers.gap.acknowledge') ?? tr('capabilityDisabled'))
                                  }
                                  disabled={
                                    busy || refreshRequired || observer.revoked || !canUse('observers.gap.acknowledge')
                                  }
                                  onClick={() => acknowledge(observer, gap)}>
                                  {tr('acknowledgeGap')}
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {observer.recoveryActions.length > 0 && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        <h4 className="font-medium">{tr('recoveryGuidance')}</h4>
                        {observer.recoveryActions.map((item) => (
                          <p key={item}>{tr(`recoveryAction.${item}`, { defaultValue: item })}</p>
                        ))}
                      </div>
                    )}
                    <Button
                      className="mt-4"
                      variant="outline"
                      size="sm"
                      title={canUse(operation) ? undefined : (reason(operation) ?? tr('capabilityDisabled'))}
                      disabled={busy || refreshRequired || observer.revoked || !canUse(operation)}
                      onClick={() => act(observer, action)}>
                      {tr(`action.${action}`)}
                    </Button>
                  </article>
                )
              })}
            </div>
          </SettingGroup>
        </>
      )}
      <UarChannelObserversPanel key={workspaceId} workspaceId={workspaceId} />
    </div>
  )
}
