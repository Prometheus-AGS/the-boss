import fs from 'node:fs/promises'

import { application } from '@application'
import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import { t } from '@main/i18n'
import type { BossFangConfig } from '@shared/types/bossFang'

import { saveConfig } from './storage'

export async function ensurePersonalWorkspace(config: BossFangConfig): Promise<BossFangConfig> {
  if (config.workspaceId) {
    agentWorkspaceService.getById(config.workspaceId)
    return config
  }
  const directory = application.getPath('feature.agents.bossfang.personal_workspace')
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.chmod(directory, 0o700)
  const workspace = agentWorkspaceService.findOrCreateByPath(directory, { name: t('bossfang.personalWorkspace') })
  const selected = { ...config, workspaceId: workspace.id }
  await saveConfig(selected)
  return selected
}
