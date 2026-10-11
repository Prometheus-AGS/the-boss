import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

import { t } from '@main/i18n'
import type { IntegrationConfig } from '@shared/types/prometheusIntegration'

import {
  readIntegrationDocument,
  readMemoryCredential,
  writeIntegrationDocument
} from '../../prometheus/integrationConfig'
import { discoverServiceCandidates } from '../../prometheus/serviceDiscovery'

export type MemoryConnection = IntegrationConfig['services']['memory']

/** Only the application-default selection is replaced by workstation discovery. */
export async function selectMemoryConnection(): Promise<MemoryConnection> {
  const document = readIntegrationDocument()
  const selected = document.config.services.memory
  if (selected.source !== 'application') return selected
  const inventory = await discoverServiceCandidates(document.config)
  const detected = inventory.candidates.find(
    (entry) => entry.service === 'memory' && entry.provenance.some((p) => p.source === 'full-pack')
  )
  if (!detected) return selected
  const current = readIntegrationDocument()
  if (JSON.stringify(current.config.services.memory) !== JSON.stringify(selected)) return current.config.services.memory
  const memory: MemoryConnection = { endpoint: detected.endpoint, ownership: 'external', source: 'full-pack' }
  current.config.services.memory = memory
  current.config.services.memoryEnabled = true
  current.revisions.services++
  await writeIntegrationDocument(current)
  return memory
}

export async function withMemoryClient<T>(
  connection: MemoryConnection,
  operation: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({ name: 'the-boss-scoped-memory', version: '1.0.0' })
  // The existing resource credential belongs to the selected memory endpoint, never UAR identity.
  const selected = readIntegrationDocument().config.services.memory
  if (selected.endpoint !== connection.endpoint) throw new Error(t('bossfang.sharedMemoryUnavailable'))
  const credential = await readMemoryCredential(connection.endpoint)
  const headers: Record<string, string> = credential ? { Authorization: 'Bearer ' + credential } : {}
  const url = new URL(connection.endpoint)
  const trustedFetch: typeof fetch = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input))
    if (target.origin !== url.origin) throw new Error(t('bossfang.sharedMemoryUnavailable'))
    return fetch(input, {
      ...init,
      redirect: 'error',
      headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers }
    })
  }
  const transport = /\/sse\/?$/.test(url.pathname)
    ? new SSEClientTransport(url, {
        requestInit: { headers },
        fetch: trustedFetch,
        eventSourceInit: { fetch: trustedFetch }
      })
    : new StreamableHTTPClientTransport(url, { requestInit: { headers }, fetch: trustedFetch })
  try {
    await client.connect(transport, { timeout: 15_000 })
    return await operation(client)
  } catch {
    // Upstream messages can include resource credentials. Keep the renderer/tool error categorical.
    throw new Error(t('bossfang.sharedMemoryUnavailable'))
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function memoryCall(
  connection: MemoryConnection,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const raw = await withMemoryClient(connection, (client) => client.callTool({ name, arguments: args }))
  const result = CallToolResultSchema.parse(raw)
  if (result.isError) throw new Error(t('bossfang.sharedMemoryUnavailable'))
  try {
    return JSON.parse(
      result.content
        .filter((entry) => entry.type === 'text')
        .map((entry) => entry.text)
        .join('\n')
    )
  } catch {
    throw new Error(t('bossfang.sharedMemoryInvalidResponse'))
  }
}
