import { useTranslation } from 'react-i18next'

import type { UarDurableWorkspaceSnapshot } from '@shared/types/uarDurableAdministration'

import { LifecycleEmpty, LifecycleField, LifecycleRecord, LifecycleReference } from './UarLifecycleRecords'

export function UarLifecycleObservers({ durable }: { durable: UarDurableWorkspaceSnapshot }) {
  const { t } = useTranslation()
  const tr = (key: string, options?: Record<string, unknown>) =>
    t('settings.prometheus.integration.uarAdmin.' + key, options)
  return (
    <>
      <h3 className="pt-2 text-sm font-medium">{tr('durable.observersTitle')}</h3>
      {!durable.capabilities.observers && (
        <p className="text-sm text-muted-foreground">{tr('lifecycle.state.unsupported')}</p>
      )}
      {durable.capabilities.observers && durable.observers.length === 0 && <LifecycleEmpty />}
      {durable.observers.map((observer) => (
        <LifecycleRecord
          key={observer.subscriptionId}
          id={observer.subscriptionId}
          title={observer.subscriptionId}
          status={tr(observer.revoked ? 'durable.revoked' : observer.paused ? 'durable.paused' : 'durable.active')}>
          <LifecycleField label={tr('durable.observerInstance')}>
            <LifecycleReference
              id={observer.observerInstanceId}
              exists={durable.instances.some((instance) => instance.instanceId === observer.observerInstanceId)}
            />
          </LifecycleField>
          <LifecycleField label={tr('durable.backlogDepth')}>
            {observer.backlogDepth} · {tr('durable.deadLetters')}: {observer.deadLetterCount}
          </LifecycleField>
          {observer.sources.map((source) => (
            <div
              key={source.sourceInstanceId}
              data-ui="uar-lifecycle-observer-progress"
              data-source-instance-id={source.sourceInstanceId}>
              <LifecycleField label={tr('durable.sourceProgress')}>
                <LifecycleReference
                  id={source.sourceInstanceId}
                  exists={durable.instances.some((instance) => instance.instanceId === source.sourceInstanceId)}
                />
                <br />
                {tr('durable.cursor')}: {source.cursor ?? tr('durable.unknown')} · {tr('durable.sourceHigh')}:{' '}
                {source.sourceHigh ?? tr('durable.unknown')}
                <br />
                {tr('lifecycle.detail.sequenceDistance')}: {source.sequenceDistance ?? tr('durable.unknown')} ·{' '}
                {tr('durable.retainedLow')}: {source.retainedLow ?? tr('durable.unknown')}
                <p className="mt-1 text-muted-foreground">{tr('lifecycle.detail.sequenceDistanceHelp')}</p>
                {source.retentionGap && (
                  <p className="mt-1 text-warning-subtle-foreground">{tr('durable.retentionGaps')}</p>
                )}
              </LifecycleField>
            </div>
          ))}
          <LifecycleField label={tr('durable.retentionGaps')}>
            {observer.gaps.length === 0
              ? t('common.none')
              : observer.gaps.map((gap) => (
                  <p key={gap.sourceInstanceId + ':' + gap.missingFrom}>
                    {gap.sourceInstanceId} · {gap.missingFrom}–{gap.missingThrough} ·{' '}
                    {gap.acknowledgedAt ? tr('durable.acknowledged') : tr('durable.recoveryGuidance')}
                    <br />
                    {tr('lifecycle.detail.gapTimes')}: <time dateTime={gap.detectedAt}>{gap.detectedAt}</time> →{' '}
                    {gap.acknowledgedAt ? (
                      <time dateTime={gap.acknowledgedAt}>{gap.acknowledgedAt}</time>
                    ) : (
                      t('common.none')
                    )}
                  </p>
                ))}
          </LifecycleField>
          <div
            className="sm:col-span-2"
            data-ui="uar-lifecycle-observer-deliveries"
            data-subscription-id={observer.subscriptionId}>
            <dt className="mb-2 text-muted-foreground">{tr('lifecycle.detail.deliveries')}</dt>
            <dd>
              <p className="mb-3 text-xs text-muted-foreground">{tr('lifecycle.detail.deliveryMeaning')}</p>
              <dl className="mb-3 grid gap-3 text-xs sm:grid-cols-2">
                <LifecycleField label={tr('lifecycle.detail.retryLimit')}>
                  {observer.limits?.maxRetries ?? tr('durable.unknown')}
                </LifecycleField>
                <LifecycleField label={tr('lifecycle.detail.timestamps')}>
                  {observer.createdAt ?? tr('durable.unknown')} → {observer.updatedAt ?? tr('durable.unknown')}
                </LifecycleField>
              </dl>
              {!observer.deliveries ? (
                <p>{tr('durable.unknown')}</p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {tr('lifecycle.detail.deliveryWindow', {
                      shown: observer.deliveries.records.length,
                      total: observer.deliveries.totalRetained
                    })}
                  </p>
                  {observer.deliveries.records.length === 0 && <LifecycleEmpty />}
                  {observer.deliveries.records.map((delivery) => (
                    <div
                      key={delivery.occurrenceId}
                      data-ui="uar-lifecycle-observer-delivery"
                      data-subscription-id={observer.subscriptionId}
                      data-delivery-id={delivery.occurrenceId}>
                      <LifecycleRecord
                        id={observer.subscriptionId + '/' + delivery.occurrenceId}
                        title={delivery.occurrenceId}
                        status={tr(
                          delivery.status === 'admitted'
                            ? 'lifecycle.detail.admitted'
                            : delivery.status === 'acknowledged'
                              ? 'durable.acknowledged'
                              : delivery.status === 'retry'
                                ? 'retry'
                                : 'durable.deadLetters'
                        )}>
                        <LifecycleField label={tr('durable.sourceInstances')}>
                          {delivery.sourceInstanceId}
                        </LifecycleField>
                        <LifecycleField label={tr('lifecycle.detail.sourceSequence')}>
                          {delivery.sourceSequence}
                        </LifecycleField>
                        <LifecycleField label={tr('lifecycle.detail.command')}>
                          {delivery.observerCommandId ?? t('common.none')}
                        </LifecycleField>
                        <LifecycleField label={tr('lifecycle.detail.attemptCount')}>{delivery.attempts}</LifecycleField>
                        <LifecycleField label={tr('durable.lastError')}>
                          {delivery.lastErrorCode ?? t('common.none')}
                        </LifecycleField>
                        <LifecycleField label={tr('lifecycle.detail.deliveryTimes')}>
                          <time dateTime={delivery.admittedAt}>{delivery.admittedAt}</time> →{' '}
                          <time dateTime={delivery.updatedAt}>{delivery.updatedAt}</time>
                        </LifecycleField>
                      </LifecycleRecord>
                    </div>
                  ))}
                </>
              )}
            </dd>
          </div>
          {observer.recoveryActions.length > 0 && (
            <LifecycleField label={tr('durable.recoveryGuidance')}>
              {observer.recoveryActions.map((action) => (
                <p key={action}>
                  {t('settings.prometheus.integration.uarAdmin.durable.recoveryAction.' + action, {
                    defaultValue: action
                  })}
                </p>
              ))}
            </LifecycleField>
          )}
        </LifecycleRecord>
      ))}
    </>
  )
}
