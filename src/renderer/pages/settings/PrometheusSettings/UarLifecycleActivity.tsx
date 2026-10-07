import { useTranslation } from 'react-i18next'

import type { UarDurableInstance } from '@shared/types/uarDurableAdministration'

import { LifecycleEmpty, LifecycleField, LifecycleRecord } from './UarLifecycleRecords'

export function UarLifecycleActivity({ instance }: { instance: UarDurableInstance }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.' + key)
  return (
    <div className="sm:col-span-2" data-ui="uar-lifecycle-activity" data-instance-id={instance.instanceId}>
      <dt className="text-muted-foreground">{tr('lifecycle.detail.activity')}</dt>
      <dd>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            {tr('lifecycle.detail.activity')}
          </summary>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <LifecycleField label={tr('lifecycle.detail.command')}>
              {instance.activeCommandId ?? t('common.none')}
            </LifecycleField>
            <LifecycleField label={tr('durable.restartAttempts')}>{instance.restartAttempts}</LifecycleField>
            <LifecycleField label={tr('durable.nextEventSequence')}>{instance.nextEventSequence}</LifecycleField>
            <LifecycleField label={tr('lifecycle.detail.attempt')}>
              {instance.activeAttemptId === undefined
                ? tr('durable.unknown')
                : (instance.activeAttemptId ?? t('common.none'))}
            </LifecycleField>
            <LifecycleField label={tr('lifecycle.detail.session')}>
              {instance.sessionId ?? tr('durable.unknown')}
            </LifecycleField>
          </dl>
          <div className="mt-4 space-y-3">
            {instance.commands.length === 0 && <LifecycleEmpty />}
            {instance.commands.map((command) => (
              <div key={command.commandId} data-ui="uar-lifecycle-command" data-command-id={command.commandId}>
                <LifecycleRecord
                  id={instance.instanceId + '/' + command.commandId}
                  title={command.commandId}
                  status={
                    command.status === 'completed'
                      ? t('common.completed')
                      : command.status === 'accepted'
                        ? tr('teams.messageStatus.accepted')
                        : tr('teams.execution.status.' + command.status)
                  }>
                  <LifecycleField label={tr('lifecycle.detail.command')}>
                    {tr(command.kind === 'turn' ? 'lifecycle.detail.turn' : 'durable.action.' + command.kind)}
                  </LifecycleField>
                  <LifecycleField label={tr('lifecycle.detail.attempt')}>
                    <span data-ui="uar-lifecycle-attempt" data-attempt-id={command.attemptId ?? ''}>
                      {command.attemptId === undefined
                        ? tr('durable.unknown')
                        : (command.attemptId ?? t('common.none'))}
                    </span>
                  </LifecycleField>
                  <LifecycleField label={tr('lifecycle.detail.rootRun')}>
                    <span data-ui="uar-lifecycle-run" data-run-id={command.rootRunId ?? ''}>
                      {command.rootRunId === undefined
                        ? tr('durable.unknown')
                        : (command.rootRunId ?? t('common.none'))}
                    </span>
                  </LifecycleField>
                  <LifecycleField label={tr('lifecycle.detail.commandTimes')}>
                    {command.acceptedAt ?? tr('durable.unknown')} → {command.updatedAt ?? tr('durable.unknown')}
                  </LifecycleField>
                </LifecycleRecord>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {instance.events === undefined ? (
              <p className="text-xs">{tr('durable.unknown')}</p>
            ) : instance.events.length === 0 ? (
              <LifecycleEmpty />
            ) : (
              instance.events.map((event) => (
                <div key={event.sequence} data-ui="uar-lifecycle-event" data-sequence={event.sequence}>
                  <LifecycleRecord id={instance.instanceId + '/event/' + event.sequence} title={event.kind}>
                    <LifecycleField label={tr('lifecycle.detail.sourceSequence')}>{event.sequence}</LifecycleField>
                    <LifecycleField label={tr('lifecycle.detail.command')}>
                      {event.commandId ?? t('common.none')}
                    </LifecycleField>
                    <LifecycleField label={tr('lifecycle.detail.attempt')}>
                      <span data-ui="uar-lifecycle-attempt" data-attempt-id={event.attemptId ?? ''}>
                        {event.attemptId ?? t('common.none')}
                      </span>
                    </LifecycleField>
                    <LifecycleField label={tr('lifecycle.detail.rootRun')}>
                      <span data-ui="uar-lifecycle-run" data-run-id={event.rootRunId ?? ''}>
                        {event.rootRunId ?? t('common.none')}
                      </span>
                    </LifecycleField>
                    <LifecycleField label={tr('durable.epoch')}>{event.epoch}</LifecycleField>
                    <LifecycleField label={tr('lifecycle.detail.eventCommitted')}>
                      <time dateTime={event.committedAt}>{event.committedAt}</time>
                    </LifecycleField>
                  </LifecycleRecord>
                </div>
              ))
            )}
          </div>
        </details>
      </dd>
    </div>
  )
}
