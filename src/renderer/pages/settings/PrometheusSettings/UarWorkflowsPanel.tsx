import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamInstance } from '@shared/types/uarTeams'
import type { UarWorkflowRun, UarWorkflowsSnapshot } from '@shared/types/uarWorkflows'

import { UarWorkflowRunView } from './UarWorkflowRunView'
import { UarWorkflowStart } from './UarWorkflowStart'

export function UarWorkflowsPanel({
  workspaceId,
  team,
  onTeamChanged
}: {
  workspaceId: string
  team?: UarTeamInstance
  onTeamChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.workflows' })
  const { t: tt } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const id = useId()
  const [snapshot, setSnapshot] = useState<UarWorkflowsSnapshot>()
  const [definitionKey, setDefinitionKey] = useState<string>()
  const [runId, setRunId] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const refreshing = useRef(false)
  const snapshotRevision = useRef(0)
  const refresh = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    setLoading(true)
    const revision = snapshotRevision.current
    try {
      const next = await ipcApi.request('prometheus.uar.workflows.snapshot', { workspaceId })
      if (snapshotRevision.current === revision) setSnapshot(next)
      setError(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      refreshing.current = false
      setLoading(false)
    }
  }, [workspaceId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const progressing = snapshot?.runs.some((run) => ['ready', 'running', 'cancellation_requested'].includes(run.status))
  useEffect(() => {
    if (!progressing) return
    const timer = setInterval(() => void refresh(), 3000)
    return () => clearInterval(timer)
  }, [progressing, refresh])
  const definition = snapshot?.definitions.find((item) => item.identity.digest === definitionKey)
  const run = snapshot?.runs.find((item) => item.id === runId)
  const matchingTeam =
    team &&
    definition &&
    team.package.id === definition.package.id &&
    team.package.version === definition.package.version &&
    team.package.digest === definition.package.digest
  const changed = (next: UarWorkflowRun) => {
    snapshotRevision.current += 1
    setSnapshot((current) =>
      current ? { ...current, runs: [next, ...current.runs.filter((item) => item.id !== next.id)] } : current
    )
    setRunId(next.id)
  }
  const started = async (next: UarWorkflowRun) => {
    changed(next)
    await onTeamChanged()
  }

  return (
    <SettingGroup data-ui="uar-workflows">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SettingTitle>{tr('title')}</SettingTitle>
          <SettingDescription>{tr('description')}</SettingDescription>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          {t('common.refresh')}
        </Button>
      </div>
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {loading ? t('common.loading') : ''}
      </p>
      <p role="alert" className="break-words text-sm text-error">
        {error && (
          <>
            {error} {tt('execution.denialHelp')}
          </>
        )}
      </p>
      {snapshot && !snapshot.available && <p className="text-sm text-muted-foreground">{tr('unavailable')}</p>}
      {snapshot?.available && (
        <>
          {snapshot.stage !== 'qualified' && (
            <p className="mt-2 text-sm text-warning-subtle-foreground">{tt('cooperation.operationStage')}</p>
          )}
          <div className="mt-4">
            <label htmlFor={id + '-definition'} className="mb-1.5 block text-sm font-medium">
              {tr('definition')}
            </label>
            <Select value={definitionKey} onValueChange={setDefinitionKey}>
              <SelectTrigger id={id + '-definition'}>
                <SelectValue placeholder={tr('definition')} />
              </SelectTrigger>
              <SelectContent>
                {snapshot.definitions.map((item) => (
                  <SelectItem key={item.identity.digest} value={item.identity.digest}>
                    {item.title} · {item.identity.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {snapshot.definitions.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">{tr('noDefinitions')}</p>
            )}
            {definition && (
              <>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {definition.identity.id} · {definition.identity.digest}
                </p>
                {!definition.supported && (
                  <p className="mt-2 text-sm text-warning-subtle-foreground">{tr('unsupported')}</p>
                )}
                {definition.diagnostics.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {definition.diagnostics.map((diagnostic) => (
                      <li key={diagnostic.field + diagnostic.code} className="break-words">
                        {diagnostic.field}: {diagnostic.code} · {diagnostic.message}
                      </li>
                    ))}
                  </ul>
                )}
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    {tt('taskDetails')}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(definition, null, 2)}</pre>
                </details>
                {!team ? (
                  <p className="mt-2 text-sm text-muted-foreground">{tr('selectTeam')}</p>
                ) : !matchingTeam ? (
                  <p className="mt-2 text-sm text-muted-foreground">{tt('execution.bindingMismatch')}</p>
                ) : (
                  definition.supported && (
                    <UarWorkflowStart
                      key={workspaceId + team.id + definition.identity.digest}
                      workspaceId={workspaceId}
                      team={team}
                      definition={definition}
                      onStarted={started}
                    />
                  )
                )}
              </>
            )}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <label htmlFor={id + '-run'} className="mb-1.5 block text-sm font-medium">
              {tr('runs')}
            </label>
            {snapshot.runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr('noRuns')}</p>
            ) : (
              <Select value={runId} onValueChange={setRunId}>
                <SelectTrigger id={id + '-run'}>
                  <SelectValue placeholder={tr('chooseRun')} />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.runs.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.id} · {item.definition.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {run && <UarWorkflowRunView key={run.id} workspaceId={workspaceId} run={run} onChanged={changed} />}
          </div>
        </>
      )}
    </SettingGroup>
  )
}
