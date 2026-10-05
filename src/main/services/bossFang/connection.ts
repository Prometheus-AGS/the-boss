import { Mutex } from 'async-mutex'
import * as z from 'zod'

import { application } from '@application'
import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import { uarPrincipalForSession } from '@main/ai/runtime/uar/uarPrincipal'
import type { UarSidecarEndpoint } from '@main/ai/runtime/uar/UarSidecarService'
import { readIntegrationConfig, readUarInstanceCredentials } from '@main/services/prometheus/integrationConfig'
import type { BossFangConfig } from '@shared/types/bossFang'

const grantSchema = z.object({
  id: z.string(),
  token: z.string(),
  expires_at: z.string(),
  principal: z.string(),
  instance_id: z.string(),
  runtime_epoch: z.string(),
  workspace_ids: z.array(z.string()),
  operations: z.array(z.string())
})
export class BossFangConnection {
  private readonly mutex = new Mutex()
  state: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  error: string | null = null
  endpoint: UarSidecarEndpoint | null = null
  expiresAt: string | null = null
  private grant: z.infer<typeof grantSchema> | null = null
  private renewal: ReturnType<typeof setTimeout> | null = null
  private config: BossFangConfig | null = null
  constructor(
    private readonly request: (pathname: string, init?: RequestInit) => Promise<Response>,
    private readonly safe: (text: string) => string,
    private readonly log: (text: string) => void
  ) {}

  async connect(config: BossFangConfig) {
    return this.mutex.runExclusive(() => this.connectUnlocked(config))
  }
  private async connectUnlocked(config: BossFangConfig) {
    this.state = 'connecting'
    this.error = null
    try {
      if (this.endpoint) {
        const response = await this.request('/api/uar/disconnect', { method: 'POST' })
        if (!response.ok) throw new Error(`BossFang disconnect failed (HTTP ${response.status})`)
      }
      await this.releaseGrant()
      if (!config.workspaceId.trim()) throw new Error('Select a workspace before authorizing the UAR connection')
      agentWorkspaceService.getById(config.workspaceId)
      const sidecar = application.get('UarSidecarService')
      const endpoint = await sidecar.resolveInstance(config.uarInstanceId)
      this.endpoint = endpoint
      const selected = readIntegrationConfig().uar.instances.find((x) => x.id === config.uarInstanceId && x.enabled)
      if (!selected) throw new Error('Selected UAR instance is unavailable; choose an enabled instance in Settings')
      let bearer: string
      if (endpoint.ownership === 'managed') {
        const response = await sidecar.requestInstance(
          endpoint,
          '/api/uar/delegation-grants',
          uarPrincipalForSession('bossfang'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_ids: [config.workspaceId],
              operations: ['discovery', 'model_read', 'model_completion', 'full_harness_delegation']
            })
          }
        )
        if (!response.ok)
          throw new Error(
            `UAR delegation grant was refused (HTTP ${response.status}); verify workspace access and installed runtime`
          )
        this.grant = grantSchema.parse(await response.json())
        if (this.grant.instance_id !== endpoint.observed.id || !this.grant.workspace_ids.includes(config.workspaceId))
          throw new Error('UAR grant does not match the selected instance and workspace')
        bearer = this.grant.token
        this.expiresAt = this.grant.expires_at
      } else {
        const credentials = await readUarInstanceCredentials(selected.id)
        if (!credentials.runtimeBearer) throw new Error('Configure the external UAR runtime credential in UAR Settings')
        bearer = credentials.runtimeBearer
        this.expiresAt = null
      }
      const response = await this.request('/api/uar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance: {
            id: endpoint.observed.id,
            ownership: 'external',
            endpoints: endpoint.observed.endpoints,
            workspace_locality: selected.workspaceLocation,
            workspace: null,
            credential_refs: {},
            profile: endpoint.observed.profile,
            capabilities: [...endpoint.capabilities],
            required_profile: selected.profile,
            required_capabilities: selected.requiredCapabilities
          },
          bearer,
          workspaceId: config.workspaceId
        })
      })
      if (!response.ok)
        throw new Error(
          `BossFang could not connect to UAR (HTTP ${response.status}); inspect dashboard connection diagnostics`
        )
      this.endpoint = endpoint
      this.config = structuredClone(config)
      this.state = 'connected'
      this.log(`Connected BossFang to UAR ${selected.name}, generation ${endpoint.generation}`)
      this.scheduleRenewal()
    } catch (error) {
      await this.releaseGrant()
      this.state = 'error'
      this.error = this.safe(error instanceof Error ? error.message : String(error))
      throw new Error(this.error)
    }
  }
  private scheduleRenewal() {
    if (this.renewal) clearTimeout(this.renewal)
    // Refresh generation as well as expiry. A restarted UAR cannot retain an old grant.
    this.renewal = setTimeout(
      () => {
        void this.refresh().catch(() => undefined)
      },
      this.expiresAt ? Math.min(30_000, Math.max(1_000, Date.parse(this.expiresAt) - Date.now() - 60_000)) : 30_000
    )
  }
  async refresh() {
    return this.mutex.runExclusive(() => this.refreshUnlocked())
  }
  private async refreshUnlocked() {
    if (!this.config || this.state !== 'connected' || !this.endpoint) return
    try {
      const next = await application.get('UarSidecarService').resolveInstance(this.config.uarInstanceId)
      if (
        next.generation !== this.endpoint.generation ||
        (this.expiresAt && Date.parse(this.expiresAt) - Date.now() <= 60_000)
      )
        await this.connectUnlocked(this.config)
      else this.scheduleRenewal()
    } catch (error) {
      this.state = 'error'
      this.error = this.safe(error instanceof Error ? error.message : String(error))
      await this.releaseGrant()
      this.log('UAR connection expired; reconnect after restoring the selected runtime')
    }
  }
  async disconnect() {
    return this.mutex.runExclusive(() => this.disconnectUnlocked())
  }
  private async disconnectUnlocked() {
    if (this.renewal) clearTimeout(this.renewal)
    this.renewal = null
    try {
      if (this.endpoint) {
        const response = await this.request('/api/uar/disconnect', { method: 'POST' })
        if (!response.ok) throw new Error(`BossFang disconnect failed (HTTP ${response.status})`)
      }
    } finally {
      await this.releaseGrant()
      this.endpoint = null
      this.config = null
      this.state = 'disconnected'
      this.error = null
    }
  }
  private async releaseGrant() {
    const grant = this.grant
    this.grant = null
    this.expiresAt = null
    if (!grant || !this.endpoint) return
    const response = application
      .get('UarSidecarService')
      .requestInstanceCurrent(
        this.endpoint,
        `/api/uar/delegation-grants/${encodeURIComponent(grant.id)}`,
        uarPrincipalForSession('bossfang'),
        { method: 'DELETE' }
      )
    if (response)
      await response.catch(() => this.log('Could not revoke previous UAR grant; its bounded expiry remains in force'))
  }
  redact(text: string) {
    return this.grant?.token ? text.split(this.grant.token).join('<redacted>') : text
  }
}
