import { useTranslation } from 'react-i18next'

import type { UarLifecycleSnapshot } from '@shared/types/uarLifecycleAdministration'

import {
  LifecycleEmpty,
  LifecycleField,
  LifecycleRecord,
  LifecycleReference,
  LifecycleSource
} from './UarLifecycleRecords'

export function UarLifecycleExecutions({ snapshot }: { snapshot: UarLifecycleSnapshot }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.' + key)
  const executions = snapshot.executions
  return (
    <>
      {executions.map((source) => (
        <LifecycleSource
          key={source.teamInstanceId}
          title={tr('teams.execution.title') + ' · ' + source.teamInstanceId}
          source={source}>
          {source.data && (
            <>
              <dl className="grid gap-3 text-xs sm:grid-cols-3">
                {(['tokens', 'costMicrounits', 'elapsedSeconds'] as const).map((metric) => (
                  <LifecycleField key={metric} label={tr('teams.execution.' + metric)}>
                    {tr('teams.execution.committed')}: {source.data!.committed[metric]}
                    <br />
                    {tr('teams.execution.reserved')}: {source.data!.reserved[metric]}
                    <br />
                    {tr('lifecycle.budgetLimit')}:{' '}
                    {metric === 'tokens'
                      ? source.data!.budget.maxTokens
                      : metric === 'costMicrounits'
                        ? source.data!.budget.maxCostMicrounits
                        : source.data!.budget.maxElapsedSeconds}
                    {metric === 'costMicrounits' && ' · ' + source.data!.budget.currency}
                  </LifecycleField>
                ))}
              </dl>
              {source.data.uncertainAttempts.length > 0 && (
                <p className="break-words text-sm text-warning-subtle-foreground" role="status">
                  {tr('teams.execution.status.uncertain')} · {source.data.uncertainAttempts.join(', ')}
                  <br />
                  {tr('approvals.interruptedAction')}
                </p>
              )}
              {source.data.attempts.length === 0 && <LifecycleEmpty />}
              {source.data.attempts.map((attempt) => (
                <LifecycleRecord
                  key={attempt.id}
                  id={attempt.runId}
                  title={attempt.runId}
                  status={tr('teams.execution.status.' + attempt.status)}>
                  <LifecycleField label={tr('lifecycle.team')}>
                    <LifecycleReference
                      id={source.teamInstanceId}
                      exists={Boolean(snapshot.teams.data?.instances.some((team) => team.id === source.teamInstanceId))}
                    />
                  </LifecycleField>
                  <LifecycleField label={tr('teams.taskTitle')}>
                    <LifecycleReference
                      id={attempt.taskId}
                      targetId={source.teamInstanceId + '/' + attempt.taskId}
                      exists={Boolean(
                        snapshot.teams.data?.instances.some((team) =>
                          team.tasks.some((task) => task.id === attempt.taskId)
                        )
                      )}
                    />
                  </LifecycleField>
                  <LifecycleField label={tr('teams.assignee')}>{attempt.memberId}</LifecycleField>
                  <LifecycleField label={tr('durable.epoch')}>{attempt.executionEpoch}</LifecycleField>
                  {(['tokens', 'costMicrounits', 'elapsedSeconds'] as const).map((metric) => (
                    <LifecycleField key={metric} label={tr('teams.execution.' + metric)}>
                      {tr('teams.execution.committed')}: {attempt.usage?.[metric] ?? tr('durable.unknown')}
                      <br />
                      {tr('teams.execution.reserved')}: {attempt.reservation[metric]}
                      {metric === 'costMicrounits' && ' · ' + source.data!.budget.currency}
                    </LifecycleField>
                  ))}
                  <LifecycleField label={tr('lifecycle.accounting')}>
                    {attempt.accountingState
                      ? tr('lifecycle.accounting.' + attempt.accountingState)
                      : tr('durable.unknown')}
                  </LifecycleField>
                  {attempt.effectiveModels?.map((model, index) => (
                    <LifecycleField key={index} label={tr('teams.execution.model')}>
                      {model.route.providerId} / {model.route.modelId}
                    </LifecycleField>
                  ))}
                  {attempt.stateReason && (
                    <LifecycleField label={tr('durable.lastError')}>{attempt.stateReason}</LifecycleField>
                  )}
                  {attempt.diagnostic && (
                    <LifecycleField label={tr('durable.lastError')}>
                      {attempt.diagnostic.category} · {attempt.diagnostic.code}
                    </LifecycleField>
                  )}
                </LifecycleRecord>
              ))}
            </>
          )}
        </LifecycleSource>
      ))}
    </>
  )
}
