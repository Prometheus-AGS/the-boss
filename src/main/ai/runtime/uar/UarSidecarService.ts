import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'

import { Mutex } from 'async-mutex'
import * as z from 'zod'

import { application } from '@application'
import { loggerService } from '@logger'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import { isWin } from '@main/core/platform'
import { ensureManagedSecrets } from '@main/services/prometheus/integrationConfig'
import { readIntegrationConfig, readUarInstanceCredentials } from '@main/services/prometheus/integrationConfig'
import { fetchWithRateLimitRetries } from '@main/utils/http'
import { crossPlatformSpawn, terminateProcessTree, waitForProcessExit } from '@main/utils/processRunner'
import { getRawShellEnv } from '@main/utils/shellEnv'
import { assertUarEnabled, isUarEnabled } from '@shared/ai/agentRuntimeCapabilities'
import { uarCapabilitiesResponseSchema, type UarAdministrationCapabilities } from '@shared/types/prometheusIntegration'
import {
  MANAGED_UAR_INSTANCE_ID,
  type UarObservedInstance,
  type UarRuntimeInstance
} from '@shared/types/uarServiceInstance'
import { uarTeamDiagnosticDetailsSchema } from '@shared/types/uarTeamProfiles'
import { redactSecretText } from '@shared/utils/redaction'

import { inspectUarPayload, requireUarPayload, type UarPayload } from './uarPayload'
import { uarPrincipalForSession } from './uarPrincipal'
import { type AppliedUarStorage, readAppliedUarStorage, writeAppliedUarStorage } from './uarStorageProfile'

const logger = loggerService.withContext('UarSidecarService')
const safeTeamProviderDiagnostic = z.object({
  fields: z.object({
    message: z.literal('Captured safe team provider failure'),
    code: z.enum([
      'TEAM_PROVIDER_REQUEST_REJECTED',
      'TEAM_PROVIDER_STREAM_FAILED',
      'TEAM_COLLABORATION_HANDOFF_FAILED',
      'TEAM_REQUEST_PREPARATION_FAILED',
      'TEAM_EXECUTION_BUDGET_FAILED'
    ]),
    source_stage: uarTeamDiagnosticDetailsSchema.shape.sourceStage.nullish(),
    category: uarTeamDiagnosticDetailsSchema.shape.category.nullish(),
    http_status: uarTeamDiagnosticDetailsSchema.shape.httpStatus.nullish(),
    collaboration_code: uarTeamDiagnosticDetailsSchema.shape.collaborationCode.nullish(),
    diagnostic_reference: z.uuid(),
    provider_error_kind: z.enum([
      'provider_error',
      'provider_authentication_failed',
      'provider_invalid_request',
      'provider_rate_limited',
      'provider_overloaded',
      'provider_timeout',
      'provider_transport_failed',
      'provider_stream_failed',
      'provider_budget_exceeded',
      'provider_external_error',
      'provider_internal_error'
    ])
  })
})
const safeTeamProviderRetry = z.object({
  fields: safeTeamProviderDiagnostic.shape.fields.omit({ provider_error_kind: true }).extend({
    message: z.literal('LLM stream creation failed; retrying before semantic events'),
    error: safeTeamProviderDiagnostic.shape.fields.shape.provider_error_kind,
    request_id: z.uuid(),
    iteration: z.number().int().nonnegative(),
    attempt: z.number().int().positive(),
    max_attempts: z.number().int().positive(),
    delay_ms: z.number().int().nonnegative()
  })
})
const START_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 5_000
const PROVIDER_CREDENTIAL_ENV_PATTERNS = [/_API_KEY$/i, /_API_TOKEN$/i, /_ACCESS_TOKEN$/i, /_SECRET_KEY$/i]
const LEGACY_UAR_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'COHERE_API_KEY',
  'CONFIG_FILE',
  'EXTERNAL_CACHE_ENABLED',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'JWT_REQUIRED',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_PROTOCOL',
  'MISTRAL_API_KEY',
  'OPENAI_API_KEY',
  'PERPLEXITY_API_KEY',
  'PORT',
  'RATE_LIMIT_ENABLED',
  'TIMEOUT_DISABLED',
  'TOGETHER_API_KEY'
])
const REQUIRED_CAPABILITIES = [
  'approval_lifecycle_v1',
  'host_history',
  'reasoning_effort',
  'run_scoped_credentials',
  'run_scoped_mcp_servers',
  'session_principal',
  'working_directory'
] as const

export interface UarSidecarEndpoint {
  instanceId: string
  ownership: 'managed' | 'external'
  baseUrl: string
  effectivePort: number
  processId?: number
  startedAt: number
  generation: number
  uarVersion: string
  capabilities: readonly string[]
  administration: UarAdministrationCapabilities
  observed: UarObservedInstance
  storage?: Omit<AppliedUarStorage, 'password'>
}

export type UarSidecarStatus = UarSidecarEndpoint & { state: 'running' }

type RunningSidecar = Omit<UarSidecarEndpoint, 'storage'> & {
  child: ChildProcess
  launchToken: string
  authToken: string
  adminKey: string
  principalMode: 'host-asserted' | 'token-subject'
  storage: AppliedUarStorage
}

type VerifiedEndpoint = UarSidecarEndpoint & {
  authToken: string
  adminKey?: string
  principalMode: 'host-asserted' | 'token-subject'
}

function isolatedSidecarEnvironment(raw: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => {
      const normalized = key.toUpperCase()
      return (
        !normalized.startsWith('UAR_') &&
        !normalized.startsWith('LLM_') &&
        !LEGACY_UAR_ENV_KEYS.has(normalized) &&
        !PROVIDER_CREDENTIAL_ENV_PATTERNS.some((pattern) => pattern.test(normalized))
      )
    })
  )
}

@Injectable('UarSidecarService')
@ServicePhase(Phase.WhenReady)
export class UarSidecarService extends BaseService {
  private readonly operation = new Mutex()
  private running?: RunningSidecar
  private startPromise?: Promise<RunningSidecar>
  private generation = 0
  private stopping = false
  private readonly verifiedEndpoints = new Map<number, VerifiedEndpoint>()
  private readonly requestAdmissions = new Map<number, { mutex: Mutex; nextAt: number }>()
  private readonly instanceDiagnostics = new Map<
    string,
    {
      compatibility: 'configured' | 'unreachable' | 'unauthenticated' | 'incompatible' | 'operational'
      observed?: UarObservedInstance
      diagnostic?: string
    }
  >()

  protected onInit(): void {
    this.stopping = false
  }

  protected async onStop(): Promise<void> {
    this.stopping = true
    await this.operation.runExclusive(() => this.stopOwnedProcess())
  }

  async ensureReady(): Promise<UarSidecarEndpoint & { storage: NonNullable<UarSidecarEndpoint['storage']> }> {
    assertUarEnabled()
    const running = await this.ensureRunning()
    return {
      instanceId: running.instanceId,
      ownership: running.ownership,
      baseUrl: running.baseUrl,
      effectivePort: running.effectivePort,
      ...(running.processId ? { processId: running.processId } : {}),
      startedAt: running.startedAt,
      generation: running.generation,
      uarVersion: running.uarVersion,
      capabilities: running.capabilities,
      administration: running.administration,
      observed: running.observed,
      storage: this.storageStatus(running.storage)
    }
  }

  async resolveSelected(): Promise<UarSidecarEndpoint> {
    const config = readIntegrationConfig().uar
    return this.resolveInstance(config.selectedInstanceId)
  }

  async resolveInstance(instanceId: string): Promise<UarSidecarEndpoint> {
    assertUarEnabled()
    const config = readIntegrationConfig().uar
    const instance = config.instances.find((candidate) => candidate.id === instanceId)
    if (!instance?.enabled) throw new Error(`UAR instance ${instanceId} is unavailable or disabled`)
    try {
      const endpoint =
        instance.ownership === 'managed' ? await this.ensureReady() : await this.connectExternal(instance)
      this.instanceDiagnostics.set(instance.id, { compatibility: 'operational', observed: endpoint.observed })
      return endpoint
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : String(error)
      const compatibility = /credential|HTTP 401|HTTP 403|authentication/i.test(diagnostic)
        ? 'unauthenticated'
        : /mismatch|missing required|older than required|invalid|HTTP \d+/i.test(diagnostic)
          ? 'incompatible'
          : 'unreachable'
      this.instanceDiagnostics.set(instance.id, { compatibility, diagnostic })
      throw error
    }
  }

  inspectInstance(instanceId: string) {
    return this.instanceDiagnostics.get(instanceId) ?? { compatibility: 'configured' as const }
  }

  forgetExternal(instanceId: string): void {
    for (const [generation, endpoint] of this.verifiedEndpoints) {
      if (endpoint.instanceId === instanceId && endpoint.ownership === 'external') {
        this.verifiedEndpoints.delete(generation)
      }
    }
    this.instanceDiagnostics.delete(instanceId)
  }

  status(): UarSidecarStatus | undefined {
    if (!isUarEnabled()) return undefined
    const running = this.running
    if (!running || !this.isAlive(running.child)) return undefined
    return {
      state: 'running',
      instanceId: running.instanceId,
      ownership: running.ownership,
      baseUrl: running.baseUrl,
      effectivePort: running.effectivePort,
      ...(running.processId ? { processId: running.processId } : {}),
      startedAt: running.startedAt,
      generation: running.generation,
      uarVersion: running.uarVersion,
      capabilities: running.capabilities,
      administration: running.administration,
      observed: running.observed,
      storage: this.storageStatus(running.storage)
    }
  }

  payload(): UarPayload | undefined {
    return inspectUarPayload()
  }

  async restart(): Promise<UarSidecarEndpoint> {
    assertUarEnabled()
    const selected = readIntegrationConfig().uar.instances.find(
      (instance) => instance.id === readIntegrationConfig().uar.selectedInstanceId
    )
    if (selected?.ownership === 'external') throw new Error('External UAR lifecycle is owned outside The Boss')
    const running = await this.operation.runExclusive(async () => {
      await this.stopOwnedProcess()
      const next = await this.startOwnedProcess(await readAppliedUarStorage())
      this.running = next
      return next
    })
    return {
      instanceId: running.instanceId,
      ownership: running.ownership,
      baseUrl: running.baseUrl,
      effectivePort: running.effectivePort,
      ...(running.processId ? { processId: running.processId } : {}),
      startedAt: running.startedAt,
      generation: running.generation,
      uarVersion: running.uarVersion,
      capabilities: running.capabilities,
      administration: running.administration,
      observed: running.observed,
      storage: this.storageStatus(running.storage)
    }
  }

  async applyStorage(candidate: AppliedUarStorage): Promise<UarSidecarEndpoint> {
    assertUarEnabled()
    const configured = readIntegrationConfig().uar
    const selected = configured.instances.find((instance) => instance.id === configured.selectedInstanceId)
    if (selected?.ownership !== 'managed') {
      throw new Error('External UAR lifecycle is owned outside The Boss')
    }
    const running = await this.operation.runExclusive(async () => {
      const previous = this.running?.storage ?? (await readAppliedUarStorage())
      await this.stopOwnedProcess()
      let next: RunningSidecar | undefined
      try {
        next = await this.startOwnedProcess(candidate)
        await writeAppliedUarStorage(candidate)
        this.running = next
        return next
      } catch (error) {
        if (next) await this.terminate(next.child)
        try {
          const restored = await this.startOwnedProcess(previous)
          this.running = restored
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], 'UAR storage apply and rollback both failed')
        }
        throw error
      }
    })
    return {
      instanceId: running.instanceId,
      ownership: running.ownership,
      baseUrl: running.baseUrl,
      effectivePort: running.effectivePort,
      ...(running.processId ? { processId: running.processId } : {}),
      startedAt: running.startedAt,
      generation: running.generation,
      uarVersion: running.uarVersion,
      capabilities: running.capabilities,
      administration: running.administration,
      observed: running.observed,
      storage: this.storageStatus(running.storage)
    }
  }

  async request(
    pathname: string,
    principal: string,
    init: RequestInit = {},
    expectedGeneration?: number
  ): Promise<Response> {
    assertUarEnabled()
    const endpoint = await this.resolveSelected()
    if (expectedGeneration !== undefined && endpoint.generation !== expectedGeneration) {
      throw new Error('UAR sidecar restarted before the request was admitted')
    }
    return this.requestInstance(endpoint, pathname, principal, init)
  }

  async requestInstance(
    endpoint: UarSidecarEndpoint,
    pathname: string,
    principal: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const verified = this.verifiedEndpoints.get(endpoint.generation)
    if (!verified || verified.instanceId !== endpoint.instanceId) {
      throw new Error(`UAR instance ${endpoint.instanceId} binding expired before the request was admitted`)
    }
    return this.authenticatedFetch(verified, pathname, principal, init)
  }

  requestCurrent(
    pathname: string,
    principal: string,
    init: RequestInit = {},
    expectedGeneration?: number
  ): Promise<Response> | undefined {
    if (!isUarEnabled()) return undefined
    const running = this.running
    if (!running || !this.isAlive(running.child)) return undefined
    if (expectedGeneration !== undefined && running.generation !== expectedGeneration) return undefined
    return this.authenticatedFetch(running, pathname, principal, init)
  }

  requestInstanceCurrent(
    endpoint: UarSidecarEndpoint,
    pathname: string,
    principal: string,
    init: RequestInit = {}
  ): Promise<Response> | undefined {
    const verified = this.verifiedEndpoints.get(endpoint.generation)
    if (!verified || verified.instanceId !== endpoint.instanceId) return undefined
    return this.authenticatedFetch(verified, pathname, principal, init)
  }

  /** Main-process-only administration request. The protected authority never
   * crosses IPC or appears in endpoint/status snapshots. */
  async adminRequest(pathname: string, init: RequestInit = {}, expectedGeneration?: number): Promise<Response> {
    return this.roleRequest('administration', pathname, init, expectedGeneration)
  }

  async adminRequestInstance(
    endpoint: UarSidecarEndpoint,
    pathname: string,
    init: RequestInit = {}
  ): Promise<Response> {
    return this.roleRequestInstance(endpoint, 'administration', pathname, init)
  }

  async modelRequest(pathname: string, init: RequestInit = {}, expectedGeneration?: number): Promise<Response> {
    return this.roleRequest('models', pathname, init, expectedGeneration)
  }

  async modelRequestInstance(
    endpoint: UarSidecarEndpoint,
    pathname: string,
    init: RequestInit = {}
  ): Promise<Response> {
    return this.roleRequestInstance(endpoint, 'models', pathname, init)
  }

  private async roleRequest(
    role: 'administration' | 'models' | 'console',
    pathname: string,
    init: RequestInit,
    expectedGeneration?: number
  ): Promise<Response> {
    assertUarEnabled()
    const endpoint = await this.resolveSelected()
    if (expectedGeneration !== undefined && endpoint.generation !== expectedGeneration) {
      throw new Error('UAR sidecar restarted before the administration request was admitted')
    }
    return this.roleRequestInstance(endpoint, role, pathname, init)
  }

  private async roleRequestInstance(
    endpoint: UarSidecarEndpoint,
    role: 'administration' | 'models' | 'console',
    pathname: string,
    init: RequestInit
  ): Promise<Response> {
    const verified = this.verifiedEndpoints.get(endpoint.generation)
    if (!verified || verified.instanceId !== endpoint.instanceId) {
      throw new Error(`UAR instance ${endpoint.instanceId} binding expired before the request was admitted`)
    }
    const headers = new Headers(init.headers)
    if (verified.adminKey) headers.set('x-uar-admin-key', verified.adminKey)
    else throw new Error(`UAR ${role} request requires a separately configured administration key`)
    const roleEndpoint = verified.observed.endpoints[role]
    if (!roleEndpoint) throw new Error(`UAR ${role} endpoint is unavailable for instance ${verified.instanceId}`)
    return this.authenticatedFetch(
      verified,
      pathname,
      uarPrincipalForSession('admin'),
      { ...init, headers },
      roleEndpoint
    )
  }

  private async authenticatedFetch(
    running: Pick<
      VerifiedEndpoint,
      'baseUrl' | 'authToken' | 'principalMode' | 'generation' | 'instanceId' | 'ownership'
    >,
    pathname: string,
    principal: string,
    init: RequestInit,
    baseUrl = running.baseUrl
  ): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${running.authToken}`)
    if (running.principalMode === 'host-asserted') headers.set('x-uar-principal', principal)
    else headers.delete('x-uar-principal')
    const beforeFetch = () => this.admitRequest(running, 1, init.signal)
    const url = new URL(pathname, baseUrl)
    const response = await fetchWithRateLimitRetries(url, { ...init, headers }, beforeFetch)
    if (!response.ok) {
      logger.warn('UAR HTTP request failed', {
        method: (init.method ?? 'GET').toUpperCase(),
        path: url.pathname,
        status: response.status,
        generation: running.generation
      })
    }
    return response
  }

  admitRequest(
    endpoint: Pick<UarSidecarEndpoint, 'ownership' | 'generation' | 'instanceId'>,
    weight: number,
    signal?: AbortSignal | null
  ): Promise<void> {
    if (endpoint.ownership !== 'managed') return Promise.resolve()
    let admission = this.requestAdmissions.get(endpoint.generation)
    if (!admission) {
      admission = { mutex: new Mutex(), nextAt: 0 }
      this.requestAdmissions.set(endpoint.generation, admission)
    }
    const currentAdmission = admission
    const queued = currentAdmission.mutex.runExclusive(async () => {
      signal?.throwIfAborted()
      // Accumulate every weighted slot before releasing a native upstream read burst.
      const wait = Math.max(0, currentAdmission.nextAt - Date.now()) + 100 * (weight - 1)
      if (wait > 0) await delay(wait, undefined, { signal: signal ?? undefined })
      const current = this.verifiedEndpoints.get(endpoint.generation)
      if (!current || current.instanceId !== endpoint.instanceId) {
        throw new Error(`UAR instance ${endpoint.instanceId} binding expired before the request was admitted`)
      }
      // The managed sidecar retains its default global quota of ten requests per second.
      currentAdmission.nextAt = Date.now() + 100
    })
    if (!signal) return queued
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
      queued.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
    })
  }

  private ensureRunning(): Promise<RunningSidecar> {
    assertUarEnabled()
    if (this.stopping) return Promise.reject(new Error('UAR sidecar is shutting down'))
    if (this.running && this.isAlive(this.running.child)) return Promise.resolve(this.running)
    this.startPromise ??= this.operation.runExclusive(async () => {
      if (this.running && this.isAlive(this.running.child)) return this.running
      await this.stopOwnedProcess()
      const running = await this.startOwnedProcess(await readAppliedUarStorage())
      this.running = running
      return running
    })
    return this.startPromise.finally(() => {
      this.startPromise = undefined
    })
  }

  private async startOwnedProcess(storage: AppliedUarStorage): Promise<RunningSidecar> {
    assertUarEnabled()
    const payload = requireUarPayload()
    const executable = payload.executable
    const launchToken = randomBytes(32).toString('hex')
    const managedSecrets = await ensureManagedSecrets()
    const adminKey = managedSecrets.uarAdminKey
    const credentialEncryptionKey = managedSecrets.uarCredentialEncryptionKey
    if (!adminKey || !credentialEncryptionKey) throw new Error('UAR protected authority could not be provisioned')
    const dataRoot = application.getPath('feature.agents.uar.data')
    const managedInstance = readIntegrationConfig().uar.instances.find(
      (instance) => instance.id === MANAGED_UAR_INSTANCE_ID && instance.ownership === 'managed'
    )
    if (!managedInstance) throw new Error('The managed UAR instance definition is missing')
    const configFile = path.join(dataRoot, 'sidecar.yaml')
    const dotenvFile = path.join(dataRoot, '.env')
    await mkdir(dataRoot, { recursive: true, mode: 0o700 })
    const policiesDirectory = path.join(dataRoot, 'policies')
    await mkdir(policiesDirectory, { recursive: true, mode: 0o700 })
    for (const policy of ['default.cedar', 'skill-mutation.cedar', 'tool-approval.cedar']) {
      try {
        await copyFile(
          path.join(payload.policiesDirectory, policy),
          path.join(policiesDirectory, policy),
          constants.COPYFILE_EXCL
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    await Promise.all([
      writeFile(configFile, '{}\n', { encoding: 'utf8', mode: 0o600 }),
      writeFile(dotenvFile, '', { encoding: 'utf8', mode: 0o600 })
    ])
    if (!isWin) await Promise.all([chmod(dataRoot, 0o700), chmod(configFile, 0o600), chmod(dotenvFile, 0o600)])
    const persistence =
      storage.profile.backend === 'remote'
        ? {
            UAR_PERSISTENCE__DATABASE_URL: storage.profile.endpoint,
            UAR_PERSISTENCE__SURREAL_USER: storage.profile.username,
            UAR_PERSISTENCE__SURREAL_PASS: storage.password ?? '',
            UAR_PERSISTENCE__SURREAL_AUTH_LEVEL: storage.profile.authLevel,
            UAR_PERSISTENCE__SURREAL_NS: storage.profile.namespace,
            UAR_PERSISTENCE__SURREAL_DB: storage.profile.database,
            ...(storage.profile.remoteDurabilityAttested ? { UAR_REMOTE_SURREAL_DURABILITY_ATTESTED: '1' } : {})
          }
        : {
            UAR_PERSISTENCE__DATABASE_URL: `surrealkv://${path.resolve(dataRoot, 'runtime.db').replaceAll('\\', '/')}`
          }
    const env = {
      ...isolatedSidecarEnvironment(await getRawShellEnv()),
      // Trusted local operation staging is never accepted from renderer settings or shell providers.
      ...(process.env.UAR_TEAM_EXECUTION_PROFILE_STAGE === 'operation'
        ? { UAR_TEAM_EXECUTION_PROFILE_STAGE: 'operation' }
        : {}),
      ...(process.env.UAR_WORKFLOW_EXECUTION_PROFILE_STAGE === 'operation'
        ? { UAR_WORKFLOW_EXECUTION_PROFILE_STAGE: 'operation' }
        : {}),
      UAR_SIDECAR: '1',
      UAR_SERVICE_INSTANCE__INSTANCE_ID: managedInstance.expectedRuntimeId,
      UAR_SERVICE_INSTANCE__WORKSPACE_LOCATION: managedInstance.workspaceLocation,
      UAR_SECURITY__SETTINGS_MUTATION_AUTH_REQUIRED: 'true',
      UAR_SECURITY__SETTINGS_ADMIN_KEY: adminKey,
      CREDENTIAL_ENCRYPTION_KEY: credentialEncryptionKey,
      UAR_PERSISTENCE__PROVIDER: 'surreal',
      ...persistence,
      UAR_BUILTIN_SKILLS_DIR: path.join(application.getPath('feature.prometheus.pack.runtime'), 'skills'),
      UAR_MODELS_DIR: payload.modelsDirectory,
      UAR_LOAD_IMPORTED_SKILLS: 'true',
      UAR_NATIVE_TOOLS__FILE_TOOLS_ENABLED: 'false',
      UAR_NATIVE_TOOLS__WEB_FETCH_ENABLED: 'false',
      UAR_NATIVE_TOOLS__TERMINAL_EXEC_ENABLED: 'false'
    }
    const child = crossPlatformSpawn(executable, ['--config', configFile, '--port', String(storage.profile.port)], {
      cwd: dataRoot,
      env,
      detached: !isWin,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    child.on('error', (error) => logger.warn('UAR sidecar process error', { error }))
    this.retainSafeProviderDiagnostics(child)
    child.stdin?.write(`${launchToken}\n`)

    try {
      const port = await this.waitForReady(child)
      const baseUrl = `http://127.0.0.1:${port}`
      const capabilities = await this.readCapabilities(managedInstance, baseUrl, launchToken)
      if (!this.isAlive(child)) throw new Error('UAR sidecar exited immediately after becoming ready')
      const generation = ++this.generation
      const running: RunningSidecar = {
        instanceId: managedInstance.id,
        ownership: 'managed',
        child,
        launchToken,
        authToken: launchToken,
        adminKey,
        principalMode: capabilities.principalMode,
        baseUrl,
        effectivePort: port,
        ...(child.pid ? { processId: child.pid } : {}),
        startedAt: Date.now(),
        generation,
        uarVersion: capabilities.uarVersion,
        capabilities: capabilities.capabilities,
        administration: capabilities.administration,
        observed: capabilities.observed,
        storage
      }
      this.verifiedEndpoints.set(generation, {
        ...running,
        authToken: launchToken,
        adminKey,
        storage: this.storageStatus(storage)
      })
      child.once('exit', (code, signal) => {
        if (this.running?.child === child) this.running = undefined
        if (!this.stopping) logger.warn('UAR sidecar exited', { code, signal, generation })
      })
      logger.info('UAR sidecar ready', {
        generation,
        version: running.uarVersion,
        preferredPort: storage.profile.port,
        effectivePort: running.effectivePort,
        storageBackend: storage.profile.backend,
        capabilities: running.capabilities
      })
      return running
    } catch (error) {
      await this.terminate(child)
      throw error
    }
  }

  /** Sidecar output is untrusted: retain only the named event's safe machine fields. */
  private retainSafeProviderDiagnostics(child: ChildProcess): void {
    const outputs = [child.stdout, child.stderr].flatMap((input) => {
      if (!input) return []
      const output = readline.createInterface({ input })
      output.on('line', (line) => {
        let value: unknown
        try {
          value = JSON.parse(line)
        } catch {
          return
        }
        const retry = safeTeamProviderRetry.safeParse(value)
        if (retry.success) {
          const { fields } = retry.data
          logger.warn('UAR team provider retry', {
            request_id: fields.request_id,
            iteration: fields.iteration,
            attempt: fields.attempt,
            max_attempts: fields.max_attempts,
            delay_ms: fields.delay_ms,
            provider_error_kind: fields.error,
            code: fields.code,
            category: fields.category,
            source_stage: fields.source_stage,
            http_status: fields.http_status,
            collaboration_code: fields.collaboration_code,
            diagnostic_reference: fields.diagnostic_reference
          })
          return
        }
        const result = safeTeamProviderDiagnostic.safeParse(value)
        if (!result.success) return
        const {
          code,
          diagnostic_reference,
          provider_error_kind,
          source_stage,
          category,
          http_status,
          collaboration_code
        } = result.data.fields
        logger.warn('UAR team execution diagnostic', {
          code,
          diagnostic_reference,
          provider_error_kind,
          source_stage,
          category,
          http_status,
          collaboration_code
        })
      })
      return [output]
    })
    child.once('close', () => outputs.forEach((output) => output.close()))
  }

  private waitForReady(child: ChildProcess): Promise<number> {
    return new Promise((resolve, reject) => {
      const output = readline.createInterface({ input: child.stdout! })
      let startupDiagnostic = ''
      const appendDiagnostic = (value: string) => {
        startupDiagnostic = `${startupDiagnostic}${redactSecretText(value)}`.slice(-2_000)
      }
      const timeout = setTimeout(() => settle(new Error('UAR sidecar readiness timed out')), START_TIMEOUT_MS)
      timeout.unref()
      const settle = (error?: Error, port?: number) => {
        clearTimeout(timeout)
        output.removeAllListeners()
        child.stderr?.removeListener('data', onStderr)
        child.removeListener('error', onError)
        child.removeListener('exit', onExit)
        if (error) reject(error)
        else resolve(port!)
      }
      const onStderr = (chunk: Buffer | string) => {
        appendDiagnostic(String(chunk))
      }
      const onError = (error: Error) => settle(new Error(`Failed to launch UAR sidecar: ${error.message}`))
      const onExit = (code: number | null) =>
        settle(
          new Error(
            `UAR sidecar exited before readiness (${code ?? 'signal'})${startupDiagnostic ? ': ' + startupDiagnostic.trim() : ''}`
          )
        )
      child.stderr?.on('data', onStderr)
      child.once('error', onError)
      child.once('exit', onExit)
      output.on('line', (line) => {
        const match = /^READY:(\d{1,5})$/.exec(line)
        if (!match) {
          appendDiagnostic(`${line}\n`)
          return
        }
        const port = Number(match[1])
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          settle(new Error('UAR sidecar reported an invalid readiness port'))
          return
        }
        settle(undefined, port)
      })
    })
  }

  private async readCapabilities(instance: UarRuntimeInstance, baseUrl: string, authToken: string) {
    const response = await fetchWithRateLimitRetries(new URL('/api/uar/capabilities', baseUrl), {
      headers: { authorization: `Bearer ${authToken}` },
      signal: AbortSignal.timeout(5_000)
    })
    if (!response.ok) throw new Error(`UAR sidecar capability check failed with HTTP ${response.status}`)
    const body = uarCapabilitiesResponseSchema.parse(await response.json())
    const capabilities = body.capabilities
    if (!Array.isArray(capabilities) || !capabilities.every((value) => typeof value === 'string')) {
      throw new Error('UAR sidecar capability response is invalid')
    }
    const missing = [...REQUIRED_CAPABILITIES, ...instance.requiredCapabilities].filter(
      (capability) => !capabilities.includes(capability)
    )
    if (missing.length) throw new Error(`UAR sidecar is missing required capabilities: ${missing.join(', ')}`)
    if (body.instance.id !== instance.expectedRuntimeId) {
      throw new Error(
        `UAR instance identity mismatch: expected ${instance.expectedRuntimeId}, received ${body.instance.id}`
      )
    }
    if (body.instance.profile !== instance.profile) {
      throw new Error(`UAR profile mismatch: expected ${instance.profile}, received ${body.instance.profile}`)
    }
    if (body.instance.workspace_location !== instance.workspaceLocation) {
      throw new Error(
        `UAR workspace location mismatch: expected ${instance.workspaceLocation}, received ${body.instance.workspace_location}`
      )
    }
    if (instance.minimumVersion && this.compareVersions(body.uar_version, instance.minimumVersion) < 0) {
      throw new Error(`UAR version ${body.uar_version} is older than required ${instance.minimumVersion}`)
    }
    const observed: UarObservedInstance = {
      id: body.instance.id,
      profile: body.instance.profile,
      version: body.uar_version,
      workspaceLocation: body.instance.workspace_location,
      capabilities: [...capabilities],
      endpoints: body.endpoints,
      ownership: body.ownership,
      references: {
        lifecycleOwner: body.references.lifecycle_owner,
        credential: body.references.credential,
        workspace: body.references.workspace
      },
      placement: body.placement
    }
    if (body.ownership !== instance.ownership) {
      throw new Error(`UAR ownership mismatch: expected ${instance.ownership}, received ${body.ownership}`)
    }
    if (instance.ownership === 'external') {
      for (const role of ['runtime', 'administration', 'models', 'console'] as const) {
        if (this.normalizedEndpoint(body.endpoints[role]) !== this.normalizedEndpoint(instance.endpoints[role])) {
          throw new Error(`UAR ${role} endpoint mismatch for ${instance.id}`)
        }
      }
    }
    const principalMode =
      body.authentication?.principalMode ?? (instance.ownership === 'managed' ? 'host-asserted' : 'token-subject')
    return { uarVersion: body.uar_version, capabilities, administration: body.administration, observed, principalMode }
  }

  private async connectExternal(instance: UarRuntimeInstance): Promise<UarSidecarEndpoint> {
    const credentials = await readUarInstanceCredentials(instance.id)
    if (!credentials.runtimeBearer) {
      throw new Error(`UAR instance ${instance.id} is missing its protected runtime bearer`)
    }
    if (!credentials.adminKey) {
      throw new Error(`UAR instance ${instance.id} is missing its protected administration key`)
    }
    const capabilities = await this.readCapabilities(
      instance,
      instance.endpoints.administration,
      credentials.runtimeBearer
    )
    const previous = [...this.verifiedEndpoints.values()].find(
      (candidate) =>
        candidate.instanceId === instance.id &&
        candidate.ownership === 'external' &&
        candidate.principalMode === capabilities.principalMode &&
        JSON.stringify(candidate.observed) === JSON.stringify(capabilities.observed)
    )
    const generation = previous?.generation ?? ++this.generation
    for (const [candidateGeneration, candidate] of this.verifiedEndpoints) {
      if (candidate.instanceId === instance.id && candidateGeneration !== generation) {
        this.verifiedEndpoints.delete(candidateGeneration)
      }
    }
    const runtimeUrl = new URL(capabilities.observed.endpoints.runtime)
    const endpoint: VerifiedEndpoint = {
      instanceId: instance.id,
      ownership: 'external',
      baseUrl: capabilities.observed.endpoints.runtime,
      effectivePort: Number(runtimeUrl.port || (runtimeUrl.protocol === 'https:' ? 443 : 80)),
      startedAt: previous?.startedAt ?? Date.now(),
      generation,
      uarVersion: capabilities.uarVersion,
      capabilities: capabilities.capabilities,
      administration: capabilities.administration,
      observed: capabilities.observed,
      authToken: credentials.runtimeBearer,
      adminKey: credentials.adminKey,
      principalMode: capabilities.principalMode
    }
    this.verifiedEndpoints.set(generation, endpoint)
    return endpoint
  }

  private normalizedEndpoint(value: string | null): string | null {
    return value?.replace(/\/$/, '') ?? null
  }

  private compareVersions(actual: string, minimum: string): number {
    const parse = (value: string) =>
      value
        .replace(/^v/, '')
        .split(/[.-]/)
        .slice(0, 3)
        .map((part) => Number(part) || 0)
    const left = parse(actual)
    const right = parse(minimum)
    for (let index = 0; index < 3; index += 1) {
      if (left[index] !== right[index]) return (left[index] ?? 0) - (right[index] ?? 0)
    }
    return 0
  }

  private async stopOwnedProcess(): Promise<void> {
    const running = this.running
    this.running = undefined
    if (!running) return
    this.verifiedEndpoints.delete(running.generation)
    this.requestAdmissions.delete(running.generation)
    await this.terminate(running.child)
  }

  private async terminate(child: ChildProcess): Promise<void> {
    if (!this.isAlive(child)) return
    child.stdin?.end()
    if (await waitForProcessExit(child, STOP_TIMEOUT_MS)) return
    await terminateProcessTree(child, true, 'UAR sidecar')
    await waitForProcessExit(child, 1_000)
  }

  private isAlive(child: ChildProcess): boolean {
    return child.exitCode === null && child.signalCode === null
  }

  private storageStatus(storage: AppliedUarStorage): NonNullable<UarSidecarEndpoint['storage']> {
    return { revision: storage.revision, profile: storage.profile }
  }
}
