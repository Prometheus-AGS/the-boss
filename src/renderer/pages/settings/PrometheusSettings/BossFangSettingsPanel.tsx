import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import { usePreference } from '@data/hooks/usePreference'
import {
  SettingDescription,
  SettingGroup,
  SettingHelpText,
  SettingTitle
} from '@renderer/components/SettingsPrimitives'
import { useBossFangDashboard } from '@renderer/hooks/useBossFangDashboard'
import { ipcApi } from '@renderer/ipc'
import { getSettingDomId } from '@renderer/pages/settings/settingsSearch/types'
import { loggerService } from '@renderer/services/LoggerService'

import { IntegrationChoice, IntegrationField } from './IntegrationFields'

const logger = loggerService.withContext('BossFangSettingsPanel')

export function BossFangSettingsPanel() {
  const { t } = useTranslation()
  const { open, opening } = useBossFangDashboard()
  const [ownership, setOwnership] = usePreference('feature.bossfang.ownership', { optimistic: false })
  const [externalEndpoint] = usePreference('feature.bossfang.external_endpoint', { optimistic: false })
  const [endpointDraft, setEndpointDraft] = useState(externalEndpoint)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState<string>()

  useEffect(() => setEndpointDraft(externalEndpoint), [externalEndpoint])

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const result = await ipcApi.request('bossfang.status')
      setConfigured(result.configured)
      setStatus(result.status)
      setUrl(result.url)
    } catch (error) {
      logger.warn('Could not read BossFang status', error as Error)
      setStatus('error')
      setUrl(undefined)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [ownership, externalEndpoint, refresh])

  const saveEndpoint = async () => {
    setSaving(true)
    setMessage('')
    try {
      await ipcApi.request('bossfang.configure_external_endpoint', { endpoint: endpointDraft })
      setMessage(t('bossfang.endpointSaved'))
    } catch (error) {
      logger.warn('Could not save BossFang endpoint', error as Error)
      setMessage(t('bossfang.endpointFailed'))
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      await ipcApi.request('bossfang.configure_credentials', { username, password })
      setPassword('')
      setConfigured(true)
      setStatus('stopped')
      setMessage(t('bossfang.credentialsSaved'))
    } catch (error) {
      logger.warn('Could not save BossFang credentials', error as Error)
      setMessage(t('bossfang.credentialsFailed'))
    } finally {
      setSaving(false)
    }
  }

  const openDashboard = async () => {
    if (await open()) {
      await refresh()
    }
  }

  const openBrowser = async () => {
    const result = await ipcApi.request('bossfang.status')
    if (result.url) void ipcApi.request('system.shell.open_external_website', result.url)
  }

  return (
    <SettingGroup id={getSettingDomId('/settings/uar', 'bossfang-console')} className="scroll-mt-6">
      <SettingTitle>{t('bossfang.title')}</SettingTitle>
      <SettingDescription>{t('bossfang.description')}</SettingDescription>
      <div className="mt-4 max-w-md">
        <IntegrationChoice
          label={t('bossfang.ownership')}
          value={ownership}
          onChange={(value) => {
            setMessage('')
            void setOwnership(value)
          }}
          options={[
            { value: 'managed', label: t('bossfang.ownership.managed') },
            { value: 'external', label: t('bossfang.ownership.external') }
          ]}
        />
      </div>
      {ownership === 'external' && (
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <IntegrationField
            label={t('bossfang.externalEndpoint')}
            value={endpointDraft}
            onChange={setEndpointDraft}
            help={t('bossfang.externalEndpointHelp')}
          />
          <Button
            variant="outline"
            disabled={saving || endpointDraft.trim() === externalEndpoint.trim()}
            onClick={() => void saveEndpoint()}>
            {saving ? t('common.loading') : t('bossfang.saveEndpoint')}
          </Button>
        </div>
      )}
      {ownership === 'managed' && !configured && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <IntegrationField label={t('bossfang.username')} value={username} onChange={setUsername} />
          <IntegrationField
            label={t('bossfang.password')}
            value={password}
            type="password"
            onChange={setPassword}
            help={t('bossfang.passwordHelp')}
          />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ownership === 'managed' && !configured && (
          <Button
            variant="outline"
            disabled={saving || !username.trim() || password.length < 16}
            onClick={() => void save()}>
            {saving ? t('common.loading') : t('bossfang.saveCredentials')}
          </Button>
        )}
        <Button disabled={!configured || opening || checking} onClick={() => void openDashboard()}>
          {opening ? t('common.loading') : t('bossfang.open')}
        </Button>
        {url && (
          <Button variant="outline" onClick={() => void openBrowser()}>
            {t('bossfang.openBrowser')}
          </Button>
        )}
        <Button variant="outline" disabled={checking} onClick={() => void refresh()}>
          {checking ? t('common.loading') : t('bossfang.checkConnection')}
        </Button>
      </div>
      <SettingHelpText className="mt-3" role="status">
        {message ||
          (ownership === 'external'
            ? t(status === 'running' ? 'bossfang.externalConnected' : 'bossfang.externalUnavailable')
            : t(configured ? 'bossfang.statusConfigured' : 'bossfang.statusSetupRequired'))}
        {status ? ` · ${t(`bossfang.status.${status}`)}` : ''}
      </SettingHelpText>
    </SettingGroup>
  )
}
