import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import type { BossFangStatus } from '@shared/types/bossFang'

import { getSettingDomId } from '../settingsSearch/types'

export function ServiceReadiness({ status }: { status: BossFangStatus }) {
  const { t, i18n } = useTranslation()
  const detail = (text: string) => (i18n.exists(text) ? t(text) : text)
  return (
    <SettingGroup id={getSettingDomId('/settings/bossfang', 'services')} className="mb-5">
      <SettingTitle>{t('bossfang.services')}</SettingTitle>
      <SettingDescription>{t('bossfang.servicesHelp')}</SettingDescription>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2" aria-live="polite">
        {(['dashboard', 'uar', 'models', 'sharedMemory'] as const).map((service) => {
          const state = status.services[service]
          return (
            <div key={service} data-ui={'bossfang-service-' + service} className="min-w-0 space-y-1">
              <dt className="text-sm font-medium">{t('bossfang.service.' + service)}</dt>
              <dd className={state.state === 'unavailable' ? 'text-sm text-error' : 'text-sm text-muted-foreground'}>
                {t('bossfang.readiness.' + state.state)}
                {state.detail && <p className="mt-1 break-words">{detail(state.detail)}</p>}
              </dd>
            </div>
          )
        })}
      </dl>
      <div className="mt-4 space-y-2 break-words text-sm text-muted-foreground">
        {status.effective?.uarInstanceId && (
          <p>
            {t('bossfang.uarInstance')}: {status.effective.uarInstanceId}
          </p>
        )}
        <p>{t('bossfang.sharedMemoryHelp')}</p>
        {status.sharedMemory.endpoint && (
          <p>{t('bossfang.effectiveEndpoint', { endpoint: status.sharedMemory.endpoint })}</p>
        )}
        {status.sharedMemory.source && <p>{t('bossfang.memorySource.' + status.sharedMemory.source)}</p>}
        {status.sharedMemory.workspaceId && (
          <p>
            {t('bossfang.workspace')}: {status.sharedMemory.workspaceId} ·{' '}
            {t('bossfang.memoryScope.' + status.sharedMemory.scope)}
          </p>
        )}
        <p>{t('bossfang.privateMemoryHelp')}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-link">
        <Link to="/settings/services">{t('bossfang.configureServices')}</Link>
        <Link to="/settings/uar">{t('bossfang.configureUar')}</Link>
        <Link to="/settings/liter-llm">{t('bossfang.configureModels')}</Link>
      </div>
    </SettingGroup>
  )
}
