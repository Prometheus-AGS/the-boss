import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import {
  SettingDescription,
  SettingGroup,
  SettingHelpText,
  SettingTitle
} from '@renderer/components/SettingsPrimitives'
import { ipcApi } from '@renderer/ipc'
import type { BossFangModelSourceChoice } from '@shared/types/bossFang'

import { getSettingDomId } from '../settingsSearch/types'
import { Choice } from './Fields'

export function ModelSources({
  instanceId,
  disabled,
  onConfigured
}: {
  instanceId: string
  disabled: boolean
  onConfigured: (id: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [sources, setSources] = useState<BossFangModelSourceChoice[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const key = (source: BossFangModelSourceChoice) => JSON.stringify([source.source, source.providerId, source.modelId])
  const choice = sources.find((source) => key(source) === selected)
  const refresh = async () => setSources(await ipcApi.request('bossfang.model_sources'))
  useEffect(() => {
    void refresh().catch((reason) => setError(String(reason)))
  }, [instanceId])
  const act = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setComplete(false)
    try {
      await operation()
      setComplete(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  const detail = (value: string) => (i18n.exists(value) ? t(value) : value)
  return (
    <SettingGroup id={getSettingDomId('/settings/bossfang', 'model-sources')}>
      <SettingTitle>{t('bossfang.configureModels')}</SettingTitle>
      <SettingDescription>{t('bossfang.sourceHelp')}</SettingDescription>
      <fieldset disabled={busy || disabled} className="mt-4 space-y-3">
        <Choice
          token="bossfang-model-source"
          label={t('bossfang.model')}
          value={selected}
          onChange={setSelected}
          options={sources.map((source) => ({
            value: key(source),
            label: source.name + ' · ' + source.providerName + ' · ' + t('bossfang.modelSource.' + source.source)
          }))}
        />
        {choice?.detail && <SettingHelpText>{detail(choice.detail)}</SettingHelpText>}
        <SettingHelpText>{t('bossfang.sourceUsage')}</SettingHelpText>
        <div className="flex flex-wrap gap-2">
          <Button
            data-ui="bossfang-model-configure"
            disabled={!choice?.available}
            onClick={() =>
              void act(async () => {
                if (!choice) return
                const configured = await ipcApi.request('bossfang.model_configure', {
                  source: choice.source,
                  providerId: choice.providerId,
                  modelId: choice.modelId
                })
                await refresh()
                await onConfigured(configured.id)
              })
            }>
            {t('bossfang.configureCheckModel')}
          </Button>
          <Button variant="outline" onClick={() => void act(refresh)}>
            {t('bossfang.refreshModelSources')}
          </Button>
          <Button
            variant="outline"
            data-ui="bossfang-gateway-import"
            onClick={() => void act(async () => setSources(await ipcApi.request('bossfang.gateway_import')))}>
            {t('bossfang.importGatewayCredential')}
          </Button>
        </div>
      </fieldset>
      <p className="mt-3 text-sm" role="status">
        {busy ? t('common.loading') : complete ? t('bossfang.sourceConfigured') : ''}
      </p>
      {error && (
        <p role="alert" className="text-sm text-error">
          {detail(error)}
        </p>
      )}
      <div className="mt-3 flex gap-4 text-sm text-link">
        <Link to="/settings/provider">{t('bossfang.sourceCredentials')}</Link>
        <Link to="/settings/liter-llm">{t('bossfang.configureModels')}</Link>
      </div>
    </SettingGroup>
  )
}
