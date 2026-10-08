import { useTranslation } from 'react-i18next'

import type { UarLifecycleSnapshot } from '@shared/types/uarLifecycleAdministration'

import { UarLifecycleActivity } from './UarLifecycleActivity'
import { UarLifecycleBindingPosture } from './UarLifecycleBindingPosture'
import { UarLifecycleObservers } from './UarLifecycleObservers'
import {
  LifecycleEmpty,
  LifecycleField,
  LifecycleRecord,
  LifecycleReference,
  LifecycleSource
} from './UarLifecycleRecords'

export function UarLifecycleDurable({
  data,
  definitionIds,
  bindingIds
}: {
  data: UarLifecycleSnapshot
  definitionIds: Set<string>
  bindingIds: Set<string>
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.' + key)
  const durable = data.durable.data
  return (
    <LifecycleSource title={tr('durable.instancesTitle')} source={data.durable}>
      {durable && (
        <>
          {durable.bindings.map((binding) => (
            <LifecycleRecord
              key={binding.id}
              id={binding.id}
              title={tr('lifecycle.binding') + ' · ' + binding.id}
              status={tr(
                binding.activationSupported ? 'durable.bindingReady' : 'durable.bindingActivationUnavailable'
              )}>
              <LifecycleField label={tr('durable.revision')}>{binding.revision}</LifecycleField>
              {binding.package && (
                <LifecycleField label={tr('lifecycle.definition')}>
                  {binding.package.id} · {binding.package.version} · {binding.package.digest}
                </LifecycleField>
              )}
              <UarLifecycleBindingPosture binding={binding} />
            </LifecycleRecord>
          ))}
          {!durable.capabilities.instances && (
            <p className="text-sm text-muted-foreground">
              {tr('lifecycle.state.unsupported')} · {tr('durable.instancesTitle')}
            </p>
          )}
          {durable.capabilities.instances && durable.instances.length === 0 && <LifecycleEmpty />}
          {durable.instances.map((instance) => (
            <LifecycleRecord
              key={instance.instanceId}
              id={instance.instanceId}
              title={instance.instanceId}
              status={tr('durable.lifecycle.' + instance.lifecycle)}>
              <LifecycleField label={tr('lifecycle.definition')}>
                <LifecycleReference
                  id={instance.definitionId}
                  targetId={instance.definitionId + '@' + instance.definitionVersion}
                  exists={definitionIds.has(instance.definitionId + '@' + instance.definitionVersion)}
                />{' '}
                · {instance.definitionVersion}
              </LifecycleField>
              <LifecycleField label={tr('lifecycle.binding')}>
                <LifecycleReference id={instance.bindingId} exists={bindingIds.has(instance.bindingId)} /> ·{' '}
                {tr('durable.revision')} {instance.bindingRevision}
              </LifecycleField>
              <LifecycleField label={tr('durable.activeRun')}>
                {instance.activeRunId ? (
                  <LifecycleReference
                    id={instance.activeRunId}
                    exists={data.executions.some((source) =>
                      source.data?.attempts.some((attempt) => attempt.runId === instance.activeRunId)
                    )}
                  />
                ) : (
                  t('common.none')
                )}
              </LifecycleField>
              <LifecycleField label={tr('durable.profile')}>{tr('durable.profile.' + instance.profile)}</LifecycleField>
              <LifecycleField label={tr('durable.epoch')}>
                {instance.epoch} · {tr('durable.revision')} {instance.revision}
              </LifecycleField>
              <LifecycleField label={tr('durable.queueDepth')}>{instance.queueDepth}</LifecycleField>
              <LifecycleField label={tr('durable.recoveryGuidance')}>
                {tr('durable.recovery.' + instance.recovery)}
              </LifecycleField>
              {instance.lastErrorCode && (
                <LifecycleField label={tr('durable.lastError')}>{instance.lastErrorCode}</LifecycleField>
              )}
              <UarLifecycleActivity instance={instance} />
            </LifecycleRecord>
          ))}
          <UarLifecycleObservers durable={durable} />
        </>
      )}
    </LifecycleSource>
  )
}
