import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, isInitializeRequest, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ElectronApplication, Page } from '@playwright/test'

import type { ProjectionResultDiagnostic } from './bauar-secret-projection-provider'

import { createUarHostMcpBridge } from '../../src/main/ai/runtime/uar/UarHostMcpBridge'
import { UAR_TOOL_ADMISSION_META_KEY, UAR_TOOL_ADMISSION_VERSION } from '../../src/main/ai/runtime/uar/UarHostToolAdmission'
import { createUarSecretProjection } from '../../src/main/ai/runtime/uar/uarSecretProjection'

export type ProjectionCatalogProfile = 'eager' | 'deferred'
export type ProjectionToolMode = 'success' | 'isError' | 'error' | 'cancel'
type Call = { mode: ProjectionToolMode; originalArguments: boolean }
type McpSinkSpan = {
  category: 'catalog_list' | 'target_call' | 'other_mcp';
  canary: boolean; replacement: boolean; inputReplacement: boolean; error: boolean;
  inputCanary: boolean; outputCanary: boolean; statusCanary: boolean; eventCanary: boolean; catalogIdentityOnly: boolean
}
type McpSinkCapture = {
  observation: { tracerRequests: number; mcpSpansStarted: number };
  logs: Array<{ canary: boolean; replacement: boolean; error: boolean }>; spans: McpSinkSpan[]
}

function toolServer(
  canary: string,
  calls: Call[],
  beforeEffect: (request: any) => void = () => undefined,
  privateOutput: () => string = () => '',
  profile: ProjectionCatalogProfile = 'eager',
  onFiller: () => void = () => undefined
): McpServer {
  const server = new McpServer({ name: 'projection-fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...(profile === 'deferred'
    ? Array.from({ length: 32 }, (_, index) => ({ name: `a_filler_${String(index).padStart(2, '0')}`,
      description: 'Eligible fixture filler; invocation is refused', annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: {} } })) : []), {
    name: 'read_projection', description: 'Read a synthetic projection fixture', annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { echo: { type: 'string' }, mode: { type: 'string' } }, required: ['echo', 'mode'] }
  }] }))
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== 'read_projection') {
      onFiller()
      throw new Error('projection_filler_dispatch_refused')
    }
    beforeEffect(request)
    const mode = request.params.arguments?.mode as ProjectionToolMode
    calls.push({ mode, originalArguments: request.params.arguments?.echo === canary })
    if (request.params._meta?.progressToken !== undefined) {
      await extra.sendNotification({ method: 'notifications/progress', params: {
        progressToken: request.params._meta.progressToken, progress: 1, total: 1, message: `Fixture progress ${canary}`
      } })
    }
    if (mode === 'cancel') {
      await new Promise<void>((resolve) => {
        if (extra.signal.aborted) resolve()
        else extra.signal.addEventListener('abort', () => resolve(), { once: true })
      })
      throw extra.signal.reason
    }
    if (mode === 'error') throw new Error(`Fixture diagnostic ${canary}`)
    return {
      content: [{ type: 'text', text: `Benign tool result ${canary} ${privateOutput()}` }],
      structuredContent: { nested: { credentialEcho: canary }, benign: 'kept' },
      isError: mode === 'isError'
    }
  })
  return server
}

/** Real HTTP SDK fixture used as an external server by the isolated application. */
export async function startProjectionMcp(canary: string, profile: ProjectionCatalogProfile = 'eager') {
  const calls: Call[] = []
  let fillerCalls = 0
  const sessions = new Map<string, StreamableHTTPServerTransport>()
  const servers = new Set<McpServer>()
  const initialization = { authenticatedInitializations: 0, sessionsCreated: 0, responses: 0,
    accepted: 0, lastStatus: null as number | null }
  let authorized = 0
  const http = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${canary}`) {
      response.writeHead(403).end()
      return
    }
    authorized += 1
    const dispatch = async () => {
      const sessionId = request.headers['mcp-session-id']
      if (typeof sessionId === 'string') {
        const transport = sessions.get(sessionId)
        if (!transport) { response.writeHead(404).end(); return }
        await transport.handleRequest(request, response)
        return
      }
      if (request.method !== 'POST') { response.writeHead(400).end(); return }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!isInitializeRequest(body)) { response.writeHead(400).end(); return }
      initialization.authenticatedInitializations += 1
      response.once('finish', () => {
        initialization.responses += 1
        initialization.lastStatus = response.statusCode
        if (response.statusCode >= 200 && response.statusCode < 300) initialization.accepted += 1
      })
      // A fresh desktop process is a fresh MCP client, not a reinitialization of the old session.
      const server = toolServer(canary, calls, undefined, undefined, profile, () => { fillerCalls += 1 })
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID,
        onsessioninitialized: (id) => { sessions.set(id, transport); initialization.sessionsCreated += 1 } })
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId)
        servers.delete(server)
      }
      servers.add(server)
      await server.connect(transport)
      await transport.handleRequest(request, response, body)
    }
    void dispatch().catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const address = http.address()
  assert(address && typeof address !== 'string')
  return {
    url: `http://127.0.0.1:${address.port}/mcp`, calls,
    authenticatedRequests: () => authorized, fillerCalls: () => fillerCalls,
    diagnostic: () => ({ ...initialization, activeSessions: sessions.size, targetEffects: calls.length, fillerCalls }),
    async close() {
      await Promise.all([...servers].map((server) => server.close()))
      http.closeAllConnections()
      await new Promise<void>((resolve) => http.close(() => resolve()))
    }
  }
}

/** Exercise the production bridge over authenticated HTTP, including its exact admission store. */
export async function exerciseProjectedClaims(canary: string) {
  const calls: Call[] = []
  let bridge: Awaited<ReturnType<typeof createUarHostMcpBridge>>
  const server = toolServer(canary, calls, (request) => {
    const meta = request.params._meta[UAR_TOOL_ADMISSION_META_KEY]
    assert.equal(bridge.approvalSnapshot().find((entry) => entry.admissionId === meta.admissionId)?.state, 'claimed')
  }, () => bridge.redactions.join(' '))
  const projection = createUarSecretProjection([canary])
  bridge = await createUarHostMcpBridge(
    { fixture: { name: 'fixture', instance: server } },
    { ownerId: 'projection-owner', workspace: '/projection', disposition: () => 'auto' },
    () => undefined, () => projection
  )
  const mounted = bridge.servers[0]!
  const client = new Client({ name: 'projection-gate', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(mounted.url), { requestInit: { headers: mounted.headers } })
  const post = async (operation: string, body: unknown) => {
    const response = await fetch(`${bridge.toolAdmission.url}/${operation}`, {
      method: 'POST', headers: { ...bridge.toolAdmission.headers, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    assert.equal(response.status, 200)
    return response.json() as Promise<Record<string, any>>
  }
  try {
    assert.equal((await fetch(mounted.url)).status, 403)
    await client.connect(transport)
    assert(transport.sessionId)
    let ordinal = 0
    for (const mode of ['success', 'isError', 'error', 'cancel'] as const) {
      ordinal += 1
      const args = { echo: canary, mode }
      const invocation = {
        version: UAR_TOOL_ADMISSION_VERSION, executionKind: 'host_mcp', invocationId: `projection-${ordinal}`, modelToolCallId: `call-${ordinal}`,
        attempt: 1, rootRunId: 'projection-root', executingRunId: 'projection-root', ownerId: 'projection-owner',
        workspace: '/projection', runtimeEpoch: 'projection-runtime', hostEpoch: bridge.toolAdmission.hostEpoch,
        authorityRevision: `projection-authority-${ordinal}`, principalId: 'projection-owner', budgetRevision: 'budget-v1',
        lease: { leaseId: `projection-lease-${ordinal}`, task: 'projection-root', active: true, attempt: 1, epoch: 'projection-runtime', holder: 'projection-owner',
          expiresAt: Math.floor(Date.now() / 1_000) + 600 },
        budgetReservation: { reservationId: `projection-reservation-${ordinal}`, budgetId: 'projection-budget', active: true, amount: 1, unit: 'tool_call', revision: 'budget-v1',
          expiresAt: Math.floor(Date.now() / 1_000) + 600 },
        catalogRevision: 'catalog-v1', mountedServerId: 'fixture', nativeToolName: 'read_projection',
        providerToolName: 'fixture__read_projection', runPolicyRevision: 'policy-v1', toolPolicyRevision: 'tools-v1',
        approvalClass: 'not_required', callIndex: ordinal, validatedArguments: args
      }
      const prepared = await post('prepare', { invocation })
      const receipt = await post('resolve', { admissionId: prepared.admissionId, invocationId: prepared.invocationId, localDisposition: 'allowed', approved: true })
      assert.deepEqual(await post('claim', { admissionId: prepared.admissionId, invocation, receipt }), receipt)
      const progress: unknown[] = []
      const request = { name: 'read_projection', arguments: args, _meta: {
        [UAR_TOOL_ADMISSION_META_KEY]: {
          version: UAR_TOOL_ADMISSION_VERSION, executionKind: invocation.executionKind,
          admissionId: prepared.admissionId, invocationId: prepared.invocationId,
          runtimeEpoch: 'projection-runtime', hostEpoch: bridge.toolAdmission.hostEpoch, authorityRevision: prepared.authorityRevision
        }
      } }
      const abort = new AbortController()
      const pending = client.callTool(request, undefined, { signal: abort.signal, onprogress: (value) => {
        progress.push(value)
        if (mode === 'cancel') abort.abort(new Error('Projection fixture cancellation'))
      } })
      if (mode === 'cancel') {
        await assert.rejects(pending)
      } else if (mode === 'error') {
        await assert.rejects(pending, (error: Error) => !error.message.includes(canary) && error.message.includes('<redacted>'))
      } else {
        const result = await pending
        assert.equal(result.isError, mode === 'isError')
        assert.equal(JSON.stringify(result).includes(canary), false)
        assert(bridge.redactions.every((secret) => !JSON.stringify(result).includes(secret)))
        assert(JSON.stringify(result).includes('<redacted>'))
        assert.equal((result.structuredContent as any)?.benign, 'kept')
      }
      assert.equal(progress.length, 1)
      assert.equal(JSON.stringify(progress).includes(canary), false)
      assert(JSON.stringify(progress).includes('<redacted>'))
      await assert.rejects(() => client.callTool(request))
      assert.equal(calls.length, ordinal)
    }
    assert(calls.every((call) => call.originalArguments))
    return { authenticated: true, claimBeforeEffect: true, replayRejected: true, originalArguments: true,
      progress: true, structuredAndError: true, bridgePrivateValues: true, cancellation: true }
  } finally {
    await Promise.allSettled([client.close(), bridge.close()])
  }
}

/** Observe real per-call logger output and real OTel span data; delegate every original consumer. */
export async function installMcpSinkCapture(app: ElectronApplication, canary: string): Promise<void> {
  const require = createRequire(join(process.cwd(), 'package.json'))
  await app.evaluate(async (_, input) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const { fileURLToPath } = process.getBuiltinModule('node:url')
    const require = createRequire(input.otelUrl)
    const { trace } = require(fileURLToPath(input.otelUrl))
    const state = globalThis as any
    const logs: Array<{ canary: boolean; replacement: boolean; error: boolean }> = []
    const spans: McpSinkSpan[] = []
    const observation = { tracerRequests: 0, mcpSpansStarted: 0 }
    const restorers: Array<() => void> = []
    for (const level of ['debug', 'warn', 'error'] as const) {
      const original = console[level]
      console[level] = (...args: unknown[]) => {
        const text = JSON.stringify(args, (_, value) => value instanceof Error
          ? { message: value.message, stack: value.stack } : value)
        if (/McpRuntimeService|McpBridge/.test(text) && /Calling tool|Error calling tool|failed to call tool/.test(text)) {
          logs.push({ canary: text.includes(input.canary), replacement: text.includes('<redacted>'), error: level === 'error' })
        }
        original.apply(console, args)
      }
      restorers.push(() => { console[level] = original })
    }
    // The bundled app and this CJS API copy share the registered provider, not their TraceAPI object.
    const provider = trace.getTracerProvider()
    const originalGetTracer = provider.getTracer
    provider.getTracer = (...args: unknown[]) => {
      observation.tracerRequests += 1
      const tracer = originalGetTracer.apply(provider, args)
      return new Proxy(tracer, { get(target, property) {
        if (property !== 'startActiveSpan') {
          const value = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        }
        return (...spanArgs: any[]) => {
          const callback = spanArgs.at(-1)
          if (spanArgs[1]?.attributes?.tags === 'MCP') {
            spanArgs[spanArgs.length - 1] = (span: any) => {
              observation.mcpSpansStarted += 1
              const originalEnd = span.end
              span.end = (...endArgs: unknown[]) => {
                const text = JSON.stringify({ attributes: span.attributes, status: span.status, events: span.events })
                const category = String(spanArgs[0]).endsWith('.ListTool') ? 'catalog_list'
                  : ['Projection external eager fixture.read_projection', 'Projection external deferred fixture.read_projection'].includes(spanArgs[0])
                    ? 'target_call' : 'other_mcp'
                let catalogIdentityOnly = false
                if (category === 'catalog_list') {
                  try {
                    const values = JSON.parse(String(span.attributes?.inputs))
                    const identity = Array.isArray(values) && values.length === 1 ? values[0] : undefined
                    catalogIdentityOnly = identity !== null && typeof identity === 'object' && !Array.isArray(identity)
                      && Object.keys(identity).length === 1 && typeof identity.serverId === 'string' && identity.serverId.length > 0
                  } catch { catalogIdentityOnly = false }
                }
                spans.push({ category, catalogIdentityOnly, canary: text.includes(input.canary), replacement: text.includes('<redacted>'),
                  inputCanary: JSON.stringify({ value: span.attributes?.inputs }).includes(input.canary),
                  outputCanary: JSON.stringify({ value: span.attributes?.outputs }).includes(input.canary),
                  statusCanary: JSON.stringify({ value: span.status }).includes(input.canary),
                  eventCanary: JSON.stringify({ value: span.events }).includes(input.canary),
                  inputReplacement: String(span.attributes?.inputs).includes('<redacted>'), error: span.status?.code === 2 })
                return originalEnd.apply(span, endArgs)
              }
              return callback(span)
            }
          }
          return target.startActiveSpan(...spanArgs)
        }
      } })
    }
    restorers.push(() => { provider.getTracer = originalGetTracer })
    state.__bauarMcpSinks = { logs, spans, observation, restore() { restorers.reverse().forEach((restore) => restore()) } }
  }, { canary, otelUrl: pathToFileURL(require.resolve('@opentelemetry/api')).href })
}

export type McpSinkDiagnostic = {
  tracerRequests: number; mcpSpansStarted: number;
  logCount: number; spanCount: number; canaryLogCount: number; canarySpanCount: number;
  redactedErrorLogCount: number; redactedInputSpanCount: number;
  redactedErrorSpanCount: number; redactedSuccessSpanCount: number;
  spanCategories: Array<{ category: McpSinkSpan['category']; count: number; canaryCount: number;
    inputCanaryCount: number; outputCanaryCount: number; statusCanaryCount: number; eventCanaryCount: number;
    redactedInputCount: number; catalogIdentityOnlyCount: number }>;
  fieldMatches: { observedConsumers: boolean; logsCanaryAbsent: boolean; redactedErrorLog: boolean;
    spansCanaryAbsent: boolean; positiveCategories: boolean; catalogIdentityOnly: boolean; targetInputsRedacted: boolean;
    redactedErrorSpan: boolean; redactedSuccessSpan: boolean }
}

export async function finishMcpSinkCapture(app: ElectronApplication, observe: (diagnostic: McpSinkDiagnostic) => void) {
  const result = await app.evaluate(() => {
    const state = globalThis as any
    const capture = state.__bauarMcpSinks
    capture.restore()
    delete state.__bauarMcpSinks
    return { logs: capture.logs, spans: capture.spans, observation: capture.observation } as McpSinkCapture
  })
  observe({
    ...result.observation,
    logCount: result.logs.length, spanCount: result.spans.length,
    canaryLogCount: result.logs.filter((entry) => entry.canary).length,
    canarySpanCount: result.spans.filter((entry) => entry.canary).length,
    redactedErrorLogCount: result.logs.filter((entry) => entry.error && entry.replacement).length,
    redactedInputSpanCount: result.spans.filter((entry) => entry.inputReplacement).length,
    redactedErrorSpanCount: result.spans.filter((entry) => entry.error && entry.replacement).length,
    redactedSuccessSpanCount: result.spans.filter((entry) => !entry.error && entry.replacement).length,
    spanCategories: (['catalog_list', 'target_call', 'other_mcp'] as const).map((category) => {
      const spans = result.spans.filter((entry) => entry.category === category)
      return { category, count: spans.length, canaryCount: spans.filter((entry) => entry.canary).length,
        inputCanaryCount: spans.filter((entry) => entry.inputCanary).length,
        outputCanaryCount: spans.filter((entry) => entry.outputCanary).length,
        statusCanaryCount: spans.filter((entry) => entry.statusCanary).length,
        eventCanaryCount: spans.filter((entry) => entry.eventCanary).length,
        redactedInputCount: spans.filter((entry) => entry.inputReplacement).length,
        catalogIdentityOnlyCount: spans.filter((entry) => entry.catalogIdentityOnly).length }
    }),
    fieldMatches: {
      observedConsumers: result.logs.length > 0 && result.spans.length >= 3,
      logsCanaryAbsent: result.logs.every((entry) => !entry.canary),
      redactedErrorLog: result.logs.some((entry) => entry.error && entry.replacement),
      spansCanaryAbsent: result.spans.every((entry) => !entry.canary),
      positiveCategories: result.spans.some((entry) => entry.category === 'catalog_list') && result.spans.some((entry) => entry.category === 'target_call'),
      catalogIdentityOnly: result.spans.filter((entry) => entry.category === 'catalog_list').every((entry) => entry.catalogIdentityOnly),
      targetInputsRedacted: result.spans.filter((entry) => entry.category === 'target_call').every((entry) => entry.inputReplacement),
      redactedErrorSpan: result.spans.some((entry) => entry.category === 'target_call' && entry.error && entry.replacement),
      redactedSuccessSpan: result.spans.some((entry) => entry.category === 'target_call' && !entry.error && entry.replacement)
    }
  })
  return result
}

/** Approved oracle amendment: identity-only catalog inputs; target projection and all canary checks remain mandatory. */
export function assertMcpSinkCapture(result: McpSinkCapture) {
  assert(result.logs.length > 0 && result.spans.length >= 3)
  assert(result.logs.every((entry) => !entry.canary))
  assert(result.logs.some((entry) => entry.error && entry.replacement))
  assert(result.spans.every((entry) => !entry.canary))
  const catalog = result.spans.filter((entry) => entry.category === 'catalog_list')
  const target = result.spans.filter((entry) => entry.category === 'target_call')
  assert(catalog.length > 0 && target.length > 0)
  assert(catalog.every((entry) => entry.catalogIdentityOnly))
  assert(target.every((entry) => entry.inputReplacement))
  assert(target.some((entry) => entry.error && entry.replacement))
  assert(target.some((entry) => !entry.error && entry.replacement))
  return { logs: result.logs.length, spans: result.spans.length, canaryAbsent: true, actualConsumersDelegated: true }
}

/** Source-defined transport failures omit payloads; successful/isError results must still contain projection markers. */
export function projectedModelResultAccepted(input: ProjectionResultDiagnostic & { mode: ProjectionToolMode }): boolean {
  return input.canaryAbsent && (input.mode === 'error'
    ? input.genericMcpFailure === true && input.failureProvenanceMatches === true : input.redacted)
}

/** Use the actual desktop catalog authority and selected-server policy before run creation. */
export async function prepareProjectionToolAgent(
  page: Page, sourceCatalogId: string, modelId: string, serverId: string, profile: ProjectionCatalogProfile
): Promise<{ id: string }> {
  return page.evaluate(async (input) => {
    const api = { async request(route: string, value: unknown): Promise<any> {
      const result = await window.api.ipcApi.request(route, value) as { ok: boolean; data?: unknown }
      if (!result.ok) throw new Error('projection_catalog_setup_failed')
      return result.data
    } }
    const catalog = await api.request('prometheus.uar.catalog.read', {})
    const source = catalog.agents.find((entry: any) => entry.id === input.sourceCatalogId)
    if (!source) throw new Error('projection_catalog_source_missing')
    const definition = structuredClone(source.definition)
    definition.id = input.catalogId
    definition.metadata.title = `Projection ${input.profile} tool fixture`
    definition.prompt.system = 'Use the projection tool when requested. <redacted>'
    delete definition.extensions['uar.catalog']
    definition.extensions['uar.run_policy'] = { version: 1,
      tools: { mode: 'all', ids: [], denied_ids: [] },
      mcp_servers: { mode: 'selected', ids: [input.serverId], denied_ids: [] }, tool_approval: 'ask' }
    const saved = await api.request('prometheus.uar.catalog.save_agent', { mode: 'create', id: definition.id, definition })
    const actual = saved.agents.find((entry: any) => entry.id === definition.id)
    if (!actual || actual.provider !== source.provider || actual.model !== source.model) {
      throw new Error('projection_catalog_model_changed')
    }
    const prepared = await api.request('prometheus.uar.catalog.prepare_run', { agentId: definition.id, bossModelId: input.modelId })
    const patched = await window.api.dataApi.request({ id: crypto.randomUUID(), method: 'PATCH',
      path: `/agents/${prepared.bossAgentId}`, body: { mcps: [input.serverId],
        configuration: { permission_mode: 'default', uar_model_assignment: { source: 'boss' } } } }) as { error?: unknown }
    if (patched.error) throw new Error('projection_agent_setup_failed')
    return { id: prepared.bossAgentId }
  }, { sourceCatalogId, modelId, serverId, profile, catalogId: `projection-${profile}-${randomUUID()}` })
}
