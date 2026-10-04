import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'

import { Mutex } from 'async-mutex'
import { safeStorage } from 'electron'

import { application } from '@application'
import { loggerService } from '@logger'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { isWin } from '@main/core/platform'
import { toAsarUnpackedPath } from '@main/utils/asar'
import { crossPlatformSpawn, terminateProcessTree, waitForProcessExit } from '@main/utils/processRunner'
import { redactSecretText } from '@shared/utils/redaction'

const logger = loggerService.withContext('BossFangService')
const HOST = '127.0.0.1'
const START_TIMEOUT_MS = 120_000

type Credentials = { username: string; password: string }
type Status = 'stopped' | 'starting' | 'running' | 'error'
type Ownership = 'managed' | 'external'

function externalDashboardUrl(value: string): string {
  const endpoint = new URL(value.trim())
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if (
    !local ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !['', '/', '/dashboard', '/dashboard/'].includes(endpoint.pathname)
  ) {
    throw new Error('Use a loopback HTTP or HTTPS address without credentials, query, or fragment')
  }
  return `${endpoint.origin}/dashboard/`
}

@Injectable('BossFangService')
@ServicePhase(Phase.WhenReady)
export class BossFangService extends BaseService {
  private readonly mutex = new Mutex()
  private child: ChildProcess | null = null
  private status: Status = 'stopped'
  private url: string | undefined

  protected async onStop(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.stopOwnedProcess()
      this.status = 'stopped'
      this.url = undefined
    })
  }

  async getStatus(): Promise<{ status: Status; ownership: Ownership; configured: boolean; url?: string }> {
    return this.mutex.runExclusive(async () => {
      const ownership = this.getOwnership()
      if (ownership === 'external') {
        await this.stopOwnedProcess()
        await this.refreshExternalStatus()
      } else if (!this.child) {
        this.status = 'stopped'
        this.url = undefined
      }
      const configured =
        ownership === 'external'
          ? Boolean(application.get('PreferenceService').get('feature.bossfang.external_endpoint').trim())
          : existsSync(application.getPath('feature.agents.bossfang.data', 'credentials.enc'))
      return {
        status: this.status,
        ownership,
        configured,
        ...(this.url ? { url: this.url } : {})
      }
    })
  }

  getDashboardOrigin(): string | undefined {
    if (this.status !== 'running' || !this.url) return undefined
    if (this.getOwnership() === 'managed') return this.child ? new URL(this.url).origin : undefined
    try {
      return this.url ===
        externalDashboardUrl(application.get('PreferenceService').get('feature.bossfang.external_endpoint'))
        ? new URL(this.url).origin
        : undefined
    } catch {
      return undefined
    }
  }

  async configureCredentials(credentials: Credentials): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.getOwnership() === 'external')
        throw new Error('External BossFang credentials belong in its own dashboard')
      const directory = application.getPath('feature.agents.bossfang.data')
      const target = application.getPath('feature.agents.bossfang.data', 'credentials.enc')
      if (existsSync(target)) {
        throw new Error('BossFang credentials are already configured; update them in the native dashboard')
      }
      if (this.child) await this.stopOwnedProcess()
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw new Error('Secure credential storage is unavailable')
      }
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      await fs.writeFile(`${target}.tmp`, await safeStorage.encryptStringAsync(JSON.stringify(credentials)), {
        mode: 0o600
      })
      await fs.rename(`${target}.tmp`, target)
      this.status = 'stopped'
      this.url = undefined
    })
  }

  async configureExternalEndpoint(endpoint: string): Promise<void> {
    const normalized = endpoint.trim() ? new URL(externalDashboardUrl(endpoint)).origin : ''
    await application.get('PreferenceService').set('feature.bossfang.external_endpoint', normalized)
  }

  async start(): Promise<
    | { success: true; url: string }
    | {
        success: false
        reason: 'not_installed' | 'credentials_required' | 'startup_failed' | 'external_unavailable'
        message: string
      }
  > {
    return this.mutex.runExclusive(async () => {
      if (this.getOwnership() === 'external') {
        await this.stopOwnedProcess()
        try {
          const endpoint = application.get('PreferenceService').get('feature.bossfang.external_endpoint')
          if (!endpoint.trim()) throw new Error('Set an external BossFang endpoint in Settings')
          const url = externalDashboardUrl(endpoint)
          await this.checkHealth(new URL(url).origin)
          this.url = url
          this.status = 'running'
          return { success: true, url }
        } catch (error) {
          this.status = 'error'
          this.url = undefined
          return {
            success: false,
            reason: 'external_unavailable',
            message: redactSecretText(error instanceof Error ? error.message : String(error)).slice(0, 500)
          }
        }
      }
      if (this.child && this.status === 'running' && this.url) return { success: true, url: this.url }
      const binary = toAsarUnpackedPath(
        path.join(
          application.getPath('app.root.resources.binaries'),
          `${process.platform}-${process.arch}`,
          isWin ? 'bossfang.exe' : 'bossfang'
        )
      )
      if (!existsSync(binary)) {
        return { success: false, reason: 'not_installed', message: 'BossFang native executable is not packaged' }
      }
      let credentials: Credentials
      try {
        credentials = await this.readCredentials()
      } catch (error) {
        return {
          success: false,
          reason: 'credentials_required',
          message: redactSecretText(error instanceof Error ? error.message : String(error))
        }
      }
      try {
        this.status = 'starting'
        const port = await availablePort()
        const origin = `http://${HOST}:${port}`
        const directory = application.getPath('feature.agents.bossfang.data')
        await fs.mkdir(directory, { recursive: true, mode: 0o700 })
        const dataDirectory = path.join(directory, 'data')
        const configFile = application.getPath('feature.agents.bossfang.data', 'config.toml')
        if (!existsSync(configFile)) {
          await fs.writeFile(
            configFile,
            `home_dir = ${JSON.stringify(directory)}\ndata_dir = ${JSON.stringify(dataDirectory)}\napi_listen = ${JSON.stringify(`${HOST}:${port}`)}\ndashboard_user = ${JSON.stringify(credentials.username)}\n\n[storage]\nnamespace = "librefang"\ndatabase = "main"\n\n[storage.backend]\nkind = "embedded"\npath = ${JSON.stringify(path.join(dataDirectory, 'librefang.surreal'))}\n`,
            { mode: 0o600 }
          )
        }
        const child = crossPlatformSpawn(
          binary,
          ['--config', configFile, 'start', '--foreground', '--bind', `${HOST}:${port}`],
          {
            env: {
              ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LIBREFANG_'))),
              LIBREFANG_HOME: directory,
              LIBREFANG_DASHBOARD_PASS: credentials.password
            },
            cwd: directory,
            detached: !isWin,
            stdio: ['ignore', 'ignore', 'ignore'],
            windowsHide: true
          }
        )
        this.child = child
        let launchError: Error | undefined
        child.once('error', (error) => {
          launchError = error
        })
        child.once('exit', () => {
          if (this.child !== child) return
          this.child = null
          this.status = 'error'
          this.url = undefined
          logger.warn('Managed BossFang sidecar exited')
        })
        await this.waitUntilReady(child, origin, () => launchError)
        if (child.exitCode !== null || child.signalCode !== null) throw new Error('BossFang exited during startup')
        this.url = `${origin}/dashboard/`
        this.status = 'running'
        return { success: true, url: this.url }
      } catch (error) {
        await this.stopOwnedProcess().catch((stopError) => logger.warn('Failed to stop BossFang', stopError as Error))
        this.status = 'error'
        this.url = undefined
        return {
          success: false,
          reason: 'startup_failed',
          message: redactSecretText(error instanceof Error ? error.message : String(error)).slice(0, 500)
        }
      }
    })
  }

  async stop(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.getOwnership() === 'external') throw new Error('External BossFang is managed outside The Boss')
      await this.stopOwnedProcess()
      this.status = 'stopped'
      this.url = undefined
    })
  }

  private async readCredentials(): Promise<Credentials> {
    const target = application.getPath('feature.agents.bossfang.data', 'credentials.enc')
    if (!existsSync(target)) throw new Error('Set up BossFang dashboard credentials in Settings before opening it')
    const decrypted = await safeStorage.decryptStringAsync(await fs.readFile(target))
    const value: unknown = JSON.parse(decrypted.result)
    if (
      !value ||
      typeof value !== 'object' ||
      !('username' in value) ||
      !('password' in value) ||
      typeof value.username !== 'string' ||
      typeof value.password !== 'string'
    ) {
      throw new Error('Stored BossFang credentials are invalid; enter them again in Settings')
    }
    return value as Credentials
  }

  private getOwnership(): Ownership {
    return application.get('PreferenceService').get('feature.bossfang.ownership')
  }

  private async checkHealth(origin: string): Promise<void> {
    const response = await fetch(`${origin}/api/health`, { redirect: 'error', signal: AbortSignal.timeout(3_000) })
    if (!response.ok) throw new Error(`BossFang health request failed (HTTP ${response.status})`)
    const health: unknown = await response.json()
    if (!health || typeof health !== 'object' || !('status' in health) || health.status !== 'ok') {
      throw new Error('BossFang is listening but its database is not operational')
    }
  }

  private async refreshExternalStatus(): Promise<void> {
    const endpoint = application.get('PreferenceService').get('feature.bossfang.external_endpoint')
    try {
      if (!endpoint.trim()) {
        this.status = 'stopped'
        this.url = undefined
        return
      }
      const url = externalDashboardUrl(endpoint)
      await this.checkHealth(new URL(url).origin)
      this.url = url
      this.status = 'running'
    } catch {
      this.url = undefined
      this.status = 'error'
    }
  }

  private async stopOwnedProcess(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = null
    if (!child.pid) return
    await terminateProcessTree(child, false, 'BossFang')
    if (await waitForProcessExit(child, 3_000)) return
    await terminateProcessTree(child, true, 'BossFang')
    if (!(await waitForProcessExit(child, 1_000))) throw new Error('BossFang did not stop')
  }

  private async waitUntilReady(
    child: ChildProcess,
    origin: string,
    launchError: () => Error | undefined
  ): Promise<void> {
    const deadline = Date.now() + START_TIMEOUT_MS
    let degraded = false
    while (Date.now() < deadline) {
      const error = launchError()
      if (error) throw error
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('BossFang exited before it was ready')
      try {
        const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1_000) })
        if (response.ok) {
          const health: unknown = await response.json()
          if (health && typeof health === 'object' && 'status' in health && health.status === 'ok') return
          if (health && typeof health === 'object' && 'status' in health && health.status === 'degraded') {
            degraded = true
          }
        }
      } catch {
        // Startup is not ready yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(
      degraded
        ? 'BossFang is listening, but its database health check failed'
        : 'BossFang did not start within 120 seconds'
    )
  }
}

async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, HOST, resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a BossFang port')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}
