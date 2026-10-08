import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'

export function UarTeamAuthoringGuide({ disabled, onSingleAgent }: {
  disabled: boolean
  onSingleAgent: () => void
}) {
  const { t } = useTranslation(undefined, {
    keyPrefix: 'settings.prometheus.integration.uarAdmin.teams.authoring.workflow'
  })
  return (
    <section className="mt-4 space-y-3" data-ui="team-authoring-workflow">
      <h3 className="text-sm font-medium">{t('title')}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        {['outcome', 'roles', 'scope', 'resources', 'save'].map((step) => (
          <li key={step} data-ui={'team-authoring-step-' + step}>{t(step)}</li>
        ))}
      </ol>
      <details>
        <summary className="cursor-pointer text-sm">{t('decisions')}</summary>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p data-ui="team-authoring-role-combination">{t('combine')}</p>
          <p>{t('cost')}</p>
          <p data-ui="team-authoring-regulated-applicability">{t('regulated')}</p>
        </div>
      </details>
      <p className="text-xs text-muted-foreground">{t('singleHelp')}</p>
      <Button size="sm" variant="outline" disabled={disabled} data-ui="team-authoring-single-agent"
        onClick={onSingleAgent}>{t('single')}</Button>
    </section>
  )
}
