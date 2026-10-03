import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import {
  SettingDescription,
  SettingGroup,
  SettingHelpText,
  SettingTitle
} from '@renderer/components/SettingsPrimitives'
import { useBossFangDashboard } from '@renderer/hooks/useBossFangDashboard'
import { ipcApi } from '@renderer/ipc'
import { loggerService } from '@renderer/services/LoggerService'
import { getSettingDomId } from '@renderer/pages/settings/settingsSearch/types'

import { IntegrationField } from './IntegrationFields'

const logger = loggerService.withContext('BossFangSettingsPanel')

export function BossFangSettingsPanel() {
  const { t } = useTranslation()
  const { open, opening } = useBossFangDashboard()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    void ipcApi.request('bossfang.status').then(
      (result) => {
        setConfigured(result.configured)
        setStatus(result.status)
        setUrl(result.url)
      },
      (error) => logger.warn('Could not read BossFang status', error as Error)
    )
  }, [])

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
      const result = await ipcApi.request('bossfang.status')
      setStatus(result.status)
      setUrl(result.url)
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
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={saving || !username.trim() || password.length < 16} onClick={() => void save()}>
          {saving ? t('common.loading') : t('bossfang.saveCredentials')}
        </Button>
        <Button disabled={!configured || opening} onClick={() => void openDashboard()}>
          {opening ? t('common.loading') : t('bossfang.open')}
        </Button>
        {url && (
          <Button variant="outline" onClick={() => void openBrowser()}>
            {t('bossfang.openBrowser')}
          </Button>
        )}
      </div>
      <SettingHelpText className="mt-3" role={message ? 'status' : undefined}>
        {message || t(configured ? 'bossfang.statusConfigured' : 'bossfang.statusSetupRequired')}
        {status ? ` · ${t(`bossfang.status.${status}`)}` : ''}
      </SettingHelpText>
    </SettingGroup>
  )
}
