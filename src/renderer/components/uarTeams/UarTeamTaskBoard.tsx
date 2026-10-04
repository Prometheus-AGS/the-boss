import { useTranslation } from 'react-i18next'

import { Badge } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import type { UarTeamInstance } from '@shared/types/uarTeams'

import { uarTeamError } from './uarTeamError'
import { UarTeamTaskActions } from './UarTeamTaskActions'

interface Props {
  workspaceId: string
  instance: UarTeamInstance
  ownership: boolean
  onChanged: () => Promise<void>
}

export function UarTeamTaskBoard({ workspaceId, instance, ownership, onChanged }: Props) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const memberName = (id: string | null | undefined) => {
    if (!id) return tr('unassigned')
    const member = instance.members.find((candidate) => candidate.id === id)
    return member ? `${member.role} · ${member.ordinal}` : id
  }

  return (
    <SettingGroup data-ui="teams-task-board">
      <SettingTitle>{tr('taskBoardTitle')}</SettingTitle>
      <SettingDescription>{tr('taskBoardDescription')}</SettingDescription>
      <p className="mt-2 text-xs text-muted-foreground">{tr('execution.assignmentHelp')}</p>
      {!ownership && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {tr('ownershipUnavailable')}
        </p>
      )}
      {instance.tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{tr('noTasks')}</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {instance.tasks.map((task) => (
            <li
              key={task.id}
              className="min-w-0 rounded-lg border border-border bg-card p-3"
              data-task-id={task.id}
              data-status={task.status}
              data-role={task.role}
              data-assignee-id={task.assigneeMemberId ?? undefined}
              data-reviewer-id={task.reviewerMemberId ?? undefined}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-medium">{task.title}</h3>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {task.role} · {task.id}
                  </p>
                </div>
                <Badge variant="outline">{tr(`taskStatus.${task.status}`)}</Badge>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">{tr('assignee')}:</dt>
                  <dd className="break-all">{memberName(task.assigneeMemberId)}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">{tr('ownershipEpoch')}:</dt>
                  <dd>{task.ownershipEpoch}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">{tr('reviewer')}:</dt>
                  <dd className="break-all">{memberName(task.reviewerMemberId)}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">{tr('reviewerEpoch')}:</dt>
                  <dd>{task.reviewerEpoch}</dd>
                </div>
              </dl>
              {task.stateReason && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {uarTeamError(task.stateReason, (key) => tr('execution.' + key))}
                </p>
              )}
              <div className="mt-2 text-xs">
                <p className="text-muted-foreground">{tr('dependencies')}:</p>
                {task.dependsOn.length === 0 ? (
                  <p className="mt-1 text-muted-foreground">{tr('none')}</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={tr('dependencies')}>
                    {task.dependsOn.map((id) => {
                      const dependency = instance.tasks.find((candidate) => candidate.id === id)
                      return (
                        <li
                          key={id}
                          className="flex min-w-0 items-center gap-1 rounded-md border border-border px-2 py-1">
                          <span className="min-w-0 break-words">{dependency?.title ?? id}</span>
                          {dependency && <Badge variant="outline">{tr(`taskStatus.${dependency.status}`)}</Badge>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <details className="mt-3 border-t border-border-subtle pt-2 text-xs">
                <summary className="cursor-pointer font-medium focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {tr('taskDetails')}
                </summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="font-medium">{tr('taskInput')}</p>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background-subtle p-2">
                      {JSON.stringify(task.input, null, 2)}
                    </pre>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{tr('outputContract')}</p>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background-subtle p-2">
                      {JSON.stringify(task.outputContract, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
              <UarTeamTaskActions
                workspaceId={workspaceId}
                instance={instance}
                task={task}
                ownership={ownership}
                onChanged={onChanged}
              />
            </li>
          ))}
        </ol>
      )}
    </SettingGroup>
  )
}
