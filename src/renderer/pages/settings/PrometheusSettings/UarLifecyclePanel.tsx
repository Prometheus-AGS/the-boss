import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarLifecycleSnapshot } from '@shared/types/uarLifecycleAdministration'

import { UarLifecycleBindingPosture } from './UarLifecycleBindingPosture'
import { UarLifecycleDurable } from './UarLifecycleDurable'
import { UarLifecycleExecutions } from './UarLifecycleExecutions'
import {
  LifecycleEmpty,
  LifecycleField,
  LifecycleRecord,
  LifecycleReference,
  LifecycleSource
} from './UarLifecycleRecords'
import { UarLifecycleWorkflows } from './UarLifecycleWorkflows'

export function UarLifecyclePanel({
  workspaceId,
  serviceInstanceId,
  detailScopeMatches,
  onNavigate
}: {
  workspaceId: string
  serviceInstanceId: string
  detailScopeMatches: boolean
  onNavigate: (panel: string) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.' + key)
  const [data, setData] = useState<UarLifecycleSnapshot>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    setData(undefined)
    try {
      setData(await ipcApi.request('prometheus.uar.lifecycle.snapshot', { workspaceId, serviceInstanceId }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, serviceInstanceId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const teams = data?.teams.data
  const durable = data?.durable.data
  const definitionIds = new Set([
    ...(data?.agents.data?.map((item) => item.id + '@' + item.version) ?? []),
    ...(teams?.definitions.map((item) => item.id + '@' + item.version) ?? [])
  ])
  const bindingIds = new Set([
    ...(teams?.bindings.map((item) => item.id) ?? []),
    ...(durable?.bindings.map((item) => item.id) ?? [])
  ])
  const details = ['teams', 'durable-agent-instances', 'local-scoped-observers', 'approvals']
  return (
    <div className="space-y-4" data-ui="uar-lifecycle">
      <SettingGroup>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SettingTitle>{tr('lifecycle.title')}</SettingTitle>
            <SettingDescription>{tr('lifecycle.description')}</SettingDescription>
          </div>
          <Button
            data-ui="uar-lifecycle-refresh"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}>
            <RefreshCw size={14} aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <LifecycleField label={tr('lifecycle.requested')}>
            {serviceInstanceId} · {workspaceId}
          </LifecycleField>
          <LifecycleField label={tr('lifecycle.effective')}>
            {data
              ? `${data.effective.serviceInstanceId} · ${data.effective.runtimeId} · ${data.effective.workspaceId}`
              : tr('durable.unknown')}
          </LifecycleField>
          {data && (
            <>
              <LifecycleField label={tr('lifecycle.captured')}>
                <time dateTime={data.capturedAt}>{new Date(data.capturedAt).toLocaleString()}</time>
              </LifecycleField>
              <LifecycleField label={tr('runtimeVersion')}>
                {data.effective.uarVersion} · {tr('instances.ownership.' + data.effective.ownership)}
              </LifecycleField>
            </>
          )}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{tr('lifecycle.nonAtomic')}</p>
        {loading && (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {t('common.loading')}
          </p>
        )}
        {error && (
          <p className="mt-3 break-words text-sm text-error" role="alert">
            {tr('loadFailed')} · {error}
          </p>
        )}
        {!detailScopeMatches && (
          <p className="mt-3 text-sm text-warning-subtle-foreground" role="status">
            {tr('lifecycle.detailScope')}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {details.map((panel) => (
            <Button
              key={panel}
              variant="outline"
              size="sm"
              disabled={!detailScopeMatches || loading}
              onClick={() => onNavigate(panel)}>
              {tr('surface.' + panel)}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => onNavigate('instances')}>
            {tr('surface.instances')}
          </Button>
        </div>
      </SettingGroup>
      {data && (
        <>
          <LifecycleSource title={tr('surface.agents')} source={data.agents}>
            {!data.agents.data?.length && <LifecycleEmpty />}
            {data.agents.data?.map((agent) => (
              <LifecycleRecord key={agent.id} id={agent.id + '@' + agent.version} title={agent.title}>
                <LifecycleField label={tr('lifecycle.definition')}>
                  {agent.id} · {agent.version} · {tr('durable.revision')} {agent.revision}
                </LifecycleField>
                <LifecycleField label={tr('teams.execution.model')}>
                  {agent.provider} / {agent.model}
                </LifecycleField>
                {agent.description && (
                  <LifecycleField label={t('common.description')}>{agent.description}</LifecycleField>
                )}
              </LifecycleRecord>
            ))}
          </LifecycleSource>
          <LifecycleSource title={tr('surface.teams')} source={data.teams}>
            {!teams?.definitions.length && !teams?.bindings.length && !teams?.instances.length && <LifecycleEmpty />}
            {teams?.definitions.map((definition) => (
              <LifecycleRecord
                key={definition.id + definition.version}
                id={definition.id + '@' + definition.version}
                title={definition.title}>
                <LifecycleField label={tr('lifecycle.definition')}>
                  {definition.id} · {definition.version} · {definition.digest}
                </LifecycleField>
                <LifecycleField label={tr('teams.authoring.purpose')}>{definition.purpose}</LifecycleField>
                <LifecycleField label={tr('teams.membersTitle')}>
                  {definition.members.map((member) => member.role).join(', ')}
                </LifecycleField>
              </LifecycleRecord>
            ))}
            {teams?.bindings.map((binding) => (
              <LifecycleRecord
                key={binding.id}
                id={binding.id}
                title={tr('lifecycle.binding') + ' · ' + binding.id}
                status={tr(
                  binding.activationSupported ? 'durable.bindingReady' : 'durable.bindingActivationUnavailable'
                )}>
                <LifecycleField label={tr('durable.revision')}>{binding.revision}</LifecycleField>
                <LifecycleField label={tr('lifecycle.definition')}>
                  {binding.package.id} · {binding.package.version} · {binding.package.digest}
                </LifecycleField>
                <UarLifecycleBindingPosture binding={binding} />
              </LifecycleRecord>
            ))}
            {teams?.instances.map((team) => (
              <LifecycleRecord
                key={team.id}
                id={team.id}
                title={team.id}
                status={tr('teams.teamStatus.' + team.status)}>
                <LifecycleField label={tr('lifecycle.definition')}>
                  <LifecycleReference
                    id={team.definition.id}
                    targetId={team.definition.id + '@' + team.definition.version}
                    exists={definitionIds.has(team.definition.id + '@' + team.definition.version)}
                  />{' '}
                  · {team.definition.version}
                </LifecycleField>
                <LifecycleField label={tr('lifecycle.binding')}>
                  <LifecycleReference id={team.binding.id} exists={bindingIds.has(team.binding.id)} /> ·{' '}
                  {tr('durable.revision')} {team.binding.revision}
                </LifecycleField>
                <LifecycleField label={tr('teams.membersTitle')}>
                  {team.members.map((member) => member.role + ' · ' + member.id).join(', ') || t('common.none')}
                </LifecycleField>
                <div className="sm:col-span-2">
                  <dt className="mb-2 text-muted-foreground">{tr('teams.taskBoardTitle')}</dt>
                  <dd className="space-y-3">
                    {team.tasks.length === 0 && <LifecycleEmpty />}
                    {team.tasks.map((task) => (
                      <LifecycleRecord
                        key={task.id}
                        id={team.id + '/' + task.id}
                        title={task.title}
                        status={tr('teams.taskStatus.' + task.status)}>
                        <LifecycleField label={tr('teams.dependencies')}>
                          {task.dependsOn.length
                            ? task.dependsOn.map((id) => (
                                <span className="me-2" key={id}>
                                  <LifecycleReference
                                    id={id}
                                    targetId={team.id + '/' + id}
                                    exists={team.tasks.some((item) => item.id === id)}
                                  />
                                </span>
                              ))
                            : t('common.none')}
                        </LifecycleField>
                        <LifecycleField label={tr('teams.assignee')}>
                          {task.assigneeMemberId ?? t('common.none')} · {task.role}
                        </LifecycleField>
                        {task.stateReason && (
                          <LifecycleField label={tr('durable.lastError')}>{task.stateReason}</LifecycleField>
                        )}
                      </LifecycleRecord>
                    ))}
                  </dd>
                </div>
              </LifecycleRecord>
            ))}
          </LifecycleSource>
          <UarLifecycleDurable data={data} definitionIds={definitionIds} bindingIds={bindingIds} />
          <UarLifecycleExecutions snapshot={data} />
          <UarLifecycleWorkflows data={data} bindingIds={bindingIds} />
          <LifecycleSource title={tr('surface.approvals')} source={data.approvals}>
            {!data.approvals.data?.length && <LifecycleEmpty />}
            {data.approvals.data?.map((approval) => (
              <LifecycleRecord
                key={approval.admissionId}
                id={approval.admissionId}
                title={approval.toolName}
                status={tr('approvals.state.' + approval.state)}>
                <LifecycleField label={tr('lifecycle.run')}>{approval.executingRunId}</LifecycleField>
                <LifecycleField label={tr('approvals.owner')}>{approval.ownerSessionId}</LifecycleField>
                {['interrupted', 'outcome-unknown'].includes(approval.state) && (
                  <LifecycleField label={tr('durable.recoveryGuidance')}>
                    {tr('approvals.interruptedAction')}
                  </LifecycleField>
                )}
              </LifecycleRecord>
            ))}
          </LifecycleSource>
          <LifecycleSource title={tr('teams.execution.ownerTitle')} source={data.ownership}>
            {data.ownership.data && (
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <LifecycleField label={tr('lifecycle.service')}>
                  {data.ownership.data.currentFence.serviceInstanceId}
                </LifecycleField>
                <LifecycleField label={tr('durable.epoch')}>{data.ownership.data.currentFence.epoch}</LifecycleField>
                <LifecycleField label={tr('teams.execution.ownerStateLabel')}>
                  {data.ownership.data.claim
                    ? tr('teams.execution.ownerState.' + data.ownership.data.claim.state)
                    : t('common.none')}
                </LifecycleField>
              </dl>
            )}
          </LifecycleSource>
        </>
      )}
    </div>
  )
}
