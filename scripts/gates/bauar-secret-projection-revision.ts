import type { ElectronApplication } from '@playwright/test'

type Capture = {
  inlineArtifactOnly: boolean
  systemProjected: boolean
  catalogWrites: number
  catalogWritesProjected: boolean
  catalogSnapshotMatched: boolean
  runSnapshotMatched: boolean
  preparedInvocations: number
  preparedRevisionsMatched: boolean
  toolSources?: { discovery: number; target: number; other: number; discoveryRevisionsMatched: boolean; targetRevisionsMatched: boolean }
  catalogRaceObserved: boolean
  credentialsPreserved: boolean
  inputContainsCanary: boolean
  inputContainsReplacement: boolean
  historyPresent: boolean
  historyContainsCanary: boolean
  historyContainsReplacement: boolean
  historyToolIdentityPreserved: boolean
}
export type Fault = 'none' | 'http' | 'throw'
type HttpCategory = 'not_observed' | 'success' | 'not_found' | 'unauthorized' | 'forbidden' |
  'conflict' | 'request_timeout' | 'server_error' | 'other_http'
export type CaptureDiagnostic = {
  requests: Record<'capabilities' | 'catalog' | 'run' | 'stream', { entered: number; responded: number; rejected: number; status: number | null }>
  catalogStatus: HttpCategory; catalogWriteStatus: HttpCategory; runStatus: HttpCategory; inspectionStatus: HttpCategory
  captureCount: number; catalogWrites: number; inspectionsCompleted: number
  catalogRevisionMatches: boolean[]; runRevisionMatches: boolean[]
  stream: { status: HttpCategory; frames: number; runErrors: number; categories: string[]; parseFailed: boolean; incomplete: boolean }
}

export async function installCapture(app: ElectronApplication, canary: string, fault: Fault, raceAgentId?: string, target?: { serverId: string; providerName: string }): Promise<void> {
  await app.evaluate(async (_, input) => {
    const { IncomingMessage } = process.getBuiltinModule('node:http')
    const state = globalThis as typeof globalThis & {
      __bauarProjection?: { captures: Capture[]; inspect(): Promise<void>; restore(): void; diagnostic(): CaptureDiagnostic }
    }
    if (state.__bauarProjection) throw new Error('Projection fixture is already installed')
    const original = globalThis.fetch
    const originalEmit = IncomingMessage.prototype.emit
    const prepareUrls = new Set<string>()
    const streamUrls = new Set<string>()
    const bodies = new WeakMap<object, { chunks: Buffer[]; size: number }>()
    const prepared: Array<{ runId: string; revision: string; source: 'discovery' | 'target' | 'other' }> = []
    let observationFailed = false
    IncomingMessage.prototype.emit = function (event: string | symbol, ...args: any[]) {
      try {
        const url = `http://127.0.0.1:${this.socket?.localPort}${this.url}`
        if (this.method === 'POST' && prepareUrls.has(url)) {
          if (event === 'data') {
            const body = bodies.get(this) ?? { chunks: [], size: 0 }
            const chunk = Buffer.from(args[0])
            body.size += chunk.length
            if (body.size <= 8 * 1024 * 1024) body.chunks.push(chunk)
            else observationFailed = true
            bodies.set(this, body)
          } else if (event === 'end') {
            const body = bodies.get(this)
            bodies.delete(this)
            if (body && body.size <= 8 * 1024 * 1024) {
              const { invocation } = JSON.parse(Buffer.concat(body.chunks).toString('utf8'))
              const source = invocation.executionKind === 'runtime_native' && invocation.mountedServerId === 'builtin'
                && invocation.providerToolName === 'search_tools'
                && invocation.nativeToolName === 'search_tools' ? 'discovery'
                : invocation.executionKind === 'host_mcp' && invocation.mountedServerId === input.target?.serverId
                  && invocation.providerToolName === input.target?.providerName && invocation.nativeToolName === 'read_projection'
                  ? 'target' : 'other'
              prepared.push({ runId: invocation.executingRunId, revision: invocation.catalogRevision, source })
            } else observationFailed = true
          }
        }
      } catch { observationFailed = true }
      return Reflect.apply(originalEmit, this, [event, ...args])
    }
    const captures: Capture[] = []
    const ordering = {
      ordered(value: any): any {
        return Array.isArray(value) ? value.map((entry) => ordering.ordered(entry))
          : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordering.ordered(v)]))
            : value
      }
    }
    let catalog: any
    let catalogWrites = 0
    let catalogWritesProjected = true
    const inspections: Array<() => Promise<void>> = []
    const statuses: Pick<CaptureDiagnostic, 'catalogStatus' | 'catalogWriteStatus' | 'runStatus' | 'inspectionStatus'> = {
      catalogStatus: 'not_observed', catalogWriteStatus: 'not_observed', runStatus: 'not_observed', inspectionStatus: 'not_observed'
    }
    let inspectionsCompleted = 0
    const stream: CaptureDiagnostic['stream'] = {
      status: 'not_observed', frames: 0, runErrors: 0, categories: [], parseFailed: false, incomplete: false
    }
    const requests: CaptureDiagnostic['requests'] = {
      capabilities: { entered: 0, responded: 0, rejected: 0, status: null }, catalog: { entered: 0, responded: 0, rejected: 0, status: null },
      run: { entered: 0, responded: 0, rejected: 0, status: null }, stream: { entered: 0, responded: 0, rejected: 0, status: null }
    }
    const transport = { async observe(request: Parameters<typeof fetch>[0], init: RequestInit | undefined,
      boundary: keyof CaptureDiagnostic['requests']) {
      requests[boundary].entered += 1
      try {
        const response = await original(request, init)
        requests[boundary].responded += 1
        requests[boundary].status = response.status
        return response
      } catch (error) {
        requests[boundary].rejected += 1
        throw error
      }
    } }
    const errorCodes = new Set([
      'remote_budget_invalid', 'actor_root_mismatch', 'run_owner_mismatch', 'mcp_catalog_unavailable',
      'mcp_capture_mismatch', 'child_bindings_unavailable', 'sandbox_binding_unavailable',
      'remote_sandbox_incompatible', 'remote_sandbox_unavailable', 'mcp_server_not_run_scoped',
      'mcp_preflight_failed', 'checkpoint_authorization_revoked', 'approval_channel_unavailable',
      'world_state_load_failed', 'tool_admission_context_failed', 'skill_selection_unavailable',
      'tool_collision', 'provider_model_unavailable', 'orchestrator_start_failed',
      'SECRET_IN_EXECUTABLE_ARTIFACT', 'EXECUTABLE_ARTIFACT_UNAVAILABLE', 'CANCELLED'
    ])
    const http = { statusCategory(status: number): HttpCategory {
      if (status >= 200 && status < 300) return 'success'
      if (status === 401) return 'unauthorized'
      if (status === 403) return 'forbidden'
      if (status === 404) return 'not_found'
      if (status === 408) return 'request_timeout'
      if (status === 409) return 'conflict'
      return status >= 500 ? 'server_error' : 'other_http'
    } }
    state.__bauarProjection = {
      captures, async inspect() { for (const inspect of inspections) await inspect() },
      diagnostic() { return { ...statuses, requests, stream: { ...stream, categories: [...stream.categories] }, captureCount: captures.length, catalogWrites, inspectionsCompleted,
        catalogRevisionMatches: captures.map((capture) => capture.catalogSnapshotMatched),
        runRevisionMatches: captures.map((capture) => capture.runSnapshotMatched) } },
      restore() {
        globalThis.fetch = original
        IncomingMessage.prototype.emit = originalEmit
      }
    }
    globalThis.fetch = async (request, init) => {
      const url = new URL(request instanceof Request ? request.url : String(request))
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      if (local && url.pathname === '/api/uar/capabilities') return transport.observe(request, init, 'capabilities')
      if (local && /^\/api\/agents(?:\/|$)/.test(url.pathname)) {
        if (init?.method === 'POST' || init?.method === 'PUT') {
          const artifact = JSON.parse(String(init.body))
          catalogWrites += 1
          catalogWritesProjected &&= !JSON.stringify(artifact.prompt).includes(input.canary)
            && artifact.prompt.system.includes('<redacted>')
        }
        const response = await transport.observe(request, init, 'catalog')
        statuses.catalogStatus = http.statusCategory(response.status)
        if (init?.method === 'POST' || init?.method === 'PUT') statuses.catalogWriteStatus = statuses.catalogStatus
        if (response.ok) catalog = await response.clone().json()
        return response
      }
      if (local && url.pathname === '/api/uar/runs' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        const history = body.history?.messages ?? []
        prepareUrls.add(`${body.tool_admission.url}/prepare`)
        const capturedCatalogRevision = catalog?.extensions['uar.catalog'].revision
        const capture: Capture = {
          inlineArtifactOnly: Boolean(body.artifact) && !Object.hasOwn(body, 'agent_id'),
          systemProjected: !JSON.stringify(body.artifact?.prompt).includes(input.canary)
            && body.artifact?.prompt.system.includes('<redacted>'),
          catalogWrites, catalogWritesProjected,
          catalogSnapshotMatched: Boolean(catalog) && JSON.stringify(ordering.ordered(body.artifact)) === JSON.stringify(ordering.ordered(catalog)),
          runSnapshotMatched: false, catalogRaceObserved: false,
          preparedInvocations: 0, preparedRevisionsMatched: false,
          credentialsPreserved: body.run_credentials?.some((entry: { api_key: string }) => entry.api_key === input.canary) === true,
          inputContainsCanary: String(body.input).includes(input.canary),
          inputContainsReplacement: String(body.input).includes('<redacted>'),
          historyPresent: history.length > 0,
          historyContainsCanary: JSON.stringify(history).includes(input.canary),
          historyContainsReplacement: JSON.stringify(history).includes('<redacted>'),
          historyToolIdentityPreserved: history.some((entry: any) => entry.tool_calls?.some((call: any) =>
            call.id === 'projection-history-call' && call.function.name === 'projection_history_tool'
          )) && history.some((entry: any) => entry.tool_call_id === 'projection-history-call')
        }
        captures.push(capture)
        if (input.fault === 'http') {
          return new Response(`${'x'.repeat(990)}${input.canary} diagnostic tail`, { status: 502 })
        }
        if (input.fault === 'throw') throw new Error(`Run request fixture failure: ${input.canary}`)
        if (input.raceAgentId) {
          const metadata = catalog.extensions['uar.catalog']
          if (metadata.source.kind !== 'the_boss' || metadata.source.id !== input.raceAgentId) {
            throw new Error('Catalog race fixture refused an entry it does not own')
          }
          const changed = structuredClone(catalog)
          changed.prompt.system += ' Projection catalog race marker.'
          const headers = new Headers(init.headers)
          headers.set('if-match', `"${metadata.revision}"`)
          const replaced = await original(new URL(`/api/agents/${encodeURIComponent(catalog.id)}`, url), {
            method: 'PUT', headers, body: JSON.stringify(changed)
          })
          if (!replaced.ok) throw new Error('Controlled catalog race update failed')
          const updated = await replaced.json()
          capture.catalogRaceObserved = updated.extensions['uar.catalog'].revision !== metadata.revision
            && updated.prompt.system.endsWith('Projection catalog race marker.')
        }
        const response = await transport.observe(request, init, 'run')
        statuses.runStatus = http.statusCategory(response.status)
        if (response.ok) {
          const created = await response.clone().json()
          const streamUrl = new URL(created.stream_url, url)
          streamUrls.add(`${streamUrl.origin}${streamUrl.pathname}`)
          inspections.push(async () => {
            const inspected = await original(new URL(`/api/uar/runs/${created.run_id}`, url), { headers: init.headers })
            statuses.inspectionStatus = http.statusCategory(inspected.status)
            if (!inspected.ok) throw new Error('Actual run inspection failed')
            const run = await inspected.json()
            const actual = prepared.filter((entry) => entry.runId === created.run_id)
            capture.runSnapshotMatched = run.agent_id === body.artifact.id
              && typeof run.agent_revision === 'string' && run.agent_revision.startsWith('sha256:')
              && (!capture.catalogSnapshotMatched || run.agent_revision === capturedCatalogRevision)
            capture.preparedInvocations = actual.length
            capture.preparedRevisionsMatched = !observationFailed && actual.length > 0
              && actual.every((entry) => entry.revision === run.agent_revision)
            if (input.target) {
              const discovery = actual.filter((entry) => entry.source === 'discovery')
              const target = actual.filter((entry) => entry.source === 'target')
              capture.toolSources = { discovery: discovery.length, target: target.length,
                other: actual.filter((entry) => entry.source === 'other').length,
                discoveryRevisionsMatched: !observationFailed && discovery.length > 0 && discovery.every((entry) => entry.revision === run.agent_revision),
                targetRevisionsMatched: !observationFailed && target.length > 0 && target.every((entry) => entry.revision === run.agent_revision) }
            }
            inspectionsCompleted += 1
          })
        }
        return response
      }
      const isStream = streamUrls.has(`${url.origin}${url.pathname}`) && (init?.method ?? 'GET') === 'GET'
      const response = await (isStream ? transport.observe(request, init, 'stream') : original(request, init))
      if (!isStream) return response
      stream.status = http.statusCategory(response.status)
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return response
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let pending = ''
      let pendingBytes = 0
      let observing = true
      const parser = {
        observe(chunk: Uint8Array) {
          if (!observing) return
          if (pendingBytes + chunk.byteLength > 256 * 1024) {
            stream.incomplete = true
            observing = false
            pending = ''
            return
          }
          pending += decoder.decode(chunk, { stream: true })
          pending = pending.replaceAll('\r\n', '\n')
          let boundary: number
          while ((boundary = pending.indexOf('\n\n')) >= 0) {
            const frame = pending.slice(0, boundary)
            pending = pending.slice(boundary + 2)
            stream.frames += 1
            const data = frame.split('\n').filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart()).join('\n')
            if (!data) continue
            try {
              const event = JSON.parse(data)
              if (event?.type !== 'RUN_ERROR') continue
              stream.runErrors += 1
              const category = errorCodes.has(event.code) ? event.code : event.code === '' ? 'empty_code' : 'unclassified_code'
              if (!stream.categories.includes(category)) stream.categories.push(category)
            } catch { stream.parseFailed = true }
          }
          pendingBytes = encoder.encode(pending).byteLength
        }
      }
      const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          try { parser.observe(chunk) } catch {
            stream.parseFailed = true
            stream.incomplete = true
            observing = false
            pending = ''
          }
          controller.enqueue(chunk)
        },
        flush() {
          if (observing && (pending + decoder.decode()).trim()) stream.incomplete = true
        }
      }))
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
    }
  }, { canary, fault, raceAgentId, target })
}

export async function finishCapture(app: ElectronApplication): Promise<Capture[]> {
  return app.evaluate(async () => {
    const state = globalThis as any
    const capture = state.__bauarProjection
    try {
      await capture.inspect()
      return capture.captures as Capture[]
    } finally {
      state.__bauarProjectionDiagnostic = capture.diagnostic()
      capture.restore()
      delete state.__bauarProjection
    }
  })
}

export async function readCaptureDiagnostic(app: ElectronApplication): Promise<CaptureDiagnostic | null> {
  return app.evaluate(() => {
    const state = globalThis as any
    return state.__bauarProjection?.diagnostic() ?? state.__bauarProjectionDiagnostic ?? null
  })
}

export async function restoreCapture(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const state = globalThis as any
    state.__bauarProjection?.restore()
    delete state.__bauarProjection
    delete state.__bauarProjectionDiagnostic
  })
}
