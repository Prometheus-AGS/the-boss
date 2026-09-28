import { useTranslation } from 'react-i18next'

import { Badge } from '@cherrystudio/ui'
import { SettingDescription, SettingGroup, SettingTitle } from '@renderer/components/SettingsPrimitives'
import type { UarTeamInstance } from '@shared/types/uarTeams'

export function UarTeamTaskBoard({ instance }: { instance: UarTeamInstance }) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })

  return (
    <SettingGroup>
      <SettingTitle>{tr('taskBoardTitle')}</SettingTitle>
      <SettingDescription>{tr('taskBoardDescription')}</SettingDescription>
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
            </li>
          ))}
        </ol>
      )}
    </SettingGroup>
  )
}
