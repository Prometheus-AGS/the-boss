import type { SettingsSearchEntry } from '../settingsSearch/types'
export const route = '/settings/bossfang'
export const entries: SettingsSearchEntry[] = [
  {
    anchorId: 'process',
    titleKey: 'bossfang.process',
    aliases: ['BossFang', 'dashboard', 'port', 'managed', 'external', 'restart']
  },
  { anchorId: 'credentials', titleKey: 'bossfang.credentials', aliases: ['username', 'password', 'authentication'] },
  {
    anchorId: 'connection',
    titleKey: 'bossfang.uarConnection',
    aliases: ['UAR', 'instance', 'workspace', 'delegation', 'grant']
  },
  {
    anchorId: 'diagnostics',
    titleKey: 'bossfang.diagnostics',
    aliases: ['model', 'stream', 'run', 'tokens', 'logs', 'export']
  }
]
