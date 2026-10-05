import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import bossFangMascot from '@renderer/assets/images/bossfang.png'
import Scrollbar from '@renderer/components/Scrollbar'
import {
  SettingDescription,
  SettingGroup,
  SettingHelpText,
  SettingTitle,
  SettingsContentBody,
  SettingsContentColumn
} from '@renderer/components/SettingsPrimitives'
import { useQuery } from '@renderer/data/hooks/useDataApi'
import { useBossFangDashboard } from '@renderer/hooks/useBossFangDashboard'
import { ipcApi, useIpcOn } from '@renderer/ipc'
import type { BossFangConfig, BossFangDiagnostic, BossFangStatus } from '@shared/types/bossFang'
import type { UarInstanceInventorySnapshot } from '@shared/types/uarServiceInstance'

import { getSettingDomId } from '../settingsSearch/types'
import { Choice, Field } from './Fields'

export default function BossFangSettings() {
  const { t } = useTranslation()
  const { open, opening } = useBossFangDashboard()
  const [status, setStatus] = useState<BossFangStatus>()
  const [draft, setDraft] = useState<BossFangConfig>()
  const [inventory, setInventory] = useState<UarInstanceInventorySnapshot>()
  const { data: workspaces } = useQuery('/agent-workspaces')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [models, setModels] = useState<{ id: string; name: string; provider: string }[]>([])
  const [diagnostic, setDiagnostic] = useState<BossFangDiagnostic>()
  useIpcOn('bossfang.diagnostic.progress', (record) => {
    if (record.workspaceId === status?.requested.workspaceId) setDiagnostic(record)
  })
  const refresh = useCallback(async (loadDraft = false) => {
    const [next, instances] = await Promise.all([
      ipcApi.request('bossfang.status'),
      ipcApi.request('prometheus.uar.instances.read', {})
    ])
    setStatus(next)
    setInventory(instances)
    if (loadDraft) setDraft(next.requested)
  }, [])
  useEffect(() => {
    void refresh(true).catch((e) => setError(String(e)))
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(String(e)))
    }, 3000)
    return () => clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    if (!diagnostic || diagnostic.status !== 'running') return
    const timer = setInterval(() => {
      void ipcApi
        .request('bossfang.diagnostic.status', { id: diagnostic.id })
        .then(setDiagnostic)
        .catch((e) => setError(String(e)))
    }, 500)
    return () => clearInterval(timer)
  }, [diagnostic?.id, diagnostic?.status])
  useEffect(() => {
    if (status?.connection === 'connected')
      void ipcApi
        .request('bossfang.models')
        .then(setModels)
        .catch((e) => setError(String(e)))
    else setModels([])
  }, [status?.connection, status?.effective?.uarGeneration])
  useEffect(() => {
    if (status?.lastDiagnosticId && !diagnostic)
      void ipcApi
        .request('bossfang.diagnostic.status', { id: status.lastDiagnosticId })
        .then(setDiagnostic)
        .catch((e) => setError(String(e)))
  }, [status?.lastDiagnosticId, diagnostic?.id])
  const act = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await fn()
      await refresh()
      if (success) setMessage(t(success))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  if (!draft || !status)
    return (
      <SettingsContentColumn>
        <SettingsContentBody>
          <p role={error ? 'alert' : 'status'}>{error || t('common.loading')}</p>
          <Button onClick={() => void act(() => refresh(true))}>{t('bossfang.refresh')}</Button>
        </SettingsContentBody>
      </SettingsContentColumn>
    )
  const update = (patch: Partial<BossFangConfig>) => setDraft({ ...draft, ...patch })
  const dirty = JSON.stringify(draft) !== JSON.stringify(status.requested)
  const portInvalid = !Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535
  const save = () =>
    act(async () => {
      const next = await ipcApi.request('bossfang.configure', draft)
      setDraft(next.requested)
    }, 'bossfang.saved')
  const start = (restart = false) =>
    act(async () => {
      const result = await ipcApi.request(restart ? 'bossfang.restart' : 'bossfang.start')
      if (!result.success) throw new Error(result.message)
    })
  return (
    <SettingsContentColumn>
      <Scrollbar className="min-h-0 flex-1">
        <SettingsContentBody>
          <div className="mb-5 flex items-center gap-3">
            <img src={bossFangMascot} alt="" className="size-14 object-contain" />
            <div>
              <h1 className="text-xl font-semibold">{t('bossfang.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('bossfang.description')}</p>
            </div>
          </div>
          <fieldset disabled={busy || opening} className="min-w-0 space-y-5">
            <SettingGroup id={getSettingDomId('/settings/bossfang', 'process')}>
              <SettingTitle>{t('bossfang.process')}</SettingTitle>
              <SettingDescription>{t('bossfang.processHelp')}</SettingDescription>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Choice
                  token="bossfang-ownership"
                  label={t('bossfang.ownership')}
                  value={draft.ownership}
                  onChange={(ownership) => update({ ownership: ownership as BossFangConfig['ownership'] })}
                  options={['managed', 'external'].map((value) => ({ value, label: t('bossfang.ownership.' + value) }))}
                />
                {draft.ownership === 'managed' ? (
                  <>
                    <Field
                      token="bossfang-port"
                      label={t('bossfang.requestedPort')}
                      type="number"
                      value={String(draft.port)}
                      onChange={(port) => update({ port: Number(port) })}
                      help={portInvalid ? t('bossfang.portInvalid') : t('bossfang.portHelp')}
                    />
                    <Choice
                      token="bossfang-port-policy"
                      label={t('bossfang.portPolicy')}
                      value={draft.portPolicy}
                      onChange={(portPolicy) => update({ portPolicy: portPolicy as BossFangConfig['portPolicy'] })}
                      options={['automatic', 'fixed'].map((value) => ({
                        value,
                        label: t('bossfang.portPolicy.' + value)
                      }))}
                    />
                  </>
                ) : (
                  <Field
                    token="bossfang-external-endpoint"
                    label={t('bossfang.externalEndpoint')}
                    value={draft.externalEndpoint}
                    onChange={(externalEndpoint) => update({ externalEndpoint })}
                    help={t('bossfang.externalEndpointHelp')}
                  />
                )}
              </div>
              <p data-ui="bossfang-effective" className="mt-3 break-all text-sm text-muted-foreground">
                {t('bossfang.effectiveEndpoint', {
                  endpoint: status.effective?.origin ?? t('bossfang.status.stopped')
                })}{' '}
                · {t('bossfang.status.' + status.status)}
              </p>
              {status.restartRequired && <SettingHelpText>{t('bossfang.restartRequired')}</SettingHelpText>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button data-ui="bossfang-save" disabled={!dirty || portInvalid} onClick={() => void save()}>
                  {t('bossfang.save')}
                </Button>
                <Button
                  data-ui="bossfang-start"
                  variant="outline"
                  disabled={dirty || !status.configured || status.status === 'running'}
                  onClick={() => void start()}>
                  {t('bossfang.start')}
                </Button>
                <Button
                  data-ui="bossfang-restart"
                  variant="outline"
                  disabled={dirty || !status.configured}
                  onClick={() => void start(true)}>
                  {t('bossfang.restart')}
                </Button>
                {status.ownership === 'managed' && (
                  <Button
                    data-ui="bossfang-stop"
                    variant="outline"
                    disabled={status.status !== 'running'}
                    onClick={() =>
                      void act(async () => {
                        const result = await ipcApi.request('bossfang.stop')
                        if (!result.success) throw new Error(result.message)
                      })
                    }>
                    {t('bossfang.stop')}
                  </Button>
                )}
                <Button data-ui="bossfang-refresh" variant="ghost" onClick={() => void act(() => refresh())}>
                  {t('bossfang.refresh')}
                </Button>
              </div>
            </SettingGroup>
            <SettingGroup id={getSettingDomId('/settings/bossfang', 'credentials')}>
              <SettingTitle>{t('bossfang.credentials')}</SettingTitle>
              <SettingDescription>
                {t(status.configured ? 'bossfang.credentialsConfigured' : 'bossfang.credentialsHelp')}
              </SettingDescription>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  token="bossfang-username"
                  label={t('bossfang.username')}
                  value={username}
                  onChange={setUsername}
                />
                <Field
                  token="bossfang-password"
                  label={t('bossfang.password')}
                  value={password}
                  type="password"
                  onChange={setPassword}
                  help={t('bossfang.passwordHelp')}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  data-ui="bossfang-save-credentials"
                  variant="outline"
                  disabled={dirty || !username.trim() || password.length < 16}
                  onClick={() =>
                    void act(async () => {
                      await ipcApi.request('bossfang.configure_credentials', { username, password })
                      setPassword('')
                    }, 'bossfang.credentialsSaved')
                  }>
                  {t('bossfang.saveCredentials')}
                </Button>
                <Button
                  data-ui="bossfang-open"
                  disabled={dirty || !status.configured}
                  onClick={() => void act(() => open())}>
                  {t('bossfang.open')}
                </Button>
                {status.url && (
                  <Button
                    data-ui="bossfang-open-browser"
                    variant="outline"
                    onClick={() => void act(() => ipcApi.request('system.shell.open_external_website', status.url!))}>
                    {t('bossfang.openBrowser')}
                  </Button>
                )}
              </div>
            </SettingGroup>
            <SettingGroup id={getSettingDomId('/settings/bossfang', 'connection')}>
              <SettingTitle>{t('bossfang.uarConnection')}</SettingTitle>
              <SettingDescription>{t('bossfang.connectionIndependent')}</SettingDescription>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Choice
                  token="bossfang-uar-instance"
                  label={t('bossfang.uarInstance')}
                  value={draft.uarInstanceId}
                  onChange={(uarInstanceId) => update({ uarInstanceId })}
                  options={(inventory?.instances ?? [])
                    .filter((x) => x.enabled)
                    .map((x) => ({ value: x.id, label: x.name }))}
                />
                <Choice
                  token="bossfang-workspace"
                  label={t('bossfang.workspace')}
                  value={draft.workspaceId}
                  onChange={(workspaceId) => update({ workspaceId })}
                  options={(workspaces ?? []).map((x) => ({ value: x.id, label: x.name }))}
                />
              </div>
              <SettingHelpText className="mt-3">{t('bossfang.grantHelp')}</SettingHelpText>
              <p data-ui="bossfang-connection-status" className="mt-2 text-sm" role="status">
                {t('bossfang.connection.' + status.connection)}
                {status.effective?.grantExpiresAt
                  ? ' · ' +
                    t('bossfang.grantExpires', { time: new Date(status.effective.grantExpiresAt).toLocaleTimeString() })
                  : ''}
              </p>
              {status.connectionError && (
                <p role="alert" className="text-error">
                  {status.connectionError}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  data-ui="bossfang-connect"
                  disabled={dirty || !draft.workspaceId || status.status !== 'running'}
                  onClick={() =>
                    void act(async () => {
                      await ipcApi.request('bossfang.connect')
                      setModels(await ipcApi.request('bossfang.models'))
                    })
                  }>
                  {t('bossfang.connect')}
                </Button>
                <Button
                  data-ui="bossfang-disconnect"
                  variant="outline"
                  disabled={status.connection === 'disconnected'}
                  onClick={() => void act(() => ipcApi.request('bossfang.disconnect'))}>
                  {t('bossfang.disconnect')}
                </Button>
                <Link data-ui="bossfang-settings-link" to="/settings/uar" className="self-center text-sm text-link">
                  {t('bossfang.configureUar')}
                </Link>
              </div>
            </SettingGroup>
            <SettingGroup id={getSettingDomId('/settings/bossfang', 'diagnostics')}>
              <SettingTitle>{t('bossfang.diagnostics')}</SettingTitle>
              <SettingDescription>{t('bossfang.diagnosticHelp')}</SettingDescription>
              <div className="mt-4">
                <Choice
                  token="bossfang-model"
                  label={t('bossfang.model')}
                  value={draft.diagnosticModelId}
                  onChange={(diagnosticModelId) => update({ diagnosticModelId })}
                  options={models.map((x) => ({
                    value: x.id,
                    label: x.provider ? x.name + ' · ' + x.provider : x.name
                  }))}
                />
              </div>
              <SettingHelpText className="mt-3">
                {t('bossfang.modelUsage', { model: draft.diagnosticModelId || t('bossfang.selectModel') })}
              </SettingHelpText>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  data-ui="bossfang-diagnostic-start"
                  disabled={
                    dirty ||
                    status.connection !== 'connected' ||
                    !draft.diagnosticModelId ||
                    diagnostic?.status === 'running'
                  }
                  onClick={() =>
                    void act(async () =>
                      setDiagnostic(
                        await ipcApi.request('bossfang.diagnostic.start', { model: draft.diagnosticModelId })
                      )
                    )
                  }>
                  {t('bossfang.runDiagnostic')}
                </Button>
                <Button
                  data-ui="bossfang-diagnostic-cancel"
                  variant="outline"
                  disabled={diagnostic?.status !== 'running'}
                  onClick={() =>
                    void act(async () =>
                      setDiagnostic(await ipcApi.request('bossfang.diagnostic.cancel', { id: diagnostic!.id }))
                    )
                  }>
                  {t('bossfang.cancelDiagnostic')}
                </Button>
                <Button
                  data-ui="bossfang-diagnostic-export"
                  variant="outline"
                  onClick={() =>
                    void act(() =>
                      ipcApi.request('bossfang.diagnostic.export', { ...(diagnostic ? { id: diagnostic.id } : {}) })
                    )
                  }>
                  {t('bossfang.export')}
                </Button>
              </div>
              {diagnostic && (
                <div
                  data-ui="bossfang-diagnostic-report"
                  data-diagnostic-id={diagnostic.id}
                  data-diagnostic-status={diagnostic.status}
                  data-task-id={diagnostic.taskId ?? ''}
                  className="mt-4 space-y-3"
                  aria-live="polite">
                  <p>{t('bossfang.diagnosticStatus.' + diagnostic.status)}</p>
                  <ul className="space-y-2">
                    {(['listening', 'authenticated', 'compatible', 'delegationOperational'] as const).map((check) => (
                      <li
                        key={check}
                        data-ui={'bossfang-check-' + check}
                        data-check-status={diagnostic.checks[check]}
                        className="text-sm">
                        <span className="font-medium">{t('bossfang.check.' + check)}</span> ·{' '}
                        {t('bossfang.stageStatus.' + diagnostic.checks[check])}
                      </li>
                    ))}
                  </ul>
                  <ol className="space-y-2">
                    {diagnostic.stages.map((stage) => (
                      <li
                        key={stage.stage}
                        data-ui={'bossfang-stage-' + stage.stage}
                        data-stage-status={stage.status}
                        className="text-sm">
                        <span className="font-medium">{t('bossfang.stage.' + stage.stage)}</span> ·{' '}
                        {t('bossfang.stageStatus.' + stage.status)}
                        {stage.detail && <p className="text-muted-foreground">{stage.detail}</p>}
                      </li>
                    ))}
                  </ol>
                  {diagnostic.usage && <p>{t('bossfang.usage', diagnostic.usage)}</p>}
                  {diagnostic.error && (
                    <p role="alert" className="text-error">
                      {diagnostic.error}
                    </p>
                  )}
                  <details>
                    <summary className="cursor-pointer text-sm text-link">{t('bossfang.events')}</summary>
                    <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-xs">
                      {diagnostic.events.map((x) => x.type + ' · ' + x.detail).join('\n')}
                    </pre>
                  </details>
                  {diagnostic.action && (
                    <Button
                      data-ui="bossfang-diagnostic-action"
                      variant="outline"
                      onClick={() => {
                        const action = diagnostic.action
                        if (!action) return
                        if (action === 'open_dashboard') {
                          void act(() => open())
                          return
                        }
                        const token = {
                          configure_credentials: 'bossfang-username',
                          select_uar: 'bossfang-uar-instance',
                          select_workspace: 'bossfang-workspace',
                          select_model: 'bossfang-model',
                          retry: 'bossfang-diagnostic-start'
                        }[action]
                        document.querySelector<HTMLElement>(`[data-ui~="${token}"]`)?.focus()
                      }}>
                      {t('bossfang.action.' + diagnostic.action)}
                    </Button>
                  )}
                </div>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-link">{t('bossfang.logs')}</summary>
                <pre
                  data-ui="bossfang-logs"
                  className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {status.logs.map((x) => x.occurredAt + ' ' + x.level + ' ' + x.message).join('\n') ||
                    t('bossfang.noLogs')}
                </pre>
              </details>
            </SettingGroup>
          </fieldset>
          {busy && (
            <p className="mt-3 text-sm" role="status">
              {t('common.loading')}
            </p>
          )}
          {message && (
            <p className="mt-3 text-sm text-success" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm text-error" role="alert">
              {error}
            </p>
          )}
          {status.error && (
            <p className="mt-3 text-sm text-error" role="alert">
              {status.error}
            </p>
          )}
        </SettingsContentBody>
      </Scrollbar>
    </SettingsContentColumn>
  )
}
