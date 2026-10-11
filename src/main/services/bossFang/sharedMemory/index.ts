import * as z from 'zod'

import { application } from '@application'
import { createAuthenticatedHostCallback } from '@main/ai/runtime/uar/UarHostMcpBridge'
import { t } from '@main/i18n'
import type { BossFangConfig, BossFangStatus } from '@shared/types/bossFang'

import { selectMemoryConnection, withMemoryClient, type MemoryConnection } from './connection'
import { scopedMemoryOperation } from './scoped'

const invocation = z
  .object({
    version: z.literal(1),
    agentId: z.string().uuid(),
    operation: z.enum(['remember', 'retrieve', 'search']),
    arguments: z.record(z.string(), z.unknown())
  })
  .strict()

/** Owned by BossFangService, with a per-process callback credential and frozen workspace. */
export class BossFangSharedMemory {
  status: BossFangStatus['sharedMemory'] = {
    source: null,
    endpoint: null,
    workspaceId: null,
    scope: 'workspace',
    error: null
  }
  readiness: BossFangStatus['services']['sharedMemory'] = { state: 'unknown', detail: null }
  private callback: Awaited<ReturnType<typeof createAuthenticatedHostCallback>> | null = null
  private connection: MemoryConnection | null = null
  private workspaceId: string | null = null

  async configure(config: BossFangConfig): Promise<void> {
    this.readiness = { state: 'connecting', detail: null }
    try {
      const connection = await selectMemoryConnection()
      if (
        (this.workspaceId !== config.workspaceId || this.connection?.endpoint !== connection.endpoint) &&
        this.callback
      ) {
        await this.callback.close()
        this.callback = null
      }
      this.workspaceId = config.workspaceId
      this.connection = connection
      this.status = {
        source: connection.source,
        endpoint: connection.endpoint,
        workspaceId: config.workspaceId,
        scope: 'workspace',
        error: null
      }
      if (!config.workspaceId) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
      // Capability discovery is readiness, not a claim that memory has been stored or recovered.
      await withMemoryClient(connection, async (client) => {
        const { tools } = await client.listTools()
        if (!['add_memory', 'get_memory', 'search_memories'].every((name) => tools.some((tool) => tool.name === name)))
          throw new Error(t('bossfang.sharedMemoryUnavailable'))
      })
      this.readiness = { state: 'ready', detail: null }
    } catch {
      this.status.error = t('bossfang.sharedMemoryUnavailable')
      this.readiness = { state: 'unavailable', detail: this.status.error }
    }
  }

  async nativeEnvironment(): Promise<Record<string, string>> {
    if (!this.workspaceId) return {}
    if (!this.callback) {
      const workspaceId = this.workspaceId
      const connection = this.connection
      this.callback = await createAuthenticatedHostCallback(async (body) => {
        try {
          const call = invocation.parse(body)
          if (this.workspaceId !== workspaceId || !connection) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
          // The daemon authenticates the original caller; independently confirm that agent still exists.
          const response = await application
            .get('BossFangService')
            .request('/api/agents/' + encodeURIComponent(call.agentId))
          if (!response.ok) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
          const agent = z.object({ id: z.string() }).parse(await response.json())
          if (agent.id !== call.agentId) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
          const result = await scopedMemoryOperation(
            connection,
            { workspaceId, agentId: 'bossfang:' + call.agentId },
            call.operation,
            call.arguments
          )
          this.status.error = null
          this.readiness = { state: 'ready', detail: null }
          return result
        } catch (error) {
          const detail =
            error instanceof Error && !(error instanceof z.ZodError)
              ? error.message
              : t('bossfang.sharedMemoryScopeDenied')
          this.status.error = detail
          this.readiness = { state: 'unavailable', detail }
          return { isError: true, content: [{ type: 'text', text: detail }] }
        }
      })
    }
    return { BOSS_SHARED_MEMORY_URL: this.callback.url, BOSS_SHARED_MEMORY_TOKEN: this.callback.token }
  }

  redact(text: string): string {
    if (!this.callback) return text
    return text.split(this.callback.token).join('<redacted>').split(this.callback.url).join('<host-resource>')
  }

  async close(): Promise<void> {
    await this.callback?.close()
    this.callback = null
    this.readiness = { state: 'unknown', detail: null }
  }
}
