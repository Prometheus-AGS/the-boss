import { useTranslation } from 'react-i18next'

import { Badge } from '@cherrystudio/ui'
import type { UarTeamApprovalHistory } from '@shared/types/uarApprovalRecords'

const effectStates: Record<string, string> = {
  awaiting_approval: 'awaiting-human',
  claim_intent: 'claimed',
  outcome_unknown: 'outcome-unknown'
}

export function UarTeamApprovalRecord({ record }: { record: UarTeamApprovalHistory }) {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t('work.teams.lifecycle.' + key)
  const fields = [
    [tr('issuer'), record.issuerId],
    [tr('challenge'), record.challengeId],
    [tr('authority'), tr(record.admissionOwner)],
    ...(record.decision
      ? [
          [tr('actor'), record.decision.actor],
          [tr('decision'), record.decision.decisionId]
        ]
      : []),
    [
      tr('effect'),
      record.effectState
        ? t(
            'settings.prometheus.integration.uarAdmin.approvals.state.' +
              (effectStates[record.effectState] ?? record.effectState)
          )
        : tr('noEffect')
    ]
  ]
  return (
    <div
      className="space-y-2"
      data-ui="teams-approval-record"
      data-issuer-id={record.issuerId}
      data-challenge-id={record.challengeId}
      data-state={record.state}
      data-resolvable={record.resolvable}
      data-decision-id={record.decision?.decisionId}
      data-decision-actor={record.decision?.actor}
      data-durable={record.durable}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="break-words text-sm font-medium">{record.toolName}</h3>
        <Badge variant="outline">{tr('state.' + record.state)}</Badge>
      </div>
      <dl className="space-y-1 text-xs">
        {fields.map(([label, value]) => (
          <div key={label} className="break-all">
            <dt className="inline font-medium">{label}: </dt>
            <dd className="inline">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {new Date(record.decision?.decidedAt ?? record.updatedAt).toLocaleString(i18n.language)}
        {' · '}
        {tr(record.durable ? 'durable' : 'volatile')}
      </p>
      {record.state === 'pending' && !record.resolvable && (
        <p className="text-xs text-warning-subtle-foreground" role="status">
          {tr('notResolvable')}
        </p>
      )}
    </div>
  )
}
