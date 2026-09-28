import { useTranslation } from 'react-i18next'

import { Badge } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import type { UarTeamInstance } from '@shared/types/uarTeams'

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
    <SettingGroup>
      <SettingTitle>{tr('taskBoardTitle')}</SettingTitle>
      <SettingDescription>{tr('taskBoardDescription')}</SettingDescription>
      <p className="mt-2 text-xs text-muted-foreground">{tr('planningOnly')}</p>
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
            <li key={task.id} className="min-w-0 rounded-lg border border-border bg-card p-3">
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
              {task.stateReason && <p className="mt-2 text-xs text-muted-foreground">{task.stateReason}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {tr('dependencies')}:{' '}
                {task.dependsOn.length
                  ? task.dependsOn
                      .map((id) => instance.tasks.find((candidate) => candidate.id === id)?.title ?? id)
                      .join(', ')
                  : tr('none')}
              </p>
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
