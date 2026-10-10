import { Mutex } from 'async-mutex'

import { application } from '@application'
import type { UarSidecarEndpoint } from '@main/ai/runtime/uar/UarSidecarService'
import { t } from '@main/i18n'
import type { BossFangConfig } from '@shared/types/bossFang'

import { RetainedUarAuthorizations, type PrivateUarAuthorization } from './retainedAuthorizations'

export class BossFangConnection {
  private readonly mutex = new Mutex()
  state: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  error: string | null = null
  private current: PrivateUarAuthorization | null = null
  private renewal: ReturnType<typeof setTimeout> | null = null
  private config: BossFangConfig | null = null
  private stopped = false
  private readonly retained: RetainedUarAuthorizations
  constructor(
    private readonly request: (pathname: string, init?: RequestInit) => Promise<Response>,
    private readonly safe: (text: string) => string,
    private readonly log: (text: string) => void
  ) {
    this.retained = new RetainedUarAuthorizations(request, log)
  }
  get endpoint(): UarSidecarEndpoint | null {
    return this.current?.endpoint ?? null
  }
  get expiresAt(): string | null {
    return this.current?.grant?.expires_at ?? null
  }
  async connect(config: BossFangConfig) {
    return this.mutex.runExclusive(() => this.connectUnlocked(config))
  }
  private async connectUnlocked(config: BossFangConfig) {
    this.stopped = false
    this.state = 'connecting'
    this.error = null
    let candidate: PrivateUarAuthorization | undefined,
      applied = false
    try {
      candidate = await this.retained.create(config.uarInstanceId, config.workspaceId)
      const response = await this.request('/api/uar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance: this.retained.instance(candidate),
          bearer: candidate.bearer,
          workspaceId: config.workspaceId,
          delegatedHostContexts: candidate.contexts.map((context) => context.safe)
        })
      })
      if (!response.ok)
        throw new Error(`${t('bossfang.retainedAuthentication')} [SELECTED_CONNECT_HTTP_${response.status}]`)
      applied = true
      this.current = candidate
      this.config = structuredClone(config)
      this.state = 'connected'
      // Selection is replaced only for new admissions. Existing original run transports keep their grants.
      await this.retained.refresh(candidate)
      this.log(`Connected BossFang to UAR ${config.uarInstanceId}, generation ${candidate.endpoint.generation}`)
    } catch (error) {
      if (candidate && !applied) await this.retained.revoke(candidate)
      this.state = 'error'
      this.error = this.safe(error instanceof Error ? error.message : String(error))
      throw new Error(this.error)
    } finally {
      this.scheduleRenewal()
    }
  }
  private scheduleRenewal() {
    if (this.renewal) clearTimeout(this.renewal)
    this.renewal = null
    if (this.stopped || (!this.current && !this.retained.hasRecords)) return
    // One explicit connection-lifecycle timer refreshes selected and original admitted authority.
    this.renewal = setTimeout(
      () => {
        void this.refresh().catch(() => undefined)
      },
      this.state === 'connected' && this.expiresAt
        ? Math.min(30_000, Math.max(1_000, Date.parse(this.expiresAt) - Date.now() - 60_000))
        : 30_000
    )
  }
  async refresh() {
    return this.mutex.runExclusive(async () => {
      if (this.stopped) return
      let selectedRefresh = false
      try {
        if (this.config && this.state === 'connected' && this.current) {
          selectedRefresh = true
          const next = await application.get('UarSidecarService').resolveInstance(this.config.uarInstanceId)
          if (
            next.generation !== this.current.endpoint.generation ||
            (this.expiresAt && Date.parse(this.expiresAt) - Date.now() <= 60_000)
          )
            await this.connectUnlocked(this.config)
          selectedRefresh = false
        }
        if (this.retained.hasRecords) await this.retained.refresh(this.state === 'connected' ? this.current : null)
        if (this.state !== 'error') this.error = null
      } catch (error) {
        if (selectedRefresh) this.state = 'error'
        this.error = this.safe(error instanceof Error ? error.message : String(error))
        this.log(this.error)
      } finally {
        this.scheduleRenewal()
      }
    })
  }
  async disconnect() {
    return this.mutex.runExclusive(async () => {
      try {
        if (this.current) {
          const response = await this.request('/api/uar/disconnect', { method: 'POST' })
          if (!response.ok)
            throw new Error(`${t('bossfang.retainedAuthentication')} [SELECTED_DISCONNECT_HTTP_${response.status}]`)
        }
        this.current = null
        this.config = null
        this.state = 'disconnected'
        this.error = null
        if (this.retained.hasRecords) await this.retained.refresh(null)
      } catch (error) {
        this.error = this.safe(error instanceof Error ? error.message : String(error))
        throw new Error(this.error)
      } finally {
        this.scheduleRenewal()
      }
    })
  }
  async shutdown() {
    this.stopped = true
    if (this.renewal) clearTimeout(this.renewal)
    this.renewal = null
    return this.mutex.runExclusive(async () => {
      try {
        if (this.current) {
          const response = await this.request('/api/uar/disconnect', { method: 'POST' })
          if (!response.ok)
            this.log(`${t('bossfang.retainedAuthentication')} [SHUTDOWN_DISCONNECT_HTTP_${response.status}]`)
        }
      } finally {
        await this.retained.shutdown()
        this.current = null
        this.config = null
        this.state = 'disconnected'
        this.error = null
      }
    })
  }
  redact(text: string) {
    if (this.current) text = text.split(this.current.bearer).join('<redacted>')
    return this.retained.redact(text)
  }
  async inspectDelegatedApproval(bossTaskId: string) {
    try {
      return await this.retained.inspectDelegatedApproval(bossTaskId)
    } catch {
      throw new Error(`${t('bossfang.retainedAuthentication')} [DELEGATED_APPROVAL_INSPECTION_UNAVAILABLE]`)
    }
  }
}
