import { createFileRoute } from '@tanstack/react-router'

import BossFangSettings from '@renderer/pages/settings/BossFangSettings/BossFangSettings'
export const Route = createFileRoute('/settings/bossfang')({
  component: BossFangSettings,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.focusId === 'string' ? { focusId: search.focusId } : {})
  })
})
