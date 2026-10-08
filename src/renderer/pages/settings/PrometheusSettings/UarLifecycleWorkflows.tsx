import { useTranslation } from 'react-i18next'

import type { UarLifecycleSnapshot } from '@shared/types/uarLifecycleAdministration'

import {
  LifecycleEmpty,
  LifecycleField,
  LifecycleRecord,
  LifecycleReference,
  LifecycleSource
} from './UarLifecycleRecords'

export function UarLifecycleWorkflows({ data, bindingIds }: { data: UarLifecycleSnapshot; bindingIds: Set<string> }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('settings.prometheus.integration.uarAdmin.' + key)
  const workflows = data.workflows.data
  return (
    <LifecycleSource title={tr('workflows.title')} source={data.workflows}>
      {workflows && (
        <div
          data-ui="uar-lifecycle-workflow-execution"
          data-launch-available={workflows.available}
          data-launch-stage={workflows.stage}>
          <p className="text-xs text-muted-foreground">
            {tr('lifecycle.detail.workflowStage')}: {tr('lifecycle.detail.stage.' + workflows.stage)}
          </p>
          {!workflows.available && (
            <p className="mt-2 text-sm text-warning-subtle-foreground" role="status">
              {tr('workflows.unavailable')}
            </p>
          )}
        </div>
      )}
      {!workflows?.definitions.length && !workflows?.runs.length && <LifecycleEmpty />}
      {workflows?.definitions.map((definition) => (
        <div
          key={definition.identity.id + definition.identity.version}
          data-ui="uar-lifecycle-workflow-definition"
          data-definition-id={definition.identity.id}>
          <LifecycleRecord
            id={definition.identity.id + '@' + definition.identity.version}
            title={definition.title}
            status={tr(definition.supported ? 'availability.available' : 'lifecycle.state.unsupported')}>
            <LifecycleField label={tr('lifecycle.definition')}>
              {definition.identity.id} · {definition.identity.version} · {definition.identity.digest}
            </LifecycleField>
            <LifecycleField label={tr('lifecycle.detail.steps')}>
              {definition.steps.map((step) => (
                <p
                  key={step.id}
                  data-ui="uar-lifecycle-workflow-definition-step"
                  data-definition-id={definition.identity.id}
                  data-step-id={step.id}>
                  {step.id} · {step.role}
                </p>
              ))}
            </LifecycleField>
            {definition.diagnostics.length > 0 && (
              <LifecycleField label={tr('durable.lastError')}>
                {definition.diagnostics.map((item) => (
                  <p key={item.field + item.code}>
                    {item.field} · {item.code} · {item.message}
                  </p>
                ))}
              </LifecycleField>
            )}
          </LifecycleRecord>
        </div>
      ))}
      {workflows?.runs.map((run) => (
        <LifecycleRecord
          key={run.id}
          id={run.id}
          title={run.id}
          status={tr(
            ['awaiting_decision', 'reconciling', 'accepted', 'rejected'].includes(run.status)
              ? 'workflows.' + run.status
              : run.status === 'ready'
                ? 'teams.taskStatus.ready'
                : 'teams.execution.status.' + run.status
          )}>
          <LifecycleField label={tr('lifecycle.team')}>
            <LifecycleReference
              id={run.teamId}
              exists={Boolean(data.teams.data?.instances.some((team) => team.id === run.teamId))}
            />
          </LifecycleField>
          <LifecycleField label={tr('lifecycle.definition')}>
            <LifecycleReference
              id={run.definition.id}
              targetId={run.definition.id + '@' + run.definition.version}
              exists={Boolean(
                workflows.definitions.some(
                  (definition) =>
                    definition.identity.id === run.definition.id &&
                    definition.identity.version === run.definition.version &&
                    definition.identity.digest === run.definition.digest
                )
              )}
            />{' '}
            · {run.definition.version}
          </LifecycleField>
          <LifecycleField label={tr('lifecycle.binding')}>
            <LifecycleReference id={run.binding.id} exists={bindingIds.has(run.binding.id)} /> ·{' '}
            {tr('durable.revision')} {run.binding.revision}
          </LifecycleField>
          <LifecycleField label={tr('lifecycle.detail.timestamps')}>
            <time dateTime={run.createdAt}>{run.createdAt}</time> →{' '}
            <time dateTime={run.updatedAt}>{run.updatedAt}</time>
          </LifecycleField>
          {run.stateReason && <LifecycleField label={tr('durable.lastError')}>{run.stateReason}</LifecycleField>}
          <div className="sm:col-span-2">
            <dt className="mb-2 text-muted-foreground">{tr('lifecycle.detail.steps')}</dt>
            <dd className="space-y-3">
              {run.steps.map((step) => {
                const attempt = data.executions
                  .find((execution) => execution.teamInstanceId === run.teamId)
                  ?.data?.attempts.find((item) => item.id === step.attemptId)
                return (
                  <div
                    key={step.stepId}
                    data-ui="uar-lifecycle-workflow-step"
                    data-workflow-run-id={run.id}
                    data-step-id={step.stepId}
                    data-task-id={step.taskId}
                    data-attempt-id={step.attemptId ?? ''}>
                    <LifecycleRecord
                      id={run.id + '/' + step.stepId}
                      title={step.stepId}
                      status={t('settings.prometheus.integration.uarAdmin.teams.taskStatus.' + step.status, {
                        defaultValue: step.status
                      })}>
                      <LifecycleField label={tr('teams.taskTitle')}>
                        <LifecycleReference
                          id={step.taskId}
                          targetId={run.teamId + '/' + step.taskId}
                          exists={Boolean(
                            data.teams.data?.instances.some(
                              (team) => team.id === run.teamId && team.tasks.some((task) => task.id === step.taskId)
                            )
                          )}
                        />
                      </LifecycleField>
                      <LifecycleField label={tr('teams.assignee')}>
                        {step.memberId} · {tr('durable.revision')} {step.memberRevision}
                      </LifecycleField>
                      <LifecycleField label={tr('lifecycle.detail.attempt')}>
                        {step.attemptId ? (
                          <LifecycleReference
                            id={step.attemptId}
                            targetId={attempt?.runId ?? step.attemptId}
                            exists={Boolean(attempt)}
                          />
                        ) : (
                          t('common.none')
                        )}
                      </LifecycleField>
                      <LifecycleField label={tr('lifecycle.definition')}>
                        {step.memberDefinition.id} · {step.memberDefinition.version}
                      </LifecycleField>
                      {step.artifact && (
                        <LifecycleField label={tr('teams.cooperation.source.artifact')}>
                          {step.artifact.id} · {step.artifact.digest} · {tr('lifecycle.detail.attempt')}:{' '}
                          {step.artifact.attemptId}
                        </LifecycleField>
                      )}
                    </LifecycleRecord>
                  </div>
                )
              })}
            </dd>
          </div>
        </LifecycleRecord>
      ))}
    </LifecycleSource>
  )
}
