import type { UarTeamDiagnostic } from '@shared/types/uarTeamProfiles'

const reasons: Record<string, string> = {
  TEAM_PROFILE_UNSUPPORTED: 'profile',
  TEAM_CAPABILITY_UNSUPPORTED: 'profile',
  TEAM_ROUTE_PROFILE_MISMATCH: 'profile',
  TEAM_REASONING_UNSUPPORTED: 'reasoning',
  TEAM_REVISION_CONFLICT: 'revision',
  TEAM_EXECUTION_OWNER_CONFLICT: 'owner',
  TEAM_EXECUTION_EPOCH_STALE: 'owner',
  TEAM_RECLAIM_UNAUTHORIZED: 'authorization',
  TEAM_SCOPE_DENIED: 'authorization',
  TEAM_EDGE_DENIED: 'authorization',
  TEAM_RECLAIM_EVIDENCE_REQUIRED: 'evidence',
  TEAM_EFFECTS_UNCERTAIN: 'evidence',
  TEAM_COLLABORATION_HANDOFF_FAILED: 'handoff',
  TEAM_REQUEST_PREPARATION_FAILED: 'preparation',
  TEAM_PROVIDER_REQUEST_REJECTED: 'provider',
  TEAM_PROVIDER_STREAM_FAILED: 'provider',
  TEAM_BUDGET_EXHAUSTED: 'budget',
  TEAM_EXECUTION_BUDGET_FAILED: 'executionBudget',
  TEAM_PENDING_LIMIT: 'budget',
  TEAM_CONTEXT_REQUIRED_UNSUPPORTED: 'context',
  TEAM_CONTEXT_REQUIRED_TOO_LARGE: 'context',
  TEAM_HOST_CONTEXT_REQUIRED: 'hostContext',
  TEAM_WORKSPACE_DENIED: 'workspace',
  TEAM_FIT_UNQUALIFIED: 'context',
  TEAM_WAIT_CYCLE: 'wait',
  TEAM_WAIT_INVALIDATED: 'wait',
  TEAM_COMMAND_CONFLICT: 'revision',
  UAR_APPROVAL_STALE: 'approvalStale'
}

export function uarTeamError(
  message: string,
  translate: (key: string) => string,
  sourceStage?: UarTeamDiagnostic['sourceStage']
): string {
  const code = message.match(/TEAM_[A-Z_]+|UAR_APPROVAL_STALE/)?.[0]
  const stageReason =
    code && ['TEAM_PROVIDER_REQUEST_REJECTED', 'TEAM_PROVIDER_STREAM_FAILED'].includes(code)
      ? sourceStage === 'request-preparation'
        ? 'preparation'
        : sourceStage === 'handoff-validation' || sourceStage === 'handoff-recording'
          ? 'handoff'
          : undefined
      : undefined
  return code ? translate('diagnostic.' + (stageReason ?? reasons[code] ?? 'other')) + ' (' + code + ')' : message
}

export function uarTeamAuthoringError(message: string, translate: (key: string) => string): string {
  const code = message.match(/UAR_TEAM_MODEL_POLICY_(ISSUANCE_MISMATCH|REIMPORT_REQUIRED)/)?.[0]
  if (!code) return message
  const key = code === 'UAR_TEAM_MODEL_POLICY_ISSUANCE_MISMATCH' ? 'issuanceMismatch' : 'reimportRequired'
  return translate('modelPolicy.' + key) + ' (' + code + ')'
}
