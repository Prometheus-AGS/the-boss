import type { ElectronApplication } from '@playwright/test'

/** Observe only private endpoints advertised by this fixture's actual run POST. */
export async function installHostAdmissionDiagnostic(app: ElectronApplication): Promise<void> {
  await app.evaluate(async () => {
    const { IncomingMessage, ServerResponse } = process.getBuiltinModule('node:http')
    const { createHash } = process.getBuiltinModule('node:crypto')
    const global = globalThis as any
    if (global.__bauarHostDiagnostic) throw new Error('Host admission diagnostic is already installed')
    const originalFetch = globalThis.fetch
    const originalEmit = IncomingMessage.prototype.emit
    const originalEnd = ServerResponse.prototype.end
    type Operation = 'claim' | 'claim-native' | 'finish' | 'mcp'
    const routes = new Map<string, Operation>()
    const mountedNames = new Map<string, string>()
    const originalInvocations = new Map<string, Record<string, any>>()
    const buffers = new WeakMap<object, { chunks: Buffer[]; size: number }>()
    const requests = new WeakMap<object, { operation: Operation; admissionId?: string }>()
    const perAdmission = new Map<string, { toolsCalls: number; nativeClaims: number; revalidationRequests: number; rejections: string[] }>()
    const summary = { observerIncomplete: false, toolsCalls: 0, nativeClaims: 0, nativeClaimRejected: 0,
      revalidationRequests: 0, revalidationRejected: 0,
      toolsCallRejections: [] as string[], terminalConflicts: [] as Array<Record<string, unknown>>,
      dispatchBindings: [] as Array<Record<string, boolean>> }
    const record = (value: unknown): value is Record<string, any> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    const states = ['prepared', 'awaiting-human', 'awaiting-ack', 'authorized', 'claimed', 'succeeded',
      'failed', 'denied', 'cancelled', 'invalidated', 'interrupted', 'outcome-unknown']
    const refusalCategories: Record<string, string> = {
      'Batch tools/call is not supported by the managed host': 'batch_unsupported',
      'Managed tool call is missing exact admission identity': 'missing_identity',
      'Managed tool admission is unknown': 'unknown_admission',
      'Managed tool call does not match its prepared admission': 'binding_mismatch',
      'Managed tool policy changed before dispatch': 'policy_changed',
      'Managed tool admission is not executable': 'not_executable',
      'Managed tool lease or budget is not executable': 'lease_or_budget',
      'Managed tool claim evidence could not be persisted; dispatch was blocked': 'claim_persistence'
    }
    const localUrl = (value: unknown): URL | undefined => {
      if (typeof value !== 'string') return undefined
      const url = new URL(value)
      return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        && !url.username && !url.password && !url.search && !url.hash ? url : undefined
    }
    const ordered = (value: any): any => Array.isArray(value) ? value.map(ordered)
      : record(value) ? Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, ordered(entry)])) : value
    const argumentDigest = (value: Record<string, any>): string =>
      createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
    // Pinned UAR registry.rs1488–1518: iterate Unicode scalars, then constrain ASCII provider names.
    const uarProviderName = (raw: string): string => {
      let name = Array.from(raw, (character) => /^[A-Za-z0-9_-]$/.test(character) ? character : '_').join('')
      if (!/^[A-Za-z]/.test(name)) name = `t${name}`
      return name.length > 64 ? `${name.slice(0, 51)}_${createHash('sha256').update(raw).digest('hex').slice(0, 12)}` : name
    }
    globalThis.fetch = async (input, init) => {
      try {
        const url = localUrl(input instanceof Request ? input.url : String(input))
        if (url?.pathname === '/api/uar/runs' && init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          const admission = localUrl(body.tool_admission?.url)
          if (body.tool_admission?.version === 2 && admission?.pathname === '/uar/admission/v2') {
            routes.set(`${admission.href}/claim`, 'claim')
            routes.set(`${admission.href}/claim-native`, 'claim-native')
            routes.set(`${admission.href}/finish`, 'finish')
            for (const server of body.mcp_servers ?? []) {
              const mounted = localUrl(server.url)
              if (mounted?.origin === admission.origin && typeof server.name === 'string') {
                routes.set(mounted.href, 'mcp')
                mountedNames.set(mounted.href, server.name)
              }
            }
          }
        }
      } catch { summary.observerIncomplete = true }
      return originalFetch(input, init)
    }
    IncomingMessage.prototype.emit = function (this: typeof IncomingMessage.prototype, event: string | symbol, ...args: any[]) {
      try {
        const route = `http://127.0.0.1:${this.socket?.localPort}${this.url}`
        const operation = routes.get(route)
        if (this.method === 'POST' && operation) {
          if (event === 'data') {
            const buffer = buffers.get(this) ?? { chunks: [], size: 0 }
            const chunk = Buffer.from(args[0])
            buffer.size += chunk.length
            if (buffer.size <= 8 * 1024 * 1024) buffer.chunks.push(chunk)
            else summary.observerIncomplete = true
            buffers.set(this, buffer)
          } else if (event === 'end') {
            const buffer = buffers.get(this)
            buffers.delete(this)
            if (!buffer || buffer.size > 8 * 1024 * 1024) summary.observerIncomplete = true
            else {
              const body = JSON.parse(Buffer.concat(buffer.chunks).toString('utf8'))
              if (operation !== 'mcp' || body.method === 'tools/call') {
                const identity = operation === 'mcp'
                  ? body.params?._meta?.['tools.know-me.the-boss/admission']?.admissionId : body.admissionId
                const admissionId = typeof identity === 'string' ? identity : undefined
                requests.set(this, { operation, admissionId })
                if ((operation === 'claim' || operation === 'claim-native') && admissionId && record(body.invocation)) {
                  // Preserve the first actual binding, even if a later request attempts to replace it.
                  if (!originalInvocations.has(admissionId)) originalInvocations.set(admissionId, body.invocation)
                }
                if (operation === 'mcp') {
                  const invocation = admissionId ? originalInvocations.get(admissionId) : undefined
                  const meta = body.params?._meta?.['tools.know-me.the-boss/admission']
                  const serverName = mountedNames.get(route)
                  const nativeName = body.params?.name
                  const actualArguments = body.params?.arguments
                  const originalArguments = invocation?.validatedArguments
                  const known = Boolean(invocation && record(meta) && serverName && typeof nativeName === 'string')
                  const rawName = known ? `${serverName}__${nativeName}` : ''
                  summary.dispatchBindings.push({
                    correlated: known,
                    versionMatches: known && meta.version === 2 && invocation?.version === 2,
                    executionKindMatches: known && meta.executionKind === 'host_mcp'
                      && meta.executionKind === invocation?.executionKind,
                    runtimeEpochMatches: known && meta.runtimeEpoch === invocation?.runtimeEpoch,
                    hostEpochMatches: known && meta.hostEpoch === invocation?.hostEpoch,
                    authorityRevisionMatches: known && meta.authorityRevision === invocation?.authorityRevision,
                    invocationIdMatches: known && meta.invocationId === invocation?.invocationId,
                    mountedServerMatches: known && invocation?.mountedServerId === serverName,
                    nativeToolMatches: known && invocation?.nativeToolName === nativeName,
                    providerNameMatchesBossLegacy: known && invocation?.providerToolName === rawName.replace(/[^A-Za-z0-9_-]/g, '_'),
                    providerNameMatchesUarCanonical: known && invocation?.providerToolName === uarProviderName(rawName),
                    argumentDigestMatches: known && record(actualArguments) && record(originalArguments)
                      && argumentDigest(actualArguments) === argumentDigest(originalArguments)
                  })
                }
                if (operation === 'mcp') summary.toolsCalls += 1
                if (operation === 'claim-native') summary.nativeClaims += 1
                if (operation === 'claim') summary.revalidationRequests += 1
                if (admissionId) {
                  const counts = perAdmission.get(admissionId) ?? { toolsCalls: 0, nativeClaims: 0, revalidationRequests: 0, rejections: [] }
                  if (operation === 'mcp') counts.toolsCalls += 1
                  if (operation === 'claim-native') counts.nativeClaims += 1
                  if (operation === 'claim') counts.revalidationRequests += 1
                  perAdmission.set(admissionId, counts)
                }
              }
            }
          }
        }
      } catch { summary.observerIncomplete = true }
      return Reflect.apply(originalEmit, this, [event, ...args])
    }
    ServerResponse.prototype.end = function (this: typeof ServerResponse.prototype, ...args: any[]) {
      try {
        const request = requests.get(this.req)
        if (request) {
          const counts = request.admissionId ? perAdmission.get(request.admissionId) : undefined
          if (request.operation === 'claim' && this.statusCode !== 200) summary.revalidationRejected += 1
          if (request.operation === 'claim-native' && this.statusCode !== 200) summary.nativeClaimRejected += 1
          const chunk = args[0]
          const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : ''
          if (text && text.length <= 8 * 1024) {
            let body: any
            try { body = JSON.parse(text) } catch { body = undefined }
            if (request.operation === 'mcp' && record(body?.error)) {
              const reason = body.error.message
              const category = typeof reason === 'string' && Object.hasOwn(refusalCategories, reason)
                ? refusalCategories[reason] : 'unclassified'
              summary.toolsCallRejections.push(category)
              counts?.rejections.push(category)
            }
            if (request.operation === 'finish' && this.statusCode === 409) {
              summary.terminalConflicts.push({
                codeMatched: body?.error === 'terminal_state_conflict',
                originalState: states.includes(body?.state) ? body.state : 'unclassified',
                submittedOutcome: ['succeeded', 'failed'].includes(body?.outcome) ? body.outcome : 'unclassified',
                correlated: Boolean(counts), toolsCalls: counts?.toolsCalls ?? 0, nativeClaims: counts?.nativeClaims ?? 0,
                revalidationRequests: counts?.revalidationRequests ?? 0, toolsCallRejections: [...(counts?.rejections ?? [])]
              })
            }
          } else if (request.operation === 'finish' && this.statusCode === 409) summary.observerIncomplete = true
        }
      } catch { summary.observerIncomplete = true }
      return Reflect.apply(originalEnd, this, args)
    } as typeof originalEnd
    global.__bauarHostDiagnostic = { summary, restore() {
      globalThis.fetch = originalFetch
      IncomingMessage.prototype.emit = originalEmit
      ServerResponse.prototype.end = originalEnd
      perAdmission.clear()
      routes.clear()
      mountedNames.clear()
      originalInvocations.clear()
    } }
  })
}

export async function readHostAdmissionDiagnostic(app: ElectronApplication): Promise<unknown> {
  return app.evaluate(() => (globalThis as any).__bauarHostDiagnostic?.summary ?? { observerUnavailable: true })
}

export async function restoreHostAdmissionDiagnostic(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const global = globalThis as any
    global.__bauarHostDiagnostic?.restore()
    delete global.__bauarHostDiagnostic
  })
}
