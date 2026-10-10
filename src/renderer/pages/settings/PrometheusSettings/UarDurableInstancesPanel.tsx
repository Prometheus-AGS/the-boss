import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarDurableOperation, UarInstanceAction, UarInstanceProfile } from '@shared/types/uarDurableAdministration'

import { useUarDurableWorkspace } from './useUarDurableWorkspace'
import { UarDurableTurnControls } from './UarDurableTurnControls'
import { UarLifecycleActivity } from './UarLifecycleActivity'

const ACTIONS: UarInstanceAction[] = ['activate', 'passivate', 'drain', 'disable', 'restart', 'cancel']
const PROFILES: UarInstanceProfile[] = ['request', 'on_demand', 'resident']

export function UarDurableInstancesPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.durable' })
  const { snapshot, loading, busy, error, status, refreshRequired, refresh, run } = useUarDurableWorkspace(workspaceId)
  const [bindingId, setBindingId] = useState<string>()
  const [profile, setProfile] = useState<UarInstanceProfile>('on_demand')
  const [setupBusy, setSetupBusy] = useState(false)
  const canUse = (operation: UarDurableOperation) =>
    Boolean(snapshot?.capabilities.instances && snapshot.operations[operation]?.available)
  const reason = (operation: UarDurableOperation) => snapshot?.operations[operation]?.reason
  const selectedBinding = snapshot?.bindings.find((binding) => binding.id === bindingId)
  const needsStarter = snapshot && !snapshot.bindings.some((binding) => binding.activationSupported)

  const setupStarter = () => {
    setSetupBusy(true)
    void run(
      () => ipcApi.request('prometheus.uar.durable.setup_starter', { workspaceId }),
      tr('setupStarterSucceeded'),
      (binding) => setBindingId(binding.id)
    ).finally(() => setSetupBusy(false))
  }

  const create = () => {
    if (!bindingId) return
    void run(
      () =>
        ipcApi.request('prometheus.uar.durable.create_instance', {
          workspaceId,
          deploymentBindingId: bindingId,
          profile
        }),
      tr('instanceCreated')
    )
  }
  const act = (instanceId: string, action: UarInstanceAction) => {
    const commandId = crypto.randomUUID()
    void run(
      () => ipcApi.request('prometheus.uar.durable.instance_action', { workspaceId, instanceId, action, commandId }),
      tr('instanceActionSucceeded', { action: tr(`action.${action}`) })
    )
  }

  return (
    <div
      data-ui="uar-durable-panel"
      data-workspace-id={workspaceId}
      data-loading={loading}
      data-capability-instances={snapshot?.capabilities.instances ?? 'unknown'}
      className="space-y-4">
      <SettingGroup>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SettingTitle>{tr('instancesTitle')}</SettingTitle>
            <SettingDescription>{tr('instancesDescription')}</SettingDescription>
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
        {snapshot && !canUse('agent-instances.list') && (
          <p className="mt-4 text-sm text-muted-foreground">
            {tr('unavailable')}: {reason('agent-instances.list') ?? tr('capabilityDisabled')}
          </p>
        )}
      </SettingGroup>

      {snapshot && (
        <>
          <SettingGroup>
            <SettingTitle>{tr('createInstance')}</SettingTitle>
            <SettingDescription>{tr('createInstanceDescription')}</SettingDescription>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="uar-deployment-binding" className="mb-1.5 block text-sm font-medium">
                  {tr('deploymentBinding')}
                </label>
                <Select
                  value={bindingId}
                  onValueChange={setBindingId}
                  disabled={busy || refreshRequired || !canUse('collaboration.deployment_bindings.list')}>
                  <SelectTrigger id="uar-deployment-binding">
                    <SelectValue placeholder={tr('chooseBinding')} />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.bindings.map((binding) => (
                      <SelectItem key={binding.id} value={binding.id}>
                        {binding.id} · {tr('revision')} {binding.revision}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="uar-instance-profile" className="mb-1.5 block text-sm font-medium">
                  {tr('profile')}
                </label>
                <Select
                  value={profile}
                  onValueChange={(value) => setProfile(value as UarInstanceProfile)}
                  disabled={busy || refreshRequired}>
                  <SelectTrigger id="uar-instance-profile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFILES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tr(`profile.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {snapshot.bindings.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{tr('noBindings')}</p>}
            {snapshot.bindings.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs" aria-label={tr('deploymentBinding')}>
                {snapshot.bindings.map((binding) => (
                  <li key={binding.id} className="flex flex-wrap items-center gap-2">
                    <span className="break-all">
                      {binding.id} · {tr('revision')} {binding.revision}
                    </span>
                    <Badge variant={binding.activationSupported ? 'secondary' : 'outline'}>
                      {binding.activationSupported ? tr('bindingReady') : tr('bindingActivationUnavailable')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {needsStarter && (
              <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
                <p className="text-sm text-muted-foreground">{tr('setupStarterDescription')}</p>
                {!snapshot.operations['starter.setup']?.available && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tr('setupStarterUnavailable')} {snapshot.operations['starter.setup']?.reason}
                  </p>
                )}
                <Button
                  variant="outline"
                  className="mt-3"
                  disabled={busy || refreshRequired || !snapshot.operations['starter.setup']?.available}
                  onClick={setupStarter}>
                  {tr('setupStarter')}
                </Button>
                {setupBusy && (
                  <p className="mt-2 text-sm text-muted-foreground" role="status">
                    {tr('setupStarterProgress')}
                  </p>
                )}
              </div>
            )}
            {selectedBinding && !selectedBinding.activationSupported && (
              <p className="mt-3 text-sm text-warning-subtle-foreground">{tr('bindingActivationUnavailable')}</p>
            )}
            {!canUse('agent-instances.create') && (
              <p className="mt-3 text-sm text-muted-foreground">
                {tr('unavailable')}: {reason('agent-instances.create') ?? tr('capabilityDisabled')}
              </p>
            )}
            <Button
              className="mt-4"
              disabled={
                !bindingId ||
                !selectedBinding?.activationSupported ||
                busy ||
                refreshRequired ||
                !canUse('agent-instances.create')
              }
              onClick={create}>
              {tr('createInstance')}
            </Button>
          </SettingGroup>
          <SettingGroup>
            <SettingTitle>{tr('instanceInventory')}</SettingTitle>
            {snapshot.instances.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">{tr('noInstances')}</p>
            )}
            <div className="mt-4 space-y-3">
              {snapshot.instances.map((instance) => (
                <article
                  key={instance.instanceId}
                  data-ui="uar-durable-instance"
                  data-instance-id={instance.instanceId}
                  className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-all text-sm font-medium">{instance.instanceId}</h3>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {instance.definitionId} · {instance.definitionVersion} · {instance.bindingId} #
                        {instance.bindingRevision}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{tr(`lifecycle.${instance.lifecycle}`)}</Badge>
                      <Badge variant="outline">{tr(`profile.${instance.profile}`)}</Badge>
                      {instance.recovery !== 'ready' && (
                        <Badge variant="outline">{tr(`recovery.${instance.recovery}`)}</Badge>
                      )}
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      {tr('revision')}: {instance.revision}
                    </div>
                    <div>
                      {tr('epoch')}: {instance.epoch}
                    </div>
                    <div>
                      {tr('queueDepth')}: {instance.queueDepth}
                    </div>
                    <div>
                      {tr('restartAttempts')}: {instance.restartAttempts}
                    </div>
                    <div>
                      {tr('nextEventSequence')}: {instance.nextEventSequence}
                    </div>
                    {instance.activeRunId && (
                      <div className="break-all">
                        {tr('activeRun')}: {instance.activeRunId}
                      </div>
                    )}
                    {instance.lastErrorCode && (
                      <div className="break-all text-error">
                        {tr('lastError')}: {instance.lastErrorCode}
                      </div>
                    )}
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ACTIONS.filter((action) => canUse(`agent-instances.${action}` as UarDurableOperation)).map((action) => {
                      const operation = `agent-instances.${action}` as UarDurableOperation
                      return (
                        <Button
                          key={action}
                          data-ui="uar-durable-action"
                          data-instance-id={instance.instanceId}
                          data-instance-action={action}
                          variant="outline"
                          size="sm"
                          title={canUse(operation) ? undefined : (reason(operation) ?? tr('capabilityDisabled'))}
                          disabled={
                            busy ||
                            refreshRequired ||
                            !canUse(operation) ||
                            (action === 'cancel' && !instance.activeRunId)
                          }
                          onClick={() => act(instance.instanceId, action)}>
                          {tr(`action.${action}`)}
                        </Button>
                      )
                    })}
                  </div>
                  <UarDurableTurnControls workspaceId={workspaceId} instance={instance}
                    disabled={busy || refreshRequired || !canUse('agent-instances.turn')} refresh={refresh} />
                  <dl className="mt-4"><UarLifecycleActivity instance={instance} /></dl>
                </article>
              ))}
            </div>
          </SettingGroup>
        </>
      )}
    </div>
  )
}
