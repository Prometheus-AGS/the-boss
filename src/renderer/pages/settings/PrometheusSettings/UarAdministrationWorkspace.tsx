import { useNavigate, useSearch } from '@tanstack/react-router'
import { CircleSlash2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton
} from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { useQuery } from '@renderer/data/hooks/useDataApi'
import { ipcApi } from '@renderer/ipc'
import { getSettingDomId } from '@renderer/pages/settings/settingsSearch/types'
import type { UarAdministrationSnapshot } from '@shared/types/prometheusIntegration'
import type { UarInstanceInventorySnapshot } from '@shared/types/uarServiceInstance'

import { CapabilitySurface, MethodCoverage } from './UarAdministrationCoverage'
import { UarAgentsPanel } from './UarAgentsPanel'
import { UarApprovalLifecyclePanel } from './UarApprovalLifecyclePanel'
import { UarCompilerPanel } from './UarCompilerPanel'
import { UarConnectorAdministrationPanel } from './UarConnectorAdministrationPanel'
import { UarDurableInstancesPanel } from './UarDurableInstancesPanel'
import { UarFeedbackGovernancePanel } from './UarFeedbackGovernancePanel'
import { UarInstancesPanel } from './UarInstancesPanel'
import { UarLifecyclePanel } from './UarLifecyclePanel'
import { UarObserversPanel } from './UarObserversPanel'
import { UarOperationalPanel } from './UarOperationalPanel'
import { UarRepresentationAdministrationPanel } from './UarRepresentationAdministrationPanel'
import { UarPresentationsPanel } from './UarPresentationsPanel'
import { UarProvidersModelsPanel } from './UarProvidersModelsPanel'
import { UarRuntimeSettingsPanel } from './UarRuntimeSettingsPanel'
import { UarSkillsPanel } from './UarSkillsPanel'
import { UarTeamsPanel } from './UarTeamsPanel'

const GROUPS = ['runtime', 'agents', 'experience', 'administration'] as const

type SurfaceProjection = UarAdministrationSnapshot['surfaces'][number]
type NavigationSurface = Pick<SurfaceProjection, 'id' | 'group'> & {
  availability?: SurfaceProjection['availability']
}
const EMPTY_SURFACES: UarAdministrationSnapshot['surfaces'] = []
const BOSS_DURABLE_SURFACES: NavigationSurface[] = [
  { id: 'lifecycle', group: 'agents' },
  { id: 'teams', group: 'agents' },
  { id: 'durable-agent-instances', group: 'agents' },
  { id: 'local-scoped-observers', group: 'agents' },
  { id: 'connectors', group: 'administration' },
  { id: 'feedback-governance', group: 'administration' },
  { id: 'representation', group: 'administration' }
]
const HOST_INSTANCE_SURFACE: SurfaceProjection = {
  id: 'instances',
  group: 'runtime',
  availability: 'host_controlled',
  methods: []
}

function navText(translate: ReturnType<typeof useTranslation>['t'], key: string) {
  return translate('settings.prometheus.integration.uarAdmin.' + key)
}

function LoadingWorkspace() {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]" aria-busy="true">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

export function UarAdministrationWorkspace({ overview, onReady }: { overview: ReactNode; onReady?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/settings/uar' })
  const search = useSearch({ from: '/settings/uar' })
  const [snapshot, setSnapshot] = useState<UarAdministrationSnapshot>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [inventory, setInventory] = useState<UarInstanceInventorySnapshot>()
  const [inventoryError, setInventoryError] = useState<string>()
  const {
    data: workspaces,
    error: workspaceError,
    isLoading: workspacesLoading,
    refetch: refetchWorkspaces
  } = useQuery('/agent-workspaces')
  const onReadyRef = useRef(onReady)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.admin.snapshot', {}))
      onReadyRef.current?.()
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadInventory = useCallback(async () => {
    setInventoryError(undefined)
    try {
      setInventory(await ipcApi.request('prometheus.uar.instances.read', {}))
    } catch (cause) {
      setInventoryError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const advertisedSurfaces = snapshot?.surfaces ?? EMPTY_SURFACES
  const surfaces = useMemo(
    () =>
      advertisedSurfaces.some((surface) => surface.id === HOST_INSTANCE_SURFACE.id)
        ? advertisedSurfaces
        : [HOST_INSTANCE_SURFACE, ...advertisedSurfaces],
    [advertisedSurfaces]
  )
  const navigationSurfaces = useMemo(
    () => [...surfaces, ...BOSS_DURABLE_SURFACES.filter((item) => !surfaces.some((surface) => surface.id === item.id))],
    [surfaces]
  )
  const userWorkspaces = workspaces?.filter((workspace) => workspace.type === 'user') ?? []
  const selectedWorkspaceId = userWorkspaces.some((workspace) => workspace.id === search.adminWorkspaceId)
    ? search.adminWorkspaceId
    : undefined
  const administrationInstanceId = search.adminInstanceId ?? inventory?.selectedInstanceId
  const administrationInstance = inventory?.instances.find((instance) => instance.id === administrationInstanceId)
  const detailScopeMatches = Boolean(inventory && administrationInstanceId === inventory.selectedInstanceId)
  const requestedPanel = typeof search.panel === 'string' ? search.panel : undefined
  const selectedId = navigationSurfaces.some((surface) => surface.id === requestedPanel) ? requestedPanel! : 'overview'
  const selected = surfaces.find((surface) => surface.id === selectedId)
  useEffect(() => {
    if (['lifecycle', 'local-scoped-observers', 'connectors', 'feedback-governance', 'representation'].includes(selectedId)) void refetchWorkspaces()
    void loadInventory()
  }, [selectedId, refetchWorkspaces, loadInventory])
  useEffect(() => {
    if (selectedId === 'lifecycle' && !search.adminInstanceId && inventory?.selectedInstanceId) {
      void navigate({
        search: (previous) => ({ ...previous, adminInstanceId: inventory.selectedInstanceId }),
        replace: true
      })
    }
  }, [selectedId, search.adminInstanceId, inventory?.selectedInstanceId, navigate])
  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        surfaces: navigationSurfaces.filter((surface) => surface.group === group && surface.id !== 'overview')
      })),
    [navigationSurfaces]
  )
  const selectSurface = (panel: string) => {
    void navigate({ search: (previous) => ({ ...previous, panel }), replace: false })
  }

  if (loading && selectedId !== 'lifecycle') return <LoadingWorkspace />
  if ((error || !snapshot) && selectedId === 'overview') {
    return (
      <div className="space-y-5">
        <SettingGroup>
          <SettingTitle>{navText(t, 'loadFailed')}</SettingTitle>
          <SettingDescription>{error ?? navText(t, 'loadFailedDescription')}</SettingDescription>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" />
            {navText(t, 'retry')}
          </Button>
        </SettingGroup>
        <Button variant="outline" size="sm" onClick={() => selectSurface('lifecycle')}>
          {navText(t, 'surface.lifecycle')}
        </Button>
        <UarInstancesPanel />
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {search.adminInstanceId && selectedId !== 'lifecycle' && selectedId !== 'instances' && (
        <p
          className="mb-4 rounded-md border border-warning-border bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"
          role="status">
          {navText(t, 'lifecycle.detailScope')}
        </p>
      )}
      <div className="mb-4 lg:hidden">
        <Select value={selectedId} onValueChange={selectSurface}>
          <SelectTrigger aria-label={navText(t, 'destination')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overview">{navText(t, 'surface.overview')}</SelectItem>
            {grouped.flatMap(({ group, surfaces: groupSurfaces }) =>
              groupSurfaces.map((surface) => (
                <SelectItem key={surface.id} value={surface.id}>
                  {navText(t, `group.${group}`)} · {navText(t, `surface.${surface.id}`)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="hidden min-w-0 border-r border-border pr-3 lg:block" aria-label={navText(t, 'destination')}>
          <button
            type="button"
            aria-current={selectedId === 'overview' ? 'page' : undefined}
            onClick={() => selectSurface('overview')}
            className={`mb-4 flex min-h-9 w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              selectedId === 'overview'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}>
            {navText(t, 'surface.overview')}
          </button>
          {grouped.map(({ group, surfaces: groupSurfaces }) => (
            <div key={group} className="mb-5 last:mb-0">
              <div className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">
                {navText(t, `group.${group}`)}
              </div>
              <div className="space-y-0.5">
                {groupSurfaces.map((surface) => {
                  const active = surface.id === selectedId
                  return (
                    <button
                      key={surface.id}
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => selectSurface(surface.id)}
                      className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        active
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      }`}>
                      <span className="min-w-0 truncate">{navText(t, `surface.${surface.id}`)}</span>
                      {surface.availability && surface.availability !== 'available' && (
                        <CircleSlash2 size={14} className="shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <section className="min-w-0" aria-live="polite">
          {selectedId === 'overview' ? (
            <>
              {overview}
              {selected && <CapabilitySurface surface={selected} />}
            </>
          ) : search.adminInstanceId &&
            !detailScopeMatches &&
            selectedId !== 'instances' &&
            selectedId !== 'lifecycle' ? (
            <SettingGroup>
              <SettingTitle>{navText(t, 'lifecycle.detailBlocked')}</SettingTitle>
              <SettingDescription>{navText(t, 'lifecycle.detailScope')}</SettingDescription>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => selectSurface('lifecycle')}>
                {navText(t, 'surface.lifecycle')}
              </Button>
            </SettingGroup>
          ) : selectedId === 'runtime-settings' ? (
            <UarRuntimeSettingsPanel />
          ) : selectedId === 'instances' ? (
            <UarInstancesPanel />
          ) : selectedId === 'providers-models' ? (
            <UarProvidersModelsPanel />
          ) : selectedId === 'agents' ? (
            <UarAgentsPanel />
          ) : selectedId === 'compiler' ? (
            <UarCompilerPanel />
          ) : selectedId === 'skills' ? (
            <UarSkillsPanel />
          ) : selectedId === 'presentations' ? (
            <UarPresentationsPanel />
          ) : selectedId === 'approvals' ? (
            <UarApprovalLifecyclePanel />
          ) : ['lifecycle', 'teams', 'durable-agent-instances', 'local-scoped-observers', 'connectors', 'feedback-governance', 'representation'].includes(selectedId) ? (
            <div id={getSettingDomId('/settings/uar', selectedId)} className="scroll-mt-6">
              <SettingGroup className="mb-4">
                <SettingTitle>{navText(t, 'durable.workspaceTitle')}</SettingTitle>
                <SettingDescription>{navText(t, 'durable.workspaceDescription')}</SettingDescription>
                {selectedId === 'lifecycle' && (
                  <div className="mt-4">
                    <label htmlFor="uar-administration-instance" className="mb-1.5 block text-sm font-medium">
                      {navText(t, 'lifecycle.service')}
                    </label>
                    <Select
                      value={administrationInstance?.id}
                      onValueChange={(adminInstanceId) => {
                        void navigate({ search: (previous) => ({ ...previous, adminInstanceId }), replace: false })
                      }}>
                      <SelectTrigger id="uar-administration-instance" data-ui="uar-administration-instance">
                        <SelectValue placeholder={navText(t, 'lifecycle.chooseService')} />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory?.instances.map((instance) => (
                          <SelectItem key={instance.id} value={instance.id} disabled={!instance.enabled}>
                            {instance.name} · {instance.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs text-muted-foreground">{navText(t, 'lifecycle.selectionHelp')}</p>
                    {inventoryError && (
                      <p className="mt-2 break-words text-sm text-error" role="alert">
                        {inventoryError}
                      </p>
                    )}
                    {search.adminInstanceId && !administrationInstance && inventory && (
                      <p className="mt-2 text-sm text-warning-subtle-foreground" role="status">
                        {navText(t, 'lifecycle.missingService')}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => void loadInventory()}>
                        {t('common.refresh')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => selectSurface('instances')}>
                        {navText(t, 'surface.instances')}
                      </Button>
                    </div>
                  </div>
                )}
                <Select
                  value={selectedWorkspaceId}
                  onValueChange={(adminWorkspaceId) => {
                    void navigate({ search: (previous) => ({ ...previous, adminWorkspaceId }), replace: false })
                  }}
                  disabled={workspacesLoading}>
                  <SelectTrigger
                    data-ui="uar-teams-workspace"
                    className="mt-4"
                    aria-label={navText(t, 'durable.workspaceTitle')}>
                    <SelectValue placeholder={navText(t, 'durable.workspacePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {userWorkspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id} data-workspace-id={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {workspaceError && (
                  <div className="mt-3 text-sm text-error" role="alert">
                    {workspaceError.message}
                    <Button variant="outline" size="sm" className="ml-2" onClick={() => void refetchWorkspaces()}>
                      {navText(t, 'retry')}
                    </Button>
                  </div>
                )}
                {!workspacesLoading && !workspaceError && userWorkspaces.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">{navText(t, 'durable.noWorkspaces')}</p>
                )}
                {workspacesLoading && (
                  <p className="mt-3 text-sm text-muted-foreground" role="status">
                    {t('common.loading')}
                  </p>
                )}
              </SettingGroup>
              {selectedWorkspaceId &&
                (selectedId === 'representation' ? (
                  <UarRepresentationAdministrationPanel key={selectedWorkspaceId} workspaceId={selectedWorkspaceId} />
                ) : selectedId === 'lifecycle' ? (
                  administrationInstance?.enabled && (
                    <UarLifecyclePanel
                      key={selectedWorkspaceId + ':' + administrationInstance.id}
                      workspaceId={selectedWorkspaceId}
                      serviceInstanceId={administrationInstance.id}
                      detailScopeMatches={detailScopeMatches}
                      onNavigate={selectSurface}
                    />
                  )
                ) : selectedId === 'teams' ? (
                  <UarTeamsPanel key={selectedWorkspaceId} workspaceId={selectedWorkspaceId} />
                ) : selectedId === 'feedback-governance' ? (
                  <UarFeedbackGovernancePanel key={selectedWorkspaceId} workspaceId={selectedWorkspaceId} />
                ) : selectedId === 'connectors' ? (
                  <UarConnectorAdministrationPanel key={selectedWorkspaceId} workspaceId={selectedWorkspaceId} />
                ) : selectedId === 'durable-agent-instances' ? (
                  <UarDurableInstancesPanel key={selectedWorkspaceId} workspaceId={selectedWorkspaceId} />
                ) : (
                  <UarObserversPanel key={selectedWorkspaceId} workspaceId={selectedWorkspaceId} />
                ))}
              {selected && selectedId !== 'lifecycle' && <MethodCoverage surface={selected} />}
            </div>
          ) : ['runs', 'knowledge', 'tools', 'security', 'protocols'].includes(selectedId) ? (
            <>
              <UarOperationalPanel surface={selectedId as 'runs' | 'knowledge' | 'tools' | 'security' | 'protocols'} />
              {selected && <MethodCoverage surface={selected} />}
            </>
          ) : selected ? (
            <CapabilitySurface surface={selected} />
          ) : (
            <LoadingWorkspace />
          )}
        </section>
      </div>
      {selectedId !== 'lifecycle' && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {navText(t, 'runtimeVersion')} {snapshot?.uarVersion ?? navText(t, 'durable.unknown')}
        </div>
      )}
    </div>
  )
}
