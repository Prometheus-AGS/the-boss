import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import type { UarTeamsSnapshot } from '@shared/types/uarTeams'

import { UarTeamTaskBoard } from './UarTeamTaskBoard'
import { UarTeamTaskForm } from './UarTeamTaskForm'

const definitionKey = (definition: UarTeamsSnapshot['definitions'][number]) =>
  `${definition.id}:${definition.version}:${definition.digest}`

export function UarTeamsPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const [snapshot, setSnapshot] = useState<UarTeamsSnapshot>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'setup' | 'create'>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [selectedDefinitionKey, setSelectedDefinitionKey] = useState<string>()
  const [selectedBindingId, setSelectedBindingId] = useState<string>()
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>()
  const [teamInput, setTeamInput] = useState('{}')
  const createIntent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setSnapshot(await ipcApi.request('prometheus.uar.teams.snapshot', { workspaceId }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedDefinition = snapshot?.definitions.find(
    (definition) => definitionKey(definition) === selectedDefinitionKey
  )
  const eligibleBindings = snapshot?.bindings.filter(
    (binding) =>
      selectedDefinition &&
      binding.package.id === selectedDefinition.package.id &&
      binding.package.version === selectedDefinition.package.version &&
      binding.package.digest === selectedDefinition.package.digest
  )
  const selectedBinding = eligibleBindings?.find((binding) => binding.id === selectedBindingId)
  const selectedInstance = snapshot?.instances.find((instance) => instance.id === selectedInstanceId)

  const setupStarter = async () => {
    setBusy('setup')
    setError(undefined)
    setStatus(undefined)
    try {
      await ipcApi.request('prometheus.uar.teams.setup_starter', { workspaceId })
      setStatus(tr('starterReady'))
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const createTeam = async () => {
    if (!selectedDefinition || !selectedBinding) return
    let input: unknown
    try {
      input = JSON.parse(teamInput)
    } catch {
      setError(tr('invalidTeamInput'))
      return
    }
    const fingerprint = JSON.stringify([
      workspaceId,
      selectedBinding.id,
      selectedDefinition.id,
      selectedDefinition.version,
      selectedDefinition.digest,
      input
    ])
    const intent =
      createIntent.current?.fingerprint === fingerprint
        ? createIntent.current
        : { fingerprint, commandId: crypto.randomUUID() }
    createIntent.current = intent
    setBusy('create')
    setError(undefined)
    setStatus(undefined)
    try {
      const instance = await ipcApi.request('prometheus.uar.teams.create', {
        workspaceId,
        commandId: intent.commandId,
        deploymentBindingId: selectedBinding.id,
        teamDefinition: {
          id: selectedDefinition.id,
          version: selectedDefinition.version,
          digest: selectedDefinition.digest
        },
        input
      })
      setSelectedInstanceId(instance.id)
      createIntent.current = undefined
      setStatus(tr('teamCreated'))
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="space-y-4">
      <SettingGroup>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SettingTitle>{tr('title')}</SettingTitle>
            <SettingDescription>{tr('description')}</SettingDescription>
          </div>
          <Button variant="outline" size="sm" disabled={loading || Boolean(busy)} onClick={() => void refresh()}>
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
            {error} {tr('retryGuidance')}
          </p>
        )}
        {status && (
          <p className="mt-3 text-sm text-success" role="status">
            {status}
          </p>
        )}
        {snapshot && !snapshot.capabilities.planning && (
          <p className="mt-3 text-sm text-warning-subtle-foreground" role="status">
            {tr('planningUnavailable')} {snapshot.unavailableReason}
          </p>
        )}
      </SettingGroup>

      {snapshot && (
        <>
          <SettingGroup>
            <SettingTitle>{tr('createTitle')}</SettingTitle>
            <SettingDescription>{tr('createDescription')}</SettingDescription>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="uar-team-definition" className="mb-1.5 block text-sm font-medium">
                  {tr('definition')}
                </label>
                <Select
                  value={selectedDefinitionKey}
                  onValueChange={(value) => {
                    setSelectedDefinitionKey(value)
                    setSelectedBindingId(undefined)
                  }}>
                  <SelectTrigger id="uar-team-definition">
                    <SelectValue placeholder={tr('chooseDefinition')} />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.definitions.map((definition) => (
                      <SelectItem key={definitionKey(definition)} value={definitionKey(definition)}>
                        {definition.title} · {definition.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDefinition && (
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {selectedDefinition.id} · {tr('digest')}: {selectedDefinition.digest}
                  </p>
                )}
                {snapshot.definitions.length === 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">{tr('noDefinitions')}</p>
                    <Button
                      className="mt-3"
                      variant="outline"
                      size="sm"
                      disabled={!snapshot.capabilities.planning || Boolean(busy)}
                      onClick={() => void setupStarter()}>
                      {busy === 'setup' ? tr('settingUpStarter') : tr('setupStarter')}
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="uar-team-binding" className="mb-1.5 block text-sm font-medium">
                  {tr('binding')}
                </label>
                <Select value={selectedBindingId} onValueChange={setSelectedBindingId} disabled={!selectedDefinition}>
                  <SelectTrigger id="uar-team-binding">
                    <SelectValue placeholder={tr('chooseBinding')} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleBindings?.map((binding) => (
                      <SelectItem key={binding.id} value={binding.id}>
                        {binding.id} · {tr('revision')} {binding.revision}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDefinition && eligibleBindings?.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">{tr('noBindings')}</p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="uar-team-input" className="mb-1.5 block text-sm font-medium">
                {tr('teamInput')}
              </label>
              <Textarea.Input
                id="uar-team-input"
                value={teamInput}
                onChange={(event) => setTeamInput(event.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">{tr('teamInputDescription')}</p>
            </div>
            <Button
              className="mt-4"
              disabled={!snapshot.capabilities.planning || !selectedBinding || Boolean(busy)}
              onClick={() => void createTeam()}>
              {busy === 'create' ? tr('creating') : tr('createTeam')}
            </Button>
          </SettingGroup>

          <SettingGroup>
            <SettingTitle>{tr('instancesTitle')}</SettingTitle>
            <SettingDescription>{tr('instancesDescription')}</SettingDescription>
            {snapshot.instances.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{tr('noInstances')}</p>
            ) : (
              <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <SelectTrigger className="mt-4" aria-label={tr('chooseInstance')}>
                  <SelectValue placeholder={tr('chooseInstance')} />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.id} · {tr(`teamStatus.${instance.status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedInstance && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{tr(`teamStatus.${selectedInstance.status}`)}</Badge>
                  <span>
                    {tr('revision')} {selectedInstance.revision}
                  </span>
                  <span className="break-all">
                    {selectedInstance.definition.id} · {selectedInstance.definition.version}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-medium">{tr('membersTitle')}</h3>
                  {selectedInstance.members.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">{tr('noMembers')}</p>
                  ) : (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {selectedInstance.members.map((member) => (
                        <li key={member.id} className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm">
                          <span className="font-medium">{member.role}</span>
                          <Badge variant="outline" className="ml-2">
                            {tr(`teamStatus.${member.status}`)}
                          </Badge>
                          <p className="mt-1 break-all text-xs text-muted-foreground">{member.id}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </SettingGroup>

          {selectedInstance && (
            <>
              <UarTeamTaskForm
                key={selectedInstance.id}
                workspaceId={workspaceId}
                instance={selectedInstance}
                planning={snapshot.capabilities.planning}
                onAdded={refresh}
              />
              <UarTeamTaskBoard instance={selectedInstance} />
            </>
          )}
        </>
      )}
    </div>
  )
}
