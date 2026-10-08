import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createServer } from 'node:net'

import { safeStorage } from 'electron'

import { application } from '@application'
import { bossFangConfigSchema, type BossFangConfig } from '@shared/types/bossFang'

export type DashboardCredentials = { username: string; password: string }
export function readConfig(): BossFangConfig {
  return bossFangConfigSchema.parse(
    JSON.parse(application.get('PreferenceService').get('feature.bossfang.configuration'))
  )
}
export function dashboardOrigin(value: string): string {
  const url = new URL(value.trim())
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (!local && url.protocol !== 'https:') ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/', '/dashboard', '/dashboard/'].includes(url.pathname)
  ) {
    throw new Error('Use HTTPS or a loopback HTTP address without embedded credentials, query or fragment')
  }
  return url.origin
}
function credentialPath(ownership: BossFangConfig['ownership']) {
  return application.getPath(
    'feature.agents.bossfang.data',
    ownership === 'managed' ? 'credentials.enc' : 'external-credentials.enc'
  )
}
export function credentialsConfigured(ownership: BossFangConfig['ownership']) {
  return existsSync(credentialPath(ownership))
}
export async function saveCredentials(ownership: BossFangConfig['ownership'], value: DashboardCredentials) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('Secure credential storage is unavailable')
  await fs.mkdir(application.getPath('feature.agents.bossfang.data'), { recursive: true, mode: 0o700 })
  const target = credentialPath(ownership)
  await fs.writeFile(target + '.tmp', await safeStorage.encryptStringAsync(JSON.stringify(value)), { mode: 0o600 })
  await fs.rename(target + '.tmp', target)
}
export async function readCredentials(ownership: BossFangConfig['ownership']): Promise<DashboardCredentials> {
  if (!credentialsConfigured(ownership)) throw new Error('Configure BossFang dashboard credentials in Settings')
  const decrypted = await safeStorage.decryptStringAsync(await fs.readFile(credentialPath(ownership)))
  const value: unknown = JSON.parse(decrypted.result)
  if (
    !value ||
    typeof value !== 'object' ||
    !('username' in value) ||
    !('password' in value) ||
    typeof value.username !== 'string' ||
    typeof value.password !== 'string'
  )
    throw new Error('Stored dashboard credentials are invalid')
  return value as DashboardCredentials
}
export async function resolvePort(config: BossFangConfig): Promise<number> {
  for (let port = config.port; port <= 65535; port++) {
    const available = await new Promise<boolean>((resolve, reject) => {
      const server = createServer()
      server.once('error', (error: NodeJS.ErrnoException) =>
        error.code === 'EADDRINUSE' ? resolve(false) : reject(error)
      )
      server.listen(port, config.host, () => server.close(() => resolve(true)))
    })
    if (available) return port
    if (config.portPolicy === 'fixed')
      throw new Error(
        `BossFang fixed port ${config.port} is already in use; choose another port or automatic selection`
      )
  }
  throw new Error('No available BossFang loopback port remains')
}
