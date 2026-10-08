import { Folder, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import { WorkspaceSelector } from '@renderer/components/resourceCatalog/selectors'
import { UarTeamApprovals } from '@renderer/components/uarTeams/UarTeamApprovals'
import { UarTeamExecutionPanel } from '@renderer/components/uarTeams/UarTeamExecutionPanel'
import { UarTeamPeerMessages } from '@renderer/components/uarTeams/UarTeamPeerMessages'
import { UarTeamTaskBoard } from '@renderer/components/uarTeams/UarTeamTaskBoard'
import { useDataChange, useQuery } from '@renderer/data/hooks/useDataApi'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamsSnapshot } from '@shared/types/uarTeams'

import { TeamWorkLaunch } from './TeamWorkLaunch'

interface Props {
  workspaceId?: string
  teamInstanceId?: string
  onSelectionChange: (workspaceId: string | undefined, teamInstanceId?: string) => void
}

export function TeamsWorkPage({ workspaceId, teamInstanceId, onSelectionChange }: Props) {
  const { t } = useTranslation()
  const {
    data: workspaces,
    error: workspaceError,
    isLoading: workspacesLoading,
    refetch
  } = useQuery('/agent-workspaces')
  useDataChange('/agent-workspaces', () => void refetch())
  const workspace = workspaces?.find((item) => item.id === workspaceId && item.type === 'user')
  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4" data-ui="teams-work" data-workspace-id={workspace?.id}>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header>
          <h1 className="text-lg font-semibold">{t('work.teams.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('work.teams.description')}</p>
        </header>
        <section className="space-y-2" aria-label={t('work.teams.workspace')}>
          <WorkspaceSelector
            value={workspace?.id}
            disabled={workspacesLoading}
            onChange={(id) => onSelectionChange(id ?? undefined)}
            trigger={
              <Button variant="outline" data-ui="teams-workspace" aria-label={t('work.teams.workspace')}>
                <Folder size={16} aria-hidden="true" />
                {workspace?.name ?? t('work.teams.chooseWorkspace')}
              </Button>
            }
          />
          {workspace && <p className="break-all text-xs text-muted-foreground">{workspace.path}</p>}
          {workspacesLoading && <p role="status">{t('common.loading')}</p>}
          {workspaceError && (
            <div role="alert" className="text-sm text-error">
              {workspaceError.message}
              <Button variant="outline" size="sm" className="ms-2" onClick={() => void refetch()}>
                {t('common.refresh')}
              </Button>
            </div>
          )}
          {!workspace && !workspacesLoading && (
            <p className="text-sm text-muted-foreground">{t('work.teams.workspaceRequired')}</p>
          )}
        </section>
        {workspace && (
          <TeamWorkspace
            key={workspace.id}
            workspaceId={workspace.id}
            teamInstanceId={teamInstanceId}
            onInstanceChange={(id) => onSelectionChange(workspace.id, id)}
          />
        )}
      </div>
    </main>
  )
}

function TeamWorkspace({
  workspaceId,
  teamInstanceId,
  onInstanceChange
}: {
  workspaceId: string
  teamInstanceId?: string
  onInstanceChange: (id: string) => void
}) {
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState<UarTeamsSnapshot>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.teams.snapshot', { workspaceId }))
      setError(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const instance = snapshot?.instances.find((item) => item.id === teamInstanceId)
  return (
    <div className="space-y-6" data-ui="teams-workspace-content" data-profile-stage={snapshot?.executionProfileStage}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden="true" />
          {t('common.refresh')}
        </Button>
        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            {t('common.loading')}
          </p>
        )}
        {error && (
          <p className="break-words text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {snapshot && (
        <>
          {!snapshot.capabilities.execution && (
            <p className="text-sm text-warning-subtle-foreground" role="status" data-ui="teams-unavailable">
              {t('settings.prometheus.integration.uarAdmin.teams.execution.unavailable')}
              {snapshot.unavailableReason ? ' · ' + snapshot.unavailableReason : ''}
            </p>
          )}
          <TeamWorkLaunch
            workspaceId={workspaceId}
            snapshot={snapshot}
            onCreated={onInstanceChange}
            onChanged={refresh}
          />
          <section className="space-y-2" aria-label={t('work.teams.reopen')}>
            <h2 className="text-sm font-medium">{t('work.teams.reopen')}</h2>
            <p className="text-xs text-muted-foreground">{t('work.teams.reopenHelp')}</p>
            <Select
              value={instance?.id ?? ''}
              onValueChange={onInstanceChange}
              disabled={snapshot.instances.length === 0}>
              <SelectTrigger data-ui="teams-instance" aria-label={t('work.teams.reopen')}>
                <SelectValue placeholder={t('settings.prometheus.integration.uarAdmin.teams.chooseInstance')} />
              </SelectTrigger>
              <SelectContent>
                {snapshot.instances.map((item) => (
                  <SelectItem key={item.id} value={item.id} data-team-id={item.id}>
                    {snapshot.definitions.find((definition) => definition.id === item.definition.id)?.title ??
                      item.definition.id}
                    {' · '}
                    {item.tasks[0]?.title ?? item.id}
                    {' · '}
                    {t('settings.prometheus.integration.uarAdmin.teams.teamStatus.' + item.status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {snapshot.instances.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('settings.prometheus.integration.uarAdmin.teams.noInstances')}
              </p>
            )}
            {teamInstanceId && !instance && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('work.teams.runUnavailable')}
              </p>
            )}
          </section>
          {instance && (
            <div
              className="space-y-6"
              data-ui="teams-run"
              data-team-id={instance.id}
              data-definition-digest={instance.definition.digest}
              data-package-digest={instance.package.digest}>
              <section
                data-ui="teams-members"
                aria-label={t('settings.prometheus.integration.uarAdmin.teams.membersTitle')}>
                <h2 className="text-sm font-medium">
                  {t('settings.prometheus.integration.uarAdmin.teams.membersTitle')}
                </h2>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {instance.definition.id} · {instance.definition.version} · {instance.definition.digest}
                </p>
                <ul className="mt-3 flex flex-wrap gap-3">
                  {instance.members.map((member) => (
                    <li
                      key={member.id}
                      className="min-w-0 space-y-1 rounded-md border border-border px-3 py-2"
                      data-member-id={member.id}
                      data-role={member.role}>
                      <p className="text-sm font-medium">
                        {member.role} · {member.ordinal}
                      </p>
                      <Badge variant="outline">
                        {t('settings.prometheus.integration.uarAdmin.teams.teamStatus.' + member.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
              <UarTeamApprovals
                key={instance.id + ':approvals'}
                workspaceId={workspaceId}
                teamInstanceId={instance.id}
                available={snapshot.capabilities.approvals}
              />
              <UarTeamTaskBoard
                workspaceId={workspaceId}
                instance={instance}
                ownership={snapshot.capabilities.ownership}
                onChanged={refresh}
              />
              <UarTeamExecutionPanel
                key={instance.id}
                workspaceId={workspaceId}
                instance={instance}
                available={snapshot.capabilities.execution}
                cooperation={Boolean(snapshot.capabilities.cooperation)}
                onChanged={refresh}
              />
              <UarTeamPeerMessages
                key={instance.id + ':peers'}
                workspaceId={workspaceId}
                instance={instance}
                available={Boolean(snapshot.capabilities.cooperation)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
