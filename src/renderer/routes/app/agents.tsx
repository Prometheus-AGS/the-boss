import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@cherrystudio/ui'
import AgentPage from '@renderer/pages/agents/AgentPage'
import { parseAgentRouteSearch } from '@renderer/pages/agents/routeSearch'
import { TeamsWorkPage } from '@renderer/pages/teams/TeamsWorkPage'
import { resolveAgentEntrySessionId, resolveAgentEntrySessionIdForAgent } from '@renderer/utils/conversationEntry'

export const Route = createFileRoute('/app/agents')({
  validateSearch: (search) => parseAgentRouteSearch(search),
  // Resolving before mount renders the final conversation in one pass. A sidebar
  // `?agentId=` entry must resume that agent, not the globally last-focused session.
  beforeLoad: async ({ search }) => {
    if (search.mode === 'teams' || search.sessionId || search.intent) return
    if (search.agentId) {
      const sessionId = await resolveAgentEntrySessionIdForAgent(search.agentId)
      if (sessionId) throw redirect({ to: '/app/agents', search: { sessionId }, replace: true })
      return
    }
    const sessionId = await resolveAgentEntrySessionId()
    if (sessionId) throw redirect({ to: '/app/agents', search: { sessionId }, replace: true })
  },
  component: WorkPage
})

function WorkPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const teams = search.mode === 'teams'
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-ui="work-view">
      <nav className="flex flex-wrap gap-2 border-b border-border-subtle px-4 py-2" aria-label={t('work.teams.mode')}>
        <Button
          size="sm"
          variant={teams ? 'ghost' : 'secondary'}
          aria-pressed={!teams}
          data-ui="work-mode-agent"
          onClick={() =>
            void navigate({ to: '/app/agents', search: { agentId: search.agentId, sessionId: search.sessionId } })
          }>
          {t('work.teams.agent')}
        </Button>
        <Button
          size="sm"
          variant={teams ? 'secondary' : 'ghost'}
          aria-pressed={teams}
          data-ui="work-mode-teams"
          onClick={() => void navigate({ to: '/app/agents', search: { ...search, mode: 'teams' } })}>
          {t('work.teams.title')}
        </Button>
      </nav>
      {teams ? (
        <TeamsWorkPage
          workspaceId={search.workspaceId}
          teamInstanceId={search.teamInstanceId}
          onSelectionChange={(workspaceId, teamInstanceId) =>
            void navigate({
              to: '/app/agents',
              search: { ...search, mode: 'teams', workspaceId, teamInstanceId },
              replace: true
            })
          }
        />
      ) : (
        <AgentPage />
      )}
    </div>
  )
}
