import { useTranslation } from 'react-i18next'

import type { UarReviewedModelPolicy } from '@shared/types/uarTeamModelPolicy'

export function UarTeamModelCost({ value }: { value: UarReviewedModelPolicy }) {
  const { t, i18n } = useTranslation(undefined, {
    keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.authoring.modelPolicy.cost'
  })
  const selected = value.result.selected
  const amount = (price: number | null) => price === null ? t('unknown')
    : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 }).format(price)
  return (
    <div className="space-y-2" data-ui="team-authoring-model-cost"
      data-input-price-known={selected.pricing.inputPerMillion !== null}
      data-output-price-known={selected.pricing.outputPerMillion !== null}>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1 break-words">
        <dt>{t('tier')}</dt>
        <dd data-ui="team-authoring-model-tier">{selected.tier ? t('tiers.' + selected.tier) : t('unknown')}</dd>
        <dt>{t('input')}</dt><dd>{amount(selected.pricing.inputPerMillion)}</dd>
        <dt>{t('output')}</dt><dd>{amount(selected.pricing.outputPerMillion)}</dd>
      </dl>
      <p className="text-muted-foreground">{t('limits')}</p>
      <details data-ui="team-authoring-model-provenance">
        <summary className="cursor-pointer">{t('provenance')}</summary>
        <pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify({
          pricing: selected.pricing, provenance: selected.provenance, freshness: selected.freshness,
          catalogProvenance: value.result.catalogProvenance, catalogFreshness: value.result.catalogFreshness
        }, null, 2)}</pre>
      </details>
    </div>
  )
}
