import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'

import * as z from 'zod'

import { application } from '@application'
import { t } from '@main/i18n'
import { bossFangDiagnosticSchema, type BossFangDiagnostic } from '@shared/types/bossFang'

import { readConfig } from './storage'

const projectionSchema = z.object({
  bossTaskId: z.string(),
  workspaceId: z.string(),
  selectedInstanceId: z.string(),
  executionState: z.string(),
  cancellation: z
    .object({ requested: z.boolean(), acknowledged: z.boolean(), terminal: z.boolean(), cleanupUncertain: z.boolean() })
    .optional()
})
const eventPageSchema = z.object({
  delegation: projectionSchema,
  events: z.array(
    z.object({ cursor: z.number(), type: z.string(), occurredAt: z.string().optional(), data: z.unknown() })
  )
})
const modelUsageSchema = z.object({
  input_tokens: z.number().nonnegative().nullable(),
  output_tokens: z.number().nonnegative().nullable()
})
export class BossFangDiagnostics {
  private records = new Map<string, BossFangDiagnostic>()
  private cancelled = new Set<string>()
  private writes = Promise.resolve()
  private stopping = false
  lastId: string | null = null
  constructor(
    private readonly request: (path: string, init?: RequestInit) => Promise<Response>,
    private readonly observationRequest: () => (path: string) => Promise<Response>,
    private readonly connect: () => Promise<unknown>,
    private readonly models: () => Promise<{ id: string; name: string; provider: string; modelId: string }[]>,
    private readonly safe: (text: string) => string,
    private readonly selectedInstance: () => string | undefined,
    private readonly log: (text: string) => void
  ) {}
  async initialize() {
    const file = application.getPath('feature.agents.bossfang.data', 'diagnostic-index.json')
    if (existsSync(file)) {
      this.lastId = z.object({ id: z.uuid() }).parse(JSON.parse(await fs.readFile(file, 'utf8'))).id
      await this.restore(this.lastId)
    }
  }
  private file(id: string) {
    z.uuid().parse(id)
    return application.getPath('feature.agents.bossfang.data', 'diagnostic-' + id + '.json')
  }
  status(id: string): BossFangDiagnostic {
    const result = this.records.get(id)
    if (!result) throw new Error('Diagnostic record is unavailable; reopen the dashboard to inspect existing runs')
    return structuredClone(result)
  }
  async restore(id: string) {
    if (this.records.has(id)) return this.status(id)
    const file = this.file(id)
    if (!existsSync(file)) throw new Error('Diagnostic record is unavailable')
    const record = bossFangDiagnosticSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')))
    if (record.status === 'running') {
      record.status = 'failed'
      record.error =
        'BossFang diagnostic observer restarted; inspect the existing run before retrying. It was not replayed.'
      record.action = 'open_dashboard'
    }
    this.records.set(id, record)
    return this.status(id)
  }
  private publish(record: BossFangDiagnostic) {
    application.get('IpcApiService').broadcast('bossfang.diagnostic.progress', structuredClone(record))
    this.lastId = record.id
    const body = JSON.stringify(record)
    this.writes = this.writes
      .then(async () => {
        await fs.mkdir(application.getPath('feature.agents.bossfang.data'), { recursive: true, mode: 0o700 })
        const file = this.file(record.id)
        await fs.writeFile(file + '.tmp', body, { mode: 0o600 })
        await fs.rename(file + '.tmp', file)
        const index = application.getPath('feature.agents.bossfang.data', 'diagnostic-index.json')
        await fs.writeFile(index + '.tmp', JSON.stringify({ id: record.id }), { mode: 0o600 })
        await fs.rename(index + '.tmp', index)
      })
      .catch(() => this.log('Could not persist redacted BossFang diagnostic record'))
  }
  private stage(
    record: BossFangDiagnostic,
    name: BossFangDiagnostic['stages'][number]['stage'],
    status: BossFangDiagnostic['stages'][number]['status'],
    detail = ''
  ) {
    const stage = record.stages.find((x) => x.stage === name)!
    stage.status = status
    stage.detail = this.safe(detail)
    this.publish(record)
  }
  private check(
    record: BossFangDiagnostic,
    name: keyof BossFangDiagnostic['checks'],
    status: BossFangDiagnostic['checks'][typeof name]
  ) {
    record.checks[name] = status
    this.publish(record)
  }
  private async checkConnection(record: BossFangDiagnostic) {
    for (const name of ['listening', 'authenticated'] as const) {
      this.check(record, name, 'running')
      const response = await this.request(name === 'listening' ? '/api/health' : '/api/authz/whoami')
      const body = await response.json().catch(() => null)
      const valid =
        name === 'listening'
          ? z.object({ status: z.literal('ok') }).safeParse(body).success
          : z.object({ user_id: z.string().min(1), role: z.enum(['viewer', 'user', 'admin', 'owner']) }).safeParse(body)
              .success
      this.check(record, name, response.ok && valid ? 'succeeded' : 'failed')
      if (!response.ok || !valid)
        throw new Error(t('bossfang.diagnosticCheckFailed') + ' [' + name + '_HTTP_' + response.status + ']')
    }
  }
  private async checkCompatibility(record: BossFangDiagnostic) {
    this.check(record, 'compatible', 'running')
    const response = await this.request('/api/uar/status')
    const result = z
      .object({
        state: z.literal('healthy'),
        selected_instance_id: z.string(),
        effective_binding: z.object({ instance_id: z.string(), capabilities: z.array(z.string()) }),
        compatibility: z.null()
      })
      .safeParse(await response.json().catch(() => null))
    const compatible =
      response.ok &&
      result.success &&
      result.data.selected_instance_id === record.instanceId &&
      result.data.effective_binding.instance_id === record.instanceId &&
      result.data.effective_binding.capabilities.includes('full_harness_delegation_v1')
    this.check(record, 'compatible', compatible ? 'succeeded' : 'failed')
    if (!compatible)
      throw new Error(t('bossfang.diagnosticCheckFailed') + ' [COMPATIBILITY_HTTP_' + response.status + ']')
  }
  async start(model: string) {
    const config = readConfig()
    const running = [...this.records.values()].find((x) => x.status === 'running')
    if (running) throw new Error('Wait for the running diagnostic or cancel it before starting another')
    const record: BossFangDiagnostic = {
      id: randomUUID(),
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      instanceId: config.uarInstanceId,
      workspaceId: config.workspaceId,
      model,
      taskId: null,
      cancellation: null,
      checks: {
        listening: 'pending',
        authenticated: 'pending',
        compatible: 'pending',
        delegationOperational: 'pending'
      },
      stages: ['connection', 'models', 'admission', 'delegation', 'completion'].map((stage) => ({
        stage: stage as BossFangDiagnostic['stages'][number]['stage'],
        status: 'pending',
        detail: ''
      })),
      events: [],
      usage: null,
      error: null,
      action: null
    }
    this.records.set(record.id, record)
    this.publish(record)
    void this.perform(record)
    return this.status(record.id)
  }
  private async perform(record: BossFangDiagnostic) {
    let stage: BossFangDiagnostic['stages'][number]['stage'] = 'connection'
    try {
      this.stage(record, stage, 'running')
      await this.checkConnection(record)
      await this.connect()
      const current = readConfig()
      if (current.workspaceId !== record.workspaceId || current.uarInstanceId !== record.instanceId)
        throw new Error('Diagnostic selection changed before admission; start a new diagnostic for the saved selection')
      record.instanceId = this.selectedInstance() ?? record.instanceId
      await this.checkCompatibility(record)
      if (this.cancelled.has(record.id)) throw new Error('Diagnostic cancelled before admission')
      this.stage(record, stage, 'succeeded')
      stage = 'models'
      this.stage(record, stage, 'running')
      const selected = (await this.models()).find((x) => x.id === record.model)
      if (!selected) {
        record.action = 'select_model'
        throw new Error('Selected model is unavailable in the current UAR registry; choose an enabled configured model')
      }
      this.stage(record, stage, 'succeeded', selected.provider + '/' + selected.modelId)
      const beforeAdmission = readConfig()
      if (
        beforeAdmission.workspaceId !== current.workspaceId ||
        beforeAdmission.uarInstanceId !== current.uarInstanceId ||
        this.selectedInstance() !== record.instanceId
      )
        throw new Error('Diagnostic selection changed before admission; reconnect the saved selection')
      const observe = this.observationRequest()
      stage = 'admission'
      this.stage(record, stage, 'running')
      const response = await this.request('/api/uar/diagnostics/delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: record.workspaceId,
          providerId: selected.provider,
          model: selected.modelId,
          bossTaskId: record.id
        })
      })
      if (!response.ok)
        throw new Error(
          `Real diagnostic admission failed (HTTP ${response.status}); check UAR connection, model configuration and native dashboard diagnostics`
        )
      const projection = projectionSchema.parse(await response.json())
      if (projection.workspaceId !== record.workspaceId || projection.selectedInstanceId !== record.instanceId)
        throw new Error('Diagnostic admission returned a different workspace or instance')
      record.cancellation = projection.cancellation ?? null
      record.taskId = projection.bossTaskId
      this.stage(record, stage, 'succeeded', projection.bossTaskId)
      if (this.cancelled.has(record.id)) await this.cancelNative(record)
      stage = 'delegation'
      this.stage(record, stage, 'running')
      let cursor = 0
      let modelTextObserved = false
      this.check(record, 'delegationOperational', 'running')
      while (!this.stopping) {
        const response = await observe(
          `/api/uar/delegations/${encodeURIComponent(record.taskId)}/events?after=${cursor}`
        )
        if (!response.ok)
          throw new Error(
            `Diagnostic stream is unavailable (HTTP ${response.status}); inspect the existing run before retrying`
          )
        const page = eventPageSchema.parse(await response.json())
        if (
          page.delegation.bossTaskId !== record.taskId ||
          page.delegation.workspaceId !== record.workspaceId ||
          page.delegation.selectedInstanceId !== record.instanceId
        )
          throw new Error('Diagnostic stream identity does not match the admitted run')
        record.cancellation = page.delegation.cancellation ?? null
        for (const event of page.events) {
          if (event.cursor <= cursor) continue
          cursor = event.cursor
          // Remote event bodies are untrusted. Export only redacted text and measured usage.
          record.events.push({
            cursor,
            type: event.type,
            ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
            detail: this.safe(JSON.stringify(event.data))
          })
          if (event.type === 'agui.message.delta') {
            const delta = z.object({ delta: z.object({ text: z.string() }) }).safeParse(event.data)
            if (delta.success && delta.data.delta.text.trim().length > 0) modelTextObserved = true
          }
          if (event.type === 'agui.done' && event.data && typeof event.data === 'object') {
            const data = event.data as Record<string, unknown>
            const usage = modelUsageSchema.safeParse(data.usage)
            if (usage.success)
              record.usage = { inputTokens: usage.data.input_tokens, outputTokens: usage.data.output_tokens }
          }
        }
        this.publish(record)
        const state = page.delegation.executionState
        if (['completed', 'failed', 'cancelled'].includes(state)) {
          const succeeded = state === 'completed' && modelTextObserved
          this.check(record, 'delegationOperational', succeeded ? 'succeeded' : 'failed')
          record.status = succeeded ? 'succeeded' : state === 'cancelled' ? 'cancelled' : 'failed'
          if (!succeeded) {
            record.error = this.safe(`Diagnostic execution ended in ${state}; inspect the retained run events`)
            record.action = 'open_dashboard'
          }
          this.stage(record, stage, succeeded ? 'succeeded' : 'failed')
          this.stage(record, 'completion', succeeded ? 'succeeded' : 'failed', state)
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      if (this.stopping) {
        this.check(record, 'delegationOperational', 'failed')
        record.status = 'failed'
        record.error = 'Diagnostic observer stopped; execution was not replayed or implicitly cancelled'
        record.action = 'open_dashboard'
      }
    } catch (error) {
      for (const name of Object.keys(record.checks) as (keyof BossFangDiagnostic['checks'])[])
        if (record.checks[name] === 'running') record.checks[name] = 'failed'
      record.status = this.cancelled.has(record.id) && !record.taskId ? 'cancelled' : 'failed'
      record.error = this.safe(error instanceof Error ? error.message : String(error))
      record.action ??= 'retry'
      this.stage(record, stage, 'failed', record.error)
    } finally {
      record.completedAt = new Date().toISOString()
      this.publish(record)
    }
  }
  private async cancelNative(record: BossFangDiagnostic) {
    if (!record.taskId) return
    const response = await this.request(`/api/uar/delegations/${encodeURIComponent(record.taskId)}/cancel`, {
      method: 'POST'
    })
    if (!response.ok)
      throw new Error(`Cancellation was not acknowledged (HTTP ${response.status}); inspect the native run`)
    const projection = projectionSchema.parse(await response.json())
    if (
      projection.bossTaskId !== record.taskId ||
      projection.workspaceId !== record.workspaceId ||
      projection.selectedInstanceId !== record.instanceId
    )
      throw new Error('Cancellation receipt does not match the admitted diagnostic')
    record.cancellation = projection.cancellation ?? null
  }
  async cancel(id: string) {
    const record = this.records.get(id)
    if (!record || record.status !== 'running') throw new Error('No running diagnostic can be cancelled')
    this.cancelled.add(id)
    await this.cancelNative(record)
    this.publish(record)
    return this.status(id)
  }
  async stop() {
    this.stopping = true
    await this.writes
  }
}
