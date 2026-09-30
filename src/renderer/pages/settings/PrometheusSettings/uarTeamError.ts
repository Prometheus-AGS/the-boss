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
  TEAM_PROVIDER_REQUEST_REJECTED: 'provider',
  TEAM_PROVIDER_STREAM_FAILED: 'provider',
  TEAM_BUDGET_EXHAUSTED: 'budget',
  TEAM_PENDING_LIMIT: 'budget',
  TEAM_CONTEXT_REQUIRED_UNSUPPORTED: 'context',
  TEAM_CONTEXT_REQUIRED_TOO_LARGE: 'context',
  TEAM_FIT_UNQUALIFIED: 'context'
}

export function uarTeamError(message: string, translate: (key: string) => string): string {
  const code = message.match(/TEAM_[A-Z_]+/)?.[0]
  return code ? translate('diagnostic.' + (reasons[code] ?? 'other')) + ' (' + code + ')' : message
}
