export type AgentRouteSearch = {
  mode?: 'teams'
  workspaceId?: string
  teamInstanceId?: string
  agentId?: string
  intent?: 'feedback' | 'skill'
  sessionId?: string
  forkReturnSessionId?: string
  skillId?: string
}

export function parseAgentRouteSearch(search: Record<string, unknown>): AgentRouteSearch {
  const agentId = typeof search.agentId === 'string' ? search.agentId : undefined
  const intent = search.intent === 'feedback' || search.intent === 'skill' ? search.intent : undefined
  const sessionId = typeof search.sessionId === 'string' ? search.sessionId : undefined
  const forkReturnSessionId = typeof search.forkReturnSessionId === 'string' ? search.forkReturnSessionId : undefined
  const skillId = intent === 'skill' && typeof search.skillId === 'string' ? search.skillId : undefined

  return {
    ...(search.mode === 'teams'
      ? {
          mode: 'teams' as const,
          ...(typeof search.workspaceId === 'string' ? { workspaceId: search.workspaceId } : {}),
          ...(typeof search.teamInstanceId === 'string' ? { teamInstanceId: search.teamInstanceId } : {})
        }
      : {}),
    agentId,
    intent,
    sessionId,
    ...(forkReturnSessionId ? { forkReturnSessionId } : {}),
    ...(skillId ? { skillId } : {})
  }
}
