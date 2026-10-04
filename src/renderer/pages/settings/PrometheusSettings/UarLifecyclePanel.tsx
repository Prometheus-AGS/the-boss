import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarDurableWorkspaceSnapshot } from '@shared/types/uarDurableAdministration'
import type { UarTeamsSnapshot } from '@shared/types/uarTeams'
import type { UarWorkflowsSnapshot } from '@shared/types/uarWorkflows'

type LifecycleData = {
  durable: UarDurableWorkspaceSnapshot
  teams: UarTeamsSnapshot
  workflows: UarWorkflowsSnapshot
}

export function UarLifecyclePanel({
  workspaceId,
  onNavigate
}: {
  workspaceId: string
  onNavigate: (panel: string) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string, options?: Record<string, unknown>) =>
    t(`settings.prometheus.integration.uarAdmin.lifecycle.${key}`, options)
  const [data, setData] = useState<LifecycleData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [durable, teams, workflows] = await Promise.all([
        ipcApi.request('prometheus.uar.durable.read', { workspaceId }),
        ipcApi.request('prometheus.uar.teams.snapshot', { workspaceId }),
        ipcApi.request('prometheus.uar.workflows.snapshot', { workspaceId })
      ])
      setData({ durable, teams, workflows })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const stages = data && [
    { key: 'definition', count: data.teams.definitions.length, panel: 'teams' },
    {
      key: 'binding',
      count: data.teams.bindings.length + data.durable.bindings.length,
      panel: 'durable-agent-instances'
    },
    {
      key: 'instance',
      count: data.durable.capabilities.instances ? data.durable.instances.length : null,
      panel: 'durable-agent-instances'
    },
    {
      key: 'activation',
      count: data.durable.capabilities.instances
        ? data.durable.instances.filter((item) => item.lifecycle === 'active').length
        : null,
      panel: 'durable-agent-instances'
    },
    {
      key: 'run',
      count: data.durable.capabilities.instances
        ? data.durable.instances.filter((item) => item.activeRunId !== null).length
        : null,
      panel: 'durable-agent-instances'
    },
    { key: 'team', count: data.teams.instances.length, panel: 'teams' },
    { key: 'workflow', count: data.workflows.available ? data.workflows.runs.length : null, panel: 'teams' }
  ]

  return (
    <SettingGroup>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SettingTitle>{tr('title')}</SettingTitle>
          <SettingDescription>{tr('description')}</SettingDescription>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
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
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {stages && (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={tr('title')}>
          {stages.map((stage, index) => (
            <li key={stage.key} className="min-w-0 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {index + 1} · {tr(stage.key)}
                </span>
                <Badge variant="secondary">
                  {stage.count ?? t('settings.prometheus.integration.uarAdmin.durable.unknown')}
                </Badge>
              </div>
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto max-w-full p-0 text-left"
                onClick={() => onNavigate(stage.panel)}>
                {tr('open', { destination: t(`settings.prometheus.integration.uarAdmin.surface.${stage.panel}`) })}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {data && (
        <p className="mt-3 text-xs text-muted-foreground">
          {tr('scope')} · {workspaceId} · {tr('runNote')}
        </p>
      )}
    </SettingGroup>
  )
}
