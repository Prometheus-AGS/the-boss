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
import { uarTeamError } from '@renderer/components/uarTeams/uarTeamError'
import { UarTeamExecutionPanel } from '@renderer/components/uarTeams/UarTeamExecutionPanel'
import { UarTeamModelPicker } from '@renderer/components/uarTeams/UarTeamModelPicker'
import { UarTeamPeerMessages } from '@renderer/components/uarTeams/UarTeamPeerMessages'
import { UarTeamTaskBoard } from '@renderer/components/uarTeams/UarTeamTaskBoard'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamModelSelection, UarTeamsSnapshot } from '@shared/types/uarTeams'

import { UarExecutionOwnerPanel } from './UarExecutionOwnerPanel'
import { UarTeamAuthoringPanel } from './UarTeamAuthoringPanel'
import { UarTeamMailbox } from './UarTeamMailbox'
import { UarTeamTaskForm } from './UarTeamTaskForm'
import { UarWorkflowsPanel } from './UarWorkflowsPanel'

const definitionKey = (definition: UarTeamsSnapshot['definitions'][number]) =>
  `${definition.id}:${definition.version}:${definition.digest}`

export function UarTeamsPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const [snapshot, setSnapshot] = useState<UarTeamsSnapshot>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'setup' | 'create' | 'rebind'>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [selectedDefinitionKey, setSelectedDefinitionKey] = useState<string>()
  const [selectedBindingId, setSelectedBindingId] = useState<string>()
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>()
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [teamInput, setTeamInput] = useState('{}')
  const [teamModel, setTeamModel] = useState<UarTeamModelSelection>()
  const createIntent = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined)

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setLoading(true)
        setError(undefined)
      }
      try {
        const next = await ipcApi.request('prometheus.uar.teams.snapshot', { workspaceId })
        setSnapshot(next)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [workspaceId]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  const refreshQuietly = useCallback(() => refresh(true), [refresh])

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
      const binding = await ipcApi.request('prometheus.uar.teams.setup_starter', {
        workspaceId,
        ...(teamModel ? { model: teamModel } : {})
      })
      setStatus(tr('starterReady'))
      const next = await ipcApi.request('prometheus.uar.teams.snapshot', { workspaceId })
      setSnapshot(next)
      const installed = next.definitions.find(
        (definition) =>
          definition.id === 'urn:boss:starter:team' &&
          definition.package.id === binding.package.id &&
          definition.package.digest === binding.package.digest
      )
      if (installed) {
        setSelectedDefinitionKey(definitionKey(installed))
        setSelectedBindingId(binding.id)
        setMemberCounts(Object.fromEntries(installed.members.map((member) => [member.role, member.min])))
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (message.includes('UAR_TEAM_MODEL_PRICING_UNAVAILABLE')) setError(tr('execution.priceUnavailable'))
      else if (message.includes('UAR_TEAM_BINDING_ACTIVATION_UNAVAILABLE')) setError(tr('execution.bindingUnavailable'))
      else if (
        [
          'UAR_TEAM_BINDING_SCOPE_MISMATCH',
          'UAR_TEAM_BINDING_PACKAGE_MISMATCH',
          'UAR_TEAM_BINDING_RESULT_MISMATCH'
        ].some((code) => message.includes(code))
      ) {
        setError(tr('execution.bindingMismatch'))
      } else setError(uarTeamError(message, (key) => tr('execution.' + key)))
    } finally {
      setBusy(undefined)
    }
  }

  const rebindStarter = async () => {
    if (!selectedBinding || !teamModel) return
    setBusy('rebind')
    setError(undefined)
    setStatus(undefined)
    try {
      await ipcApi.request('prometheus.uar.teams.rebind_starter', {
        workspaceId,
        bindingId: selectedBinding.id,
        expectedBindingRevision: selectedBinding.revision,
        model: teamModel
      })
      setStatus(tr('execution.rebindSucceeded'))
      await refresh()
    } catch (cause) {
      setError(uarTeamError(cause instanceof Error ? cause.message : String(cause), (key) => tr('execution.' + key)))
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
      input,
      selectedDefinition.members.map((member) => ({
        role: member.role,
        count: memberCounts[member.role] ?? member.min
      }))
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
        input,
        memberSlots: selectedDefinition.members.map((member) => ({
          role: member.role,
          count: memberCounts[member.role] ?? member.min
        }))
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

      <UarExecutionOwnerPanel />
      <UarTeamAuthoringPanel key={workspaceId + ':authoring'} workspaceId={workspaceId} onChanged={refreshQuietly} />
      <UarWorkflowsPanel
        key={workspaceId}
        workspaceId={workspaceId}
        team={selectedInstance}
        onTeamChanged={refreshQuietly}
      />
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
                    const definition = snapshot.definitions.find((item) => definitionKey(item) === value)
                    setMemberCounts(
                      Object.fromEntries(definition?.members.map((member) => [member.role, member.min]) ?? [])
                    )
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
                  <p className="mt-2 text-sm text-muted-foreground">{tr('noDefinitions')}</p>
                )}
                <UarTeamModelPicker value={teamModel} disabled={Boolean(busy)} onChange={setTeamModel} />
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  disabled={!snapshot.capabilities.planning || !snapshot.capabilities.cooperation || Boolean(busy)}
                  onClick={() => void setupStarter()}>
                  {busy === 'setup'
                    ? tr('settingUpStarter')
                    : tr(snapshot.definitions.length === 0 ? 'setupStarter' : 'installCurrentStarter')}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">{tr('starterVersionHelp')}</p>
                {!snapshot.capabilities.cooperation && (
                  <p className="mt-1 text-xs text-muted-foreground" role="status">
                    {tr('cooperation.unavailable')}
                  </p>
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
                {selectedBinding && teamModel && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void rebindStarter()}>
                      {tr('execution.rebind')}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">{tr('execution.rebindHelp')}</p>
                  </div>
                )}
                {selectedDefinition && eligibleBindings?.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">{tr('noBindings')}</p>
                )}
              </div>
            </div>
            {selectedDefinition && (
              <fieldset className="mt-4">
                <legend className="text-sm font-medium">{tr('memberSlots')}</legend>
                <p className="mt-1 text-xs text-muted-foreground">{tr('memberSlotsDescription')}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {selectedDefinition.members.map((member, index) => (
                    <div key={member.role}>
                      <label htmlFor={`uar-team-member-count-${index}`} className="mb-1.5 block text-sm font-medium">
                        {tr('memberSlotCount', { role: member.role })}
                      </label>
                      <Select
                        value={String(memberCounts[member.role] ?? member.min)}
                        onValueChange={(value) =>
                          setMemberCounts((current) => ({ ...current, [member.role]: Number(value) }))
                        }
                        disabled={Boolean(busy)}>
                        <SelectTrigger id={`uar-team-member-count-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: member.max - member.min + 1 }, (_, offset) => member.min + offset).map(
                            (count) => (
                              <SelectItem key={count} value={String(count)}>
                                {count}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            {selectedDefinition?.instructions && (
              <details className="mt-4 text-xs" data-ui="uar-team-shared-guidance">
                <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {tr('cooperation.guidance')}
                </summary>
                <p className="mt-1 text-muted-foreground">{tr('cooperation.precedence')}</p>
                <p className="mt-2 break-all text-muted-foreground">
                  {tr('revision')} {selectedDefinition.instructions.revision} · {selectedDefinition.instructions.digest}
                </p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background-subtle p-2">
                  {selectedDefinition.instructions.text}
                </pre>
              </details>
            )}
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
            {snapshot.executionProfileStage === 'operation' && (
              <p className="text-sm text-warning-subtle-foreground" role="status">
                {tr('cooperation.operationStage')}
              </p>
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
              <UarTeamTaskBoard
                workspaceId={workspaceId}
                instance={selectedInstance}
                ownership={snapshot.capabilities.ownership}
                onChanged={refresh}
              />
              <UarTeamExecutionPanel
                key={selectedInstance.id + ':execution'}
                workspaceId={workspaceId}
                instance={selectedInstance}
                available={snapshot.capabilities.execution}
                cooperation={Boolean(snapshot.capabilities.cooperation)}
                onChanged={refreshQuietly}
              />
              <UarTeamPeerMessages
                key={selectedInstance.id + ':peers'}
                workspaceId={workspaceId}
                instance={selectedInstance}
                available={Boolean(snapshot.capabilities.cooperation)}
              />
              <UarTeamMailbox
                key={selectedInstance.id}
                workspaceId={workspaceId}
                instance={selectedInstance}
                available={snapshot.capabilities.mailbox}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
