import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import type { UarTeamContextReceipt, UarTargetOutcome } from '@shared/types/uarTeamContext'

import { uarTeamError } from './uarTeamError'

export function UarTeamOutcomes({ outcomes }: { outcomes: UarTargetOutcome[] }) {
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  return (
    <ul className="mt-2 space-y-2">
      {outcomes.map((outcome) => (
        <li key={outcome.taskId} className="min-w-0 text-xs">
          <span className="break-all">{outcome.taskId}</span>
          {' · '}
          <Badge variant="outline">{tr('execution.status.' + outcome.executionOutcome)}</Badge>
          <p className="mt-1 break-all text-muted-foreground">
            {tr('cooperation.fromMember', { member: outcome.memberId })} · {outcome.attemptId}
          </p>
          <p className="mt-1 text-muted-foreground">
            {tr('cooperation.artifactCount', { count: outcome.artifactIds.length })}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function UarTeamContextView({
  workspaceId,
  teamInstanceId,
  attemptId
}: {
  workspaceId: string
  teamInstanceId: string
  attemptId: string
}) {
  const { t, i18n } = useTranslation()
  const { t: tr } = useTranslation(undefined, { keyPrefix: 'settings.prometheus.integration.uarAdmin.teams' })
  const [receipt, setReceipt] = useState<UarTeamContextReceipt>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const inspect = async () => {
    setBusy(true)
    setError(undefined)
    setReceipt(undefined)
    try {
      setReceipt(await ipcApi.request('prometheus.uar.teams.context', { workspaceId, teamInstanceId, attemptId }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const number = (value: number) => value.toLocaleString(i18n.language)
  return (
    <div className="mt-3 border-t border-border-subtle pt-3" data-ui="uar-team-context">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void inspect()}>
        {busy ? t('common.loading') : tr('cooperation.inspectContext')}
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">{tr('cooperation.contextHelp')}</p>
      {error && (
        <p className="mt-2 break-words text-xs text-error" role="alert">
          {uarTeamError(error, (key) => tr('execution.' + key))}
        </p>
      )}
      {receipt && (
        <div className="mt-3 space-y-4">
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-medium">{tr('cooperation.self')}</dt>
              <dd className="break-all">
                {receipt.self.label} · {receipt.self.memberId}
              </dd>
            </div>
            <div>
              <dt className="font-medium">{tr('cooperation.coordinator')}</dt>
              <dd className="break-all">{receipt.coordinatorMemberId}</dd>
            </div>
            <div>
              <dt className="font-medium">{tr('cooperation.authorizationRevision')}</dt>
              <dd>{number(receipt.authorizationRevision)}</dd>
            </div>
            <div>
              <dt className="font-medium">{tr('cooperation.contextBudget')}</dt>
              <dd>
                {number(receipt.contextBudgetTokens)} · {tr('cooperation.count.' + receipt.countQuality)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">{tr('cooperation.root')}</dt>
              <dd className="break-all">{receipt.rootId}</dd>
            </div>
            <div>
              <dt className="font-medium">{tr('cooperation.approvalScope')}</dt>
              <dd className="break-all">{receipt.approvalScopeId}</dd>
            </div>
          </dl>
          <div>
            <h5 className="text-sm font-medium">{tr('cooperation.guidance')}</h5>
            <p className="mt-1 text-xs text-muted-foreground">{tr('cooperation.precedence')}</p>
            {receipt.teamInstructions ? (
              <>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {tr('revision')} {receipt.teamInstructions.revision} · {receipt.teamInstructions.digest}
                </p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background-subtle p-2 text-xs">
                  {receipt.teamInstructions.text}
                </pre>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{tr('cooperation.noGuidance')}</p>
            )}
          </div>
          <div>
            <h5 className="text-sm font-medium">{tr('cooperation.roster')}</h5>
            <p className="mt-1 text-xs text-muted-foreground">{tr('cooperation.rosterHelp')}</p>
            <ul className="mt-2 divide-y divide-border-subtle">
              {receipt.roster.map((member) => (
                <li key={member.memberId} className="min-w-0 py-2 text-xs">
                  <p className="font-medium">
                    {member.label} · {member.role}
                  </p>
                  <p className="break-all text-muted-foreground">{member.memberId}</p>
                  <p className="mt-1 break-words text-muted-foreground">
                    {member.safeCapabilities.length
                      ? member.safeCapabilities.join(', ')
                      : tr('cooperation.noCapabilities')}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {tr('cooperation.selections')}
            </summary>
            <ul className="mt-2 divide-y divide-border-subtle">
              {receipt.selections.map((selection, index) => (
                <li key={index} className="min-w-0 py-2">
                  <p className="break-all">
                    {tr('cooperation.source.' + selection.sourceKind)} · {selection.sourceId}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {tr('cooperation.selection.' + selection.disposition)} ·{' '}
                    {tr('cooperation.bytes', {
                      selected: number(selection.selectedBytes),
                      original: number(selection.originalBytes)
                    })}
                    {selection.truncated ? ' · ' + tr('cooperation.truncated') : ''}
                  </p>
                  {selection.reasonCode && (
                    <p className="mt-1 break-words text-muted-foreground">
                      {uarTeamError(selection.reasonCode, (key) => tr('execution.' + key))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
          {receipt.targetOutcomes.length > 0 && (
            <div>
              <h5 className="text-sm font-medium">{tr('cooperation.targetOutcomes')}</h5>
              <p className="mt-1 text-xs text-muted-foreground">{tr('cooperation.untrustedData')}</p>
              <UarTeamOutcomes outcomes={receipt.targetOutcomes} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
