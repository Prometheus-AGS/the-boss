import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import type { UarProviderMutation } from '@shared/types/prometheusIntegration'

type Model = UarProviderMutation['models'][number]
interface Props {
  models: Model[]
  disabled: boolean
  onChange: (models: Model[]) => void
}

export function UarProviderExecutionSettings({ models, disabled, onChange }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.execution' })
  const id = useId()
  const [selected, setSelected] = useState<string>()
  const model = models.find((candidate) => candidate.id === selected) ?? models[0]
  const settings = model?.executionProfile
  const setReasoning = (reasoning: NonNullable<Model['executionProfile']>['reasoning']) => {
    if (!model) return
    onChange(
      models.map((candidate) =>
        candidate.id === model.id
          ? {
              ...candidate,
              executionProfile: {
                profile: { id: 'uar.openai-compatible-chat.settings-v1', revision: 1 },
                settingsRevision: settings?.settingsRevision ?? 1,
                reasoning
              }
            }
          : candidate
      )
    )
  }
  if (!model) return null
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t('modelSettings')}</legend>
      <label htmlFor={id + 'model'} className="block text-xs font-medium">
        {t('model')}
      </label>
      <Select value={model.id} disabled={disabled} onValueChange={setSelected}>
        <SelectTrigger id={id + 'model'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {models.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.displayName ?? candidate.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('profileHelp')}</p>
      {settings ? (
        <>
          <dl className="text-xs">
            <dt className="font-medium">{t('profile')}</dt>
            <dd className="break-all">
              {settings.profile.id} · {t('settingsRevision')} {settings.settingsRevision}
            </dd>
          </dl>
          <label htmlFor={id + 'reasoning'} className="block text-xs font-medium">
            {t('requestedReasoning')}
          </label>
          <Select
            value={settings.reasoning.mode}
            disabled={disabled}
            onValueChange={(value) =>
              setReasoning(value === 'off' ? { mode: 'off' } : { mode: 'explicit', effort: 'low' })
            }>
            <SelectTrigger id={id + 'reasoning'} aria-describedby={id + 'reasoningHelp'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{t('reasoningOff')}</SelectItem>
              <SelectItem value="explicit">{t('reasoningExplicit')}</SelectItem>
            </SelectContent>
          </Select>
          {settings.reasoning.mode === 'explicit' && (
            <>
              <label htmlFor={id + 'effort'} className="block text-xs font-medium">
                {t('reasoningEffort')}
              </label>
              <Select
                value={settings.reasoning.effort}
                disabled={disabled}
                onValueChange={(effort) =>
                  setReasoning({ mode: 'explicit', effort: effort as 'none' | 'low' | 'medium' | 'high' | 'max' })
                }>
                <SelectTrigger id={id + 'effort'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['none', 'low', 'medium', 'high', 'max'] as const).map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {t('effort.' + effort)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <p id={id + 'reasoningHelp'} className="text-xs text-muted-foreground">
            {t('reasoningHelp')}
          </p>
        </>
      ) : (
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setReasoning({ mode: 'off' })}>
          {t('configureProfile')}
        </Button>
      )}
      <p className="text-xs text-warning-subtle-foreground">{t('noGuaranteedFit')}</p>
      <p className="text-xs text-muted-foreground">{t('saveRebindHelp')}</p>
      {model.pricingIdentity && (
        <p className="break-all text-xs text-muted-foreground">
          {t('priceIdentity')}: {model.pricingIdentity.providerId} / {model.pricingIdentity.modelId}
        </p>
      )}
    </fieldset>
  )
}
