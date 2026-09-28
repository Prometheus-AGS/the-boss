import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import { UAR_EXECUTION_PROFILE, type UarInstanceInventorySnapshot } from '@shared/types/uarServiceInstance'

import { IntegrationChoice, IntegrationField, IntegrationToggle } from './IntegrationFields'

type Draft = {
  id: string
  name: string
  enabled: boolean
  expectedRuntimeId: string
  profile: string
  minimumVersion: string
  workspaceLocation: 'local' | 'remote'
  workspaceRoots: string
  requiredCapabilities: string
  runtime: string
  administration: string
  models: string
  console: string
  runtimeCredential: string
  adminCredential: string
}

const emptyDraft = (): Draft => ({
  id: '',
  name: '',
  enabled: true,
  expectedRuntimeId: '',
  profile: UAR_EXECUTION_PROFILE,
  minimumVersion: '',
  workspaceLocation: 'local',
  workspaceRoots: '',
  requiredCapabilities: '',
  runtime: '',
  administration: '',
  models: '',
  console: '',
  runtimeCredential: '',
  adminCredential: ''
})

const INSTANCE_TRANSLATION_KEYS = {
  addDescription: 'settings.prometheus.integration.uarAdmin.instances.addDescription',
  addTitle: 'settings.prometheus.integration.uarAdmin.instances.addTitle',
  capabilities: 'settings.prometheus.integration.uarAdmin.instances.capabilities',
  'check.authenticated': 'settings.prometheus.integration.uarAdmin.instances.check.authenticated',
  'check.compatible': 'settings.prometheus.integration.uarAdmin.instances.check.compatible',
  'check.configured': 'settings.prometheus.integration.uarAdmin.instances.check.configured',
  'check.operational': 'settings.prometheus.integration.uarAdmin.instances.check.operational',
  'check.reachable': 'settings.prometheus.integration.uarAdmin.instances.check.reachable',
  checks: 'settings.prometheus.integration.uarAdmin.instances.checks',
  'compatibility.configured': 'settings.prometheus.integration.uarAdmin.instances.compatibility.configured',
  'compatibility.incompatible': 'settings.prometheus.integration.uarAdmin.instances.compatibility.incompatible',
  'compatibility.operational': 'settings.prometheus.integration.uarAdmin.instances.compatibility.operational',
  'compatibility.unauthenticated': 'settings.prometheus.integration.uarAdmin.instances.compatibility.unauthenticated',
  'compatibility.unreachable': 'settings.prometheus.integration.uarAdmin.instances.compatibility.unreachable',
  configured: 'settings.prometheus.integration.uarAdmin.instances.configured',
  credential: 'settings.prometheus.integration.uarAdmin.instances.credential',
  credentialHelp: 'settings.prometheus.integration.uarAdmin.instances.credentialHelp',
  defaultChanged: 'settings.prometheus.integration.uarAdmin.instances.defaultChanged',
  description: 'settings.prometheus.integration.uarAdmin.instances.description',
  'endpoint.administration': 'settings.prometheus.integration.uarAdmin.instances.endpoint.administration',
  'endpoint.console': 'settings.prometheus.integration.uarAdmin.instances.endpoint.console',
  'endpoint.models': 'settings.prometheus.integration.uarAdmin.instances.endpoint.models',
  'endpoint.runtime': 'settings.prometheus.integration.uarAdmin.instances.endpoint.runtime',
  id: 'settings.prometheus.integration.uarAdmin.instances.id',
  local: 'settings.prometheus.integration.uarAdmin.instances.local',
  makeDefault: 'settings.prometheus.integration.uarAdmin.instances.makeDefault',
  minimumVersion: 'settings.prometheus.integration.uarAdmin.instances.minimumVersion',
  missing: 'settings.prometheus.integration.uarAdmin.instances.missing',
  observed: 'settings.prometheus.integration.uarAdmin.instances.observed',
  'ownership.external': 'settings.prometheus.integration.uarAdmin.instances.ownership.external',
  'ownership.managed': 'settings.prometheus.integration.uarAdmin.instances.ownership.managed',
  profile: 'settings.prometheus.integration.uarAdmin.instances.profile',
  remote: 'settings.prometheus.integration.uarAdmin.instances.remote',
  runtimeId: 'settings.prometheus.integration.uarAdmin.instances.runtimeId',
  selected: 'settings.prometheus.integration.uarAdmin.instances.selected',
  sessions: 'settings.prometheus.integration.uarAdmin.instances.sessions',
  test: 'settings.prometheus.integration.uarAdmin.instances.test',
  testSucceeded: 'settings.prometheus.integration.uarAdmin.instances.testSucceeded',
  title: 'settings.prometheus.integration.uarAdmin.instances.title',
  workspace: 'settings.prometheus.integration.uarAdmin.instances.workspace',
  workspaceRoots: 'settings.prometheus.integration.uarAdmin.instances.workspaceRoots'
} as const

type InstanceTranslationKey = keyof typeof INSTANCE_TRANSLATION_KEYS

export function UarInstancesPanel() {
  const { t } = useTranslation()
  const tr = (key: InstanceTranslationKey, options?: Record<string, unknown>) =>
    t(INSTANCE_TRANSLATION_KEYS[key], options)
  const [snapshot, setSnapshot] = useState<UarInstanceInventorySnapshot>()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()

  const load = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.instances.read', {}))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  const act = async (action: 'select' | 'test' | 'delete', instanceId: string) => {
    if (!snapshot) return
    setBusy(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const next =
        action === 'test'
          ? await ipcApi.request('prometheus.uar.instances.test', { instanceId })
          : action === 'select'
            ? await ipcApi.request('prometheus.uar.instances.select', {
                expectedRevision: snapshot.revision,
                instanceId
              })
            : await ipcApi.request('prometheus.uar.instances.delete', {
                expectedRevision: snapshot.revision,
                instanceId
              })
      setSnapshot(next)
      setStatus(
        action === 'test'
          ? tr('testSucceeded')
          : action === 'select'
            ? tr('defaultChanged')
            : t('common.delete_success')
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!snapshot) return
    setBusy(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const id = draft.id.trim()
      const next = await ipcApi.request('prometheus.uar.instances.save', {
        expectedRevision: snapshot.revision,
        instance: {
          id,
          name: draft.name.trim(),
          enabled: draft.enabled,
          ownership: 'external',
          expectedRuntimeId: draft.expectedRuntimeId.trim(),
          profile: draft.profile.trim(),
          minimumVersion: draft.minimumVersion.trim(),
          workspaceLocation: draft.workspaceLocation,
          workspaceRoots: draft.workspaceRoots
            .split(/\r?\n|,/)
            .map((value) => value.trim())
            .filter(Boolean),
          requiredCapabilities: draft.requiredCapabilities
            .split(/\r?\n|,/)
            .map((value) => value.trim())
            .filter(Boolean),
          endpoints: {
            runtime: draft.runtime.trim(),
            administration: draft.administration.trim(),
            models: draft.models.trim(),
            console: draft.console.trim() || null
          },
          runtimeCredentialRef: `uar-instance://${id}`,
          adminCredentialRef: `uar-instance://${id}/admin`
        },
        runtimeCredential: draft.runtimeCredential
          ? { operation: 'set', value: draft.runtimeCredential }
          : { operation: 'unchanged' },
        adminCredential: draft.adminCredential
          ? { operation: 'set', value: draft.adminCredential }
          : { operation: 'unchanged' }
      })
      setSnapshot(next)
      setDraft(emptyDraft())
      setEditingId(undefined)
      setStatus(t('common.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const edit = (instance: UarInstanceInventorySnapshot['instances'][number]) => {
    setEditingId(instance.id)
    setDraft({
      id: instance.id,
      name: instance.name,
      enabled: instance.enabled,
      expectedRuntimeId: instance.expectedRuntimeId,
      profile: instance.profile,
      minimumVersion: instance.minimumVersion,
      workspaceLocation: instance.workspaceLocation,
      workspaceRoots: instance.workspaceRoots.join('\n'),
      requiredCapabilities: instance.requiredCapabilities.join(', '),
      runtime: instance.endpoints.runtime,
      administration: instance.endpoints.administration,
      models: instance.endpoints.models,
      console: instance.endpoints.console ?? '',
      runtimeCredential: '',
      adminCredential: ''
    })
    setError(undefined)
    setStatus(undefined)
  }

  return (
    <div className="space-y-5">
      <SettingGroup>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SettingTitle>{tr('title')}</SettingTitle>
            <SettingDescription>{tr('description')}</SettingDescription>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {snapshot?.instances.map((instance) => (
            <div key={instance.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {instance.name}
                    <Badge variant="outline">{tr(`ownership.${instance.ownership}`)}</Badge>
                    {instance.selected && <Badge variant="secondary">{tr('selected')}</Badge>}
                  </div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">{instance.id}</div>
                </div>
                <Badge variant={instance.compatibility === 'operational' ? 'secondary' : 'outline'}>
                  {tr(`compatibility.${instance.compatibility}`)}
                </Badge>
              </div>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{tr('profile')}</dt>
                  <dd>{instance.profile}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tr('workspace')}</dt>
                  <dd>{instance.workspaceLocation}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tr('sessions')}</dt>
                  <dd>{instance.boundSessions}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tr('credential')}</dt>
                  <dd>
                    {tr('endpoint.runtime')}: {instance.runtimeCredentialConfigured ? tr('configured') : tr('missing')}
                    {' · '}
                    {tr('endpoint.administration')}:{' '}
                    {instance.adminCredentialConfigured ? tr('configured') : tr('missing')}
                  </dd>
                </div>
              </dl>
              {Object.entries(instance.endpoints).map(([role, endpoint]) => (
                <div key={role} className="mt-2 break-all text-xs">
                  <span className="text-muted-foreground">{role}: </span>
                  {endpoint ?? '—'}
                </div>
              ))}
              <div className="mt-3 flex flex-wrap gap-2" aria-label={tr('checks')}>
                {Object.entries(instance.checks).map(([check, result]) => (
                  <Badge
                    key={check}
                    variant="outline"
                    className={
                      result === true ? 'text-success' : result === false ? 'text-error' : 'text-muted-foreground'
                    }>
                    {result === true ? '✓' : result === false ? '×' : '—'} {tr(`check.${check}`)}
                  </Badge>
                ))}
              </div>
              {instance.observed && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div>{tr('observed', { id: instance.observed.id, version: instance.observed.version })}</div>
                  <div>
                    {instance.observed.profile} · {instance.observed.workspaceLocation} · {instance.observed.ownership}
                  </div>
                  <div className="break-words">
                    {tr('capabilities')}: {instance.observed.capabilities.join(', ') || '—'}
                  </div>
                  <div className="break-all">
                    credentialRef={instance.observed.references.credential ?? '—'} · migrate=
                    {String(instance.observed.placement.migrate)}
                  </div>
                </div>
              )}
              {instance.diagnostic && (
                <div className="mt-2 text-sm text-error" role="alert">
                  {instance.diagnostic}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!instance.selected && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !instance.enabled}
                    onClick={() => void act('select', instance.id)}>
                    {tr('makeDefault')}
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('test', instance.id)}>
                  {tr('test')}
                </Button>
                {instance.ownership === 'external' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || instance.boundSessions > 0}
                    onClick={() => edit(instance)}>
                    {t('common.edit')}
                  </Button>
                )}
                {instance.ownership === 'external' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || instance.selected || instance.boundSessions > 0}
                    onClick={() => void act('delete', instance.id)}>
                    {t('common.delete')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {snapshot && (
          <div className="mt-3 text-xs text-muted-foreground">
            migration={String(snapshot.migration.supported)} · {snapshot.migration.reason}
          </div>
        )}
      </SettingGroup>

      <SettingGroup>
        <SettingTitle>{tr('addTitle')}</SettingTitle>
        <SettingDescription>{tr('addDescription')}</SettingDescription>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <IntegrationField
            label={tr('id')}
            value={draft.id}
            onChange={(id) => setDraft({ ...draft, id })}
            disabled={Boolean(editingId)}
          />
          <IntegrationField
            label={t('common.name')}
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
          />
          <IntegrationField
            label={tr('runtimeId')}
            value={draft.expectedRuntimeId}
            onChange={(expectedRuntimeId) => setDraft({ ...draft, expectedRuntimeId })}
          />
          <IntegrationField
            label={tr('profile')}
            value={draft.profile}
            onChange={(profile) => setDraft({ ...draft, profile })}
          />
          <IntegrationField
            label={tr('minimumVersion')}
            value={draft.minimumVersion}
            onChange={(minimumVersion) => setDraft({ ...draft, minimumVersion })}
          />
          <IntegrationChoice
            label={tr('workspace')}
            value={draft.workspaceLocation}
            onChange={(workspaceLocation) => setDraft({ ...draft, workspaceLocation })}
            options={[
              { value: 'local', label: tr('local') },
              { value: 'remote', label: tr('remote') }
            ]}
          />
          <IntegrationField
            label={tr('workspaceRoots')}
            value={draft.workspaceRoots}
            onChange={(workspaceRoots) => setDraft({ ...draft, workspaceRoots })}
          />
          <IntegrationField
            label={tr('capabilities')}
            value={draft.requiredCapabilities}
            onChange={(requiredCapabilities) => setDraft({ ...draft, requiredCapabilities })}
          />
          {(['runtime', 'administration', 'models', 'console'] as const).map((role) => (
            <IntegrationField
              key={role}
              label={tr(`endpoint.${role}`)}
              value={draft[role]}
              onChange={(value) => setDraft({ ...draft, [role]: value })}
            />
          ))}
          <IntegrationField
            label={`${tr('credential')} · ${tr('endpoint.runtime')}`}
            type="password"
            value={draft.runtimeCredential}
            onChange={(runtimeCredential) => setDraft({ ...draft, runtimeCredential })}
            help={tr('credentialHelp')}
          />
          <IntegrationField
            label={`${tr('credential')} · ${tr('endpoint.administration')}`}
            type="password"
            value={draft.adminCredential}
            onChange={(adminCredential) => setDraft({ ...draft, adminCredential })}
            help={tr('credentialHelp')}
          />
        </div>
        <div className="mt-4">
          <IntegrationToggle
            label={t('common.enabled')}
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button disabled={busy} onClick={() => void save()}>
            {t('common.save')}
          </Button>
          {editingId && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditingId(undefined)
                setDraft(emptyDraft())
              }}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
        {error && (
          <div className="mt-3 text-sm text-error" role="alert">
            {error}
          </div>
        )}
        {status && (
          <div className="mt-3 text-sm text-success" role="status">
            {status}
          </div>
        )}
      </SettingGroup>
    </div>
  )
}
