import { useTranslation } from 'react-i18next'

import type { UarEffectiveModelReceipt } from '@shared/types/uarTeamProfiles'

export function UarEffectiveModel({ model }: { model: UarEffectiveModelReceipt }) {
  const { t } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.execution' })
  const rows = [
    [t('route'), model.route.providerId + ' / ' + model.route.modelId],
    [t('servedAlias'), model.wireModelAlias],
    [t('profile'), model.profile.id + ' · ' + model.profile.revision],
    [t('settingsRevision'), String(model.settingsRevision)],
    [
      t('requestedReasoning'),
      model.requestedReasoning.mode === 'off' ? t('reasoningOff') : t('effort.' + model.requestedReasoning.effort)
    ],
    [
      t('effectiveReasoning'),
      model.effectiveReasoning.mode === 'off' ? t('reasoningOff') : t('effort.' + model.effectiveReasoning.effort)
    ],
    [
      t('priceIdentity'),
      model.pricingIdentity
        ? model.pricingIdentity.providerId + ' / ' + model.pricingIdentity.modelId
        : t('usagePending')
    ],
    [
      t('limits'),
      model.limits.contextTokens === undefined && model.limits.outputTokens === undefined
        ? t('limitsUnknown')
        : t('limitCounts', {
            context: model.limits.contextTokens ?? t('limitsUnknown'),
            output: model.limits.outputTokens ?? t('limitsUnknown')
          })
    ],
    [
      t('limitSource'),
      (model.limits.source === 'unknown' ? t('limitsUnknown') : model.limits.source) +
        (model.limits.sourceRevision ? ' · ' + model.limits.sourceRevision : '')
    ]
  ]
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t('effectiveModel')}
      </summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="font-medium">{label}</dt>
            <dd className="break-all text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-warning-subtle-foreground">{t('noGuaranteedFit')}</p>
    </details>
  )
}
