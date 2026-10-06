import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { Mutex } from 'async-mutex'
import { dialog, session, type WebContents } from 'electron'
import * as z from 'zod'

import { application } from '@application'
import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import { loggerService } from '@logger'
import { providerResponseSchema } from '@main/ai/runtime/uar'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { isWin } from '@main/core/platform'
import { toAsarUnpackedPath } from '@main/utils/asar'
import { fetchWithRateLimitRetries } from '@main/utils/http'
import { crossPlatformSpawn, terminateProcessTree, waitForProcessExit } from '@main/utils/processRunner'
import type { BossFangConfig, BossFangStatus } from '@shared/types/bossFang'
import { bossFangConfigSchema } from '@shared/types/bossFang'
import { redactLiteral, redactSecretText } from '@shared/utils/redaction'
import { BOSSFANG_DASHBOARD_PARTITION } from '@shared/utils/webviewSecurity'

import { BossFangConnection } from './connection'
import { BossFangDiagnostics } from './diagnostics'
import {
  credentialsConfigured,
  dashboardOrigin,
  readConfig,
  readCredentials,
  resolvePort,
  saveCredentials,
  type DashboardCredentials
} from './storage'

const logger = loggerService.withContext('BossFangService')

@Injectable('BossFangService')
@ServicePhase(Phase.WhenReady)
export class BossFangService extends BaseService {
  private readonly mutex = new Mutex()
  private child: ChildProcess | null = null
  private status: BossFangStatus['status'] = 'stopped'
  private effectiveConfig: BossFangConfig | null = null
  private origin: string | null = null
  private error: string | null = null
  private dashboardToken: string | null = null
  private credentialChanges = false
  private credentials: DashboardCredentials | null = null
  private logs: BossFangStatus['logs'] = []
  private sequence = 0
  private logWrites = Promise.resolve()
  readonly connection = new BossFangConnection(
    (p, i) => this.request(p, i),
    (text) => this.safe(text),
    (text) => this.log('info', text)
  )

  readonly diagnostics = new BossFangDiagnostics(
    (p, i) => this.request(p, i),
    () => this.connect(),
    () => this.models(),
    (text) => this.safe(text),
    () => this.connection.endpoint?.observed.id,
    (text) => this.log('warning', text)
  )

  protected async onInit() {
    await this.diagnostics.initialize()
    const logPath = application.getPath('feature.agents.bossfang.data', 'operator-log.json')
    if (existsSync(logPath)) {
      const stored = z
        .array(
          z.object({
            sequence: z.number(),
            occurredAt: z.string(),
            level: z.enum(['info', 'warning', 'error']),
            message: z.string()
          })
        )
        .parse(JSON.parse(await fs.readFile(logPath, 'utf8')))
      this.logs = stored.slice(-200)
      this.sequence = this.logs.at(-1)?.sequence ?? 0
    }
    this.registerDisposable(
      application.get('PreferenceService').subscribeChange('app.prometheus.integrations', () => {
        void this.connection.refresh().catch((error) => this.log('error', String(error)))
      })
    )
  }
  protected async onStop() {
    await this.mutex.runExclusive(async () => {
      await this.stopOwnedProcess()
      this.status = 'stopped'
      this.origin = null
    })
    await this.diagnostics.stop()
    await this.logWrites
  }
  private safe(text: string) {
    return redactSecretText(
      this.connection.redact(
        redactLiteral(redactLiteral(text, this.dashboardToken ?? undefined), this.credentials?.password)
      )
    ).slice(0, 2000)
  }
  private log(level: BossFangStatus['logs'][number]['level'], text: string) {
    this.logs.push({ sequence: ++this.sequence, occurredAt: new Date().toISOString(), level, message: this.safe(text) })
    this.logs = this.logs.slice(-200)
    const bytes = JSON.stringify(this.logs)
    this.logWrites = this.logWrites
      .then(async () => {
        await fs.mkdir(application.getPath('feature.agents.bossfang.data'), { recursive: true, mode: 0o700 })
        const target = application.getPath('feature.agents.bossfang.data', 'operator-log.json')
        await fs.writeFile(target + '.tmp', bytes, { mode: 0o600 })
        await fs.rename(target + '.tmp', target)
      })
      .catch(() => logger.warn('Could not persist redacted BossFang operator log'))
  }
  async getStatus(): Promise<BossFangStatus> {
    const requested = readConfig()
    return {
      status: this.status,
      ownership: this.effectiveConfig?.ownership ?? requested.ownership,
      configured: credentialsConfigured(requested.ownership),
      requested,
      effective: this.origin
        ? {
            origin: this.origin,
            port: Number(new URL(this.origin).port || (this.origin.startsWith('https:') ? 443 : 80)),
            uarInstanceId: this.connection.endpoint?.instanceId ?? null,
            uarGeneration: this.connection.endpoint?.generation ?? null,
            grantExpiresAt: this.connection.expiresAt
          }
        : null,
      restartRequired:
        this.credentialChanges ||
        Boolean(
          this.effectiveConfig &&
          ['ownership', 'host', 'port', 'portPolicy', 'externalEndpoint'].some(
            (key) => requested[key as keyof BossFangConfig] !== this.effectiveConfig![key as keyof BossFangConfig]
          )
        ),
      ...(this.origin ? { url: this.origin + '/dashboard/' } : {}),
      error: this.error,
      connection: this.connection.state,
      connectionError: this.connection.error,
      lastDiagnosticId: this.diagnostics.lastId,
      logs: structuredClone(this.logs)
    }
  }
  getDashboardOrigin() {
    return this.status === 'running' ? (this.origin ?? undefined) : undefined
  }
  async configure(input: BossFangConfig) {
    const config = bossFangConfigSchema.parse(input)
    if (config.ownership === 'external') config.externalEndpoint = dashboardOrigin(config.externalEndpoint)
    if (config.workspaceId) agentWorkspaceService.getById(config.workspaceId)
    const inventory = await application.get('PrometheusIntegrationService').readUarInstanceInventory()
    if (!inventory.instances.some((x) => x.id === config.uarInstanceId && x.enabled))
      throw new Error('Choose an enabled UAR instance from the existing inventory')
    const previous = readConfig()
    if (previous.uarInstanceId !== config.uarInstanceId || previous.workspaceId !== config.workspaceId)
      await this.connection.disconnect()
    await application.get('PreferenceService').set('feature.bossfang.configuration', JSON.stringify(config))
    this.log('info', 'Saved BossFang configuration; restart applies requested values')
    return this.getStatus()
  }
  async configureCredentials(credentials: DashboardCredentials) {
    await this.mutex.runExclusive(async () => {
      await saveCredentials(readConfig().ownership, credentials)
      this.dashboardToken = null
      this.log('info', 'Saved protected dashboard credentials; restart to apply')
      this.credentialChanges = true
    })
  }
  async start() {
    return this.mutex.runExclusive(() => this.startUnlocked())
  }
  async restart() {
    return this.mutex.runExclusive(async () => {
      await this.stopOwnedProcess()
      this.origin = null
      this.status = 'stopped'
      this.dashboardToken = null
      return this.startUnlocked()
    })
  }
  private async startUnlocked(): Promise<
    | { success: true; url: string }
    | {
        success: false
        reason: 'not_installed' | 'credentials_required' | 'startup_failed' | 'external_unavailable'
        message: string
      }
  > {
    if (this.status === 'running' && this.origin) return { success: true, url: this.origin + '/dashboard/' }
    const config = readConfig()
    let credentials: DashboardCredentials
    try {
      credentials = await readCredentials(config.ownership)
    } catch (error) {
      return {
        success: false,
        reason: 'credentials_required',
        message: this.safe(error instanceof Error ? error.message : String(error))
      }
    }
    this.credentials = credentials
    try {
      this.status = 'starting'
      this.error = null
      if (config.ownership === 'external') this.origin = dashboardOrigin(config.externalEndpoint)
      else {
        const binary = toAsarUnpackedPath(
          path.join(
            application.getPath('app.root.resources.binaries'),
            `${process.platform}-${process.arch}`,
            isWin ? 'bossfang.exe' : 'bossfang'
          )
        )
        if (!existsSync(binary)) {
          this.status = 'stopped'
          return { success: false, reason: 'not_installed', message: 'BossFang native executable is not packaged' }
        }
        const port = await resolvePort(config)
        this.origin = `http://${config.host}:${port}`
        const directory = application.getPath('feature.agents.bossfang.data')
        const data = path.join(directory, 'data')
        await fs.mkdir(directory, { recursive: true, mode: 0o700 })
        const file = path.join(directory, 'config.toml')
        let contents = existsSync(file)
          ? await fs.readFile(file, 'utf8')
          : `home_dir = ${JSON.stringify(directory)}\ndata_dir = ${JSON.stringify(data)}\n\n[storage]\nnamespace = "librefang"\ndatabase = "main"\n\n[storage.backend]\nkind = "embedded"\npath = ${JSON.stringify(path.join(data, 'librefang.surreal'))}\n`
        // Only app-owned top-level bind/login values change; native dashboard settings survive.
        const section = contents.search(/^\s*\[/m)
        let head = section < 0 ? contents : contents.slice(0, section)
        const tail = section < 0 ? '' : contents.slice(section)
        head = head.replace(/^\s*(api_listen|dashboard_user)\s*=.*\r?\n/gm, '')
        contents = `api_listen = ${JSON.stringify(`${config.host}:${port}`)}\ndashboard_user = ${JSON.stringify(credentials.username)}\n${head}${tail}`
        await fs.writeFile(file, contents, { mode: 0o600 })
        const child = crossPlatformSpawn(
          binary,
          ['--config', file, 'start', '--foreground', '--bind', `${config.host}:${port}`],
          {
            env: {
              ...Object.fromEntries(
                Object.entries(process.env).filter(
                  ([key]) =>
                    !key.startsWith('LIBREFANG_') &&
                    !['LITER_LLM_MASTER_KEY', 'KNOW_ME_GITOPS_TOKEN'].includes(key) &&
                    !/(_API_KEY|_API_TOKEN|_ACCESS_TOKEN|_SECRET_KEY)$/.test(key)
                )
              ),
              LIBREFANG_HOME: directory,
              LIBREFANG_DASHBOARD_PASS: credentials.password
            },
            cwd: directory,
            detached: !isWin,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
          }
        )
        this.child = child
        child.stdout?.on('data', (chunk) => this.log('info', String(chunk)))
        child.stderr?.on('data', (chunk) => this.log('warning', String(chunk)))
        let spawnError: Error | undefined
        child.once('error', (error) => {
          spawnError = error
        })
        child.once('exit', () => {
          if (this.child !== child) return
          this.child = null
          this.status = 'error'
          this.origin = null
          this.dashboardToken = null
          void this.connection.shutdown().catch(() => undefined)
          this.log('error', 'Managed BossFang process exited; restart from Settings')
        })
        await this.waitUntilReady(child, () => spawnError)
      }
      this.status = 'running'
      await this.login()
      this.credentialChanges = false
      this.effectiveConfig = structuredClone(config)
      this.log('info', `BossFang dashboard ready at ${this.origin}`)
      return { success: true, url: this.origin + '/dashboard/' }
    } catch (error) {
      const message = this.safe(error instanceof Error ? error.message : String(error))
      await this.stopOwnedProcess().catch(() => this.log('warning', 'Could not stop failed managed BossFang process'))
      this.status = 'error'
      this.origin = null
      this.error = message
      this.log('error', message)
      return {
        success: false,
        reason: config.ownership === 'external' ? 'external_unavailable' : 'startup_failed',
        message
      }
    }
  }
  attachDashboardGuest(guest: WebContents) {
    guest.setWindowOpenHandler(() => ({ action: 'deny' }))
    guest.on('dom-ready', () => {
      const origin = this.getDashboardOrigin(),
        token = this.dashboardToken
      if (!origin || !token || guest.isDestroyed()) return
      const url = new URL(guest.getURL())
      if (url.origin !== origin || !url.pathname.startsWith('/dashboard')) return
      // Only the native dashboard guest receives its own native login session.
      // No credential crosses the Boss renderer or a URL, and no Boss preload is attached.
      void guest
        .executeJavaScript(
          `if(sessionStorage.getItem('bossfang-api-key')!==${JSON.stringify(token)}){sessionStorage.setItem('bossfang-api-key',${JSON.stringify(token)});sessionStorage.removeItem('librefang-api-key');localStorage.removeItem('bossfang-api-key');localStorage.removeItem('librefang-api-key');location.reload()}`
        )
        .catch(() => this.log('warning', 'Could not initialize isolated native dashboard login; reopen from Apps'))
    })
  }
  private async login() {
    if (!this.origin || !this.credentials) throw new Error('BossFang dashboard credentials are unavailable')
    const response = await session
      .fromPartition(BOSSFANG_DASHBOARD_PARTITION)
      .fetch(this.origin + '/api/auth/dashboard-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.credentials),
        redirect: 'error'
      })
    if (!response.ok)
      throw new Error(`Dashboard login failed (HTTP ${response.status}); check saved dashboard credentials`)
    this.dashboardToken = z.object({ token: z.string().min(1) }).parse(await response.json()).token
  }
  async request(pathname: string, init: RequestInit = {}) {
    if (!this.origin || !this.dashboardToken)
      throw new Error('Start BossFang and configure dashboard credentials first')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.dashboardToken}`)
    return fetchWithRateLimitRetries(new URL(pathname, this.origin), {
      ...init,
      headers,
      redirect: 'error',
      signal: init.signal ?? AbortSignal.timeout(30_000)
    })
  }
  async connect() {
    await this.connection.connect(readConfig())
    return this.getStatus()
  }
  async disconnect() {
    await this.connection.disconnect()
    return this.getStatus()
  }
  async models() {
    await this.connection.refresh()
    const endpoint = this.connection.endpoint
    if (!endpoint || this.connection.state !== 'connected')
      throw new Error('Connect the selected UAR instance before selecting a model')
    const response = await application.get('UarSidecarService').modelRequestInstance(endpoint, '/api/uar/providers')
    if (!response.ok)
      throw new Error(`UAR model inventory failed (HTTP ${response.status}); reconnect the selected UAR instance`)
    return providerResponseSchema
      .parse(await response.json())
      .providers.filter((provider) => provider.enabled)
      .flatMap((provider) =>
        provider.models
          .filter((model) => model.enabled)
          .map((model) => ({
            id: provider.id + '/' + model.id,
            name: model.display_name ?? model.id,
            provider: provider.id,
            modelId: model.id
          }))
      )
  }
  async stop() {
    await this.mutex.runExclusive(async () => {
      if (!this.child && (this.effectiveConfig ?? readConfig()).ownership === 'external')
        throw new Error('External BossFang process is managed outside The Boss; use disconnect')
      await this.stopOwnedProcess()
      this.status = 'stopped'
      this.origin = null
      this.dashboardToken = null
      this.effectiveConfig = null
    })
  }
  private async stopOwnedProcess() {
    await this.connection.shutdown().catch((error) => this.log('warning', String(error)))
    const child = this.child
    this.child = null
    if (!child?.pid) return
    await terminateProcessTree(child, false, 'BossFang')
    if (await waitForProcessExit(child, 3000)) return
    await terminateProcessTree(child, true, 'BossFang')
    if (!(await waitForProcessExit(child, 1000))) throw new Error('BossFang did not stop')
  }
  private async waitUntilReady(child: ChildProcess, launchError: () => Error | undefined) {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      if (launchError()) throw launchError()
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('BossFang exited before readiness')
      try {
        const response = await fetch(this.origin + '/api/health', {
          redirect: 'error',
          signal: AbortSignal.timeout(1000)
        })
        if (response.ok && z.object({ status: z.literal('ok') }).safeParse(await response.json()).success) return
      } catch {
        /* Managed process is still starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('BossFang did not become operational within 120 seconds; inspect redacted logs')
  }
  async exportLogs(senderId: string, diagnostic?: unknown) {
    const parent = application.get('WindowManager').getWindow(senderId)
    if (!parent) throw new Error('Diagnostic export requires an application window')
    const { canceled, filePath } = await dialog.showSaveDialog(parent, {
      defaultPath: 'bossfang-diagnostics.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { saved: false }
    await fs.writeFile(
      filePath,
      JSON.stringify({ schemaVersion: 1, status: await this.getStatus(), diagnostic }, null, 2),
      { mode: 0o600 }
    )
    return { saved: true }
  }
}
