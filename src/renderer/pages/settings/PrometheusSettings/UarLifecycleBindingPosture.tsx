import { useTranslation } from 'react-i18next'

import type { UarDurableBinding } from '@shared/types/uarDurableAdministration'

import { LifecycleField } from './UarLifecycleRecords'

export function UarLifecycleBindingPosture({ binding }: { binding: UarDurableBinding }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.' + key)
  const posture = binding.posture
  return (
    <div className="sm:col-span-2" data-ui="uar-lifecycle-binding-posture" data-binding-id={binding.id}>
      <dt className="text-muted-foreground">{tr('lifecycle.detail.posture')}</dt>
      <dd>
        {!posture ? (
          <p className="mt-1">{tr('lifecycle.detail.postureUnknown')}</p>
        ) : (
          <details className="mt-2" open>
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {tr('lifecycle.detail.posture')}
            </summary>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <LifecycleField label={tr('lifecycle.binding')}>
                {posture.bindingRef.id} · {posture.bindingRef.digest} · {posture.id} · {tr('durable.revision')}{' '}
                {posture.revision}
              </LifecycleField>
              <LifecycleField label={tr('teams.execution.profile')}>{posture.profile}</LifecycleField>
              <LifecycleField label={tr('teams.digest')}>{posture.contentDigest}</LifecycleField>
              <LifecycleField label={tr('lifecycle.detail.policyRevision')}>{posture.policyRevision}</LifecycleField>
              <LifecycleField label={tr('lifecycle.detail.admission')}>
                {tr(posture.admitted ? 'lifecycle.detail.admitted' : 'lifecycle.detail.notAdmitted')}
              </LifecycleField>
              <LifecycleField label={tr('lifecycle.detail.capabilities')}>
                {posture.runtimeCapabilities.join(', ') || t('common.none')}
              </LifecycleField>
              <LifecycleField label={tr('lifecycle.detail.receiptCreated')}>
                <time dateTime={posture.createdAt}>{posture.createdAt}</time>
              </LifecycleField>
              {posture.serviceBinding && (
                <LifecycleField label={tr('lifecycle.service')}>
                  {posture.serviceBinding.instanceId} · {posture.serviceBinding.profile} ·{' '}
                  {tr('instances.' + posture.serviceBinding.workspaceLocation)} · {posture.serviceBinding.intent}
                </LifecycleField>
              )}
              {posture.resolvedModels.map((model, index) => (
                <LifecycleField key={index} label={tr('teams.execution.effectiveModel')}>
                  {model.role ?? tr('durable.unknown')} · {model.providerId ?? tr('durable.unknown')} /{' '}
                  {model.modelId ?? tr('durable.unknown')}
                  <br />
                  {tr('lifecycle.detail.requestedAlias')}: {model.requestedAlias ?? tr('durable.unknown')}
                  <br />
                  {tr('teams.execution.profile')}:{' '}
                  {model.profile ? model.profile.id + ' · ' + model.profile.revision : tr('durable.unknown')} ·{' '}
                  {tr('durable.revision')}: {model.settingsRevision ?? tr('durable.unknown')}
                </LifecycleField>
              ))}
              {posture.diagnostics.length > 0 && (
                <LifecycleField label={tr('lifecycle.detail.bindingDiagnostics')}>
                  {posture.diagnostics.map((diagnostic, index) => (
                    <p key={index}>
                      {diagnostic.pointer} · {diagnostic.disposition} · {diagnostic.reasonCode} · {diagnostic.message}
                    </p>
                  ))}
                </LifecycleField>
              )}
            </dl>
          </details>
        )}
        {binding.preflightDiagnostics && (
          <p className="mt-3 text-xs">
            {tr('lifecycle.detail.bindingDiagnostics')}:{' '}
            {binding.preflightDiagnostics.length
              ? binding.preflightDiagnostics.map((diagnostic, index) => (
                  <span key={index} className="block">
                    {diagnostic.field} · {diagnostic.disposition} · {diagnostic.message}
                  </span>
                ))
              : t('common.none')}
          </p>
        )}
      </dd>
    </div>
  )
}
