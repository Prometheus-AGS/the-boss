import { join } from 'node:path'
import type { IncomingMessage as HttpRequest, ServerResponse as HttpResponse } from 'node:http'

import type { ElectronApplication } from '@playwright/test'

export type NativeFault = 'observe' | 'drop_ack' | 'hold_ack' | 'host_terminal'
export type NativeObservation = {
  preparations: number; consumes: number; durableConsumes: number; finishRequests: number
  successfulFinishRequests: number; terminalFailures: number; dropped: number; held: boolean
  observationFailed: boolean; hostStates: string[]; replayStatuses: number[]; rootsIsolated: boolean
  runtimeStates: string[]
  cancellationAcknowledgments: number
}
export type NativeReplay = { invocation: Record<string, unknown>; receipt: Record<string, unknown>; admissionId: string }
export type PostAckArmConfig = { workspace: string; controlId: string; deadlineUnixMs: number }
export type PostAckControlState = {
  armed: boolean; correlationDigest: string | null; cancelAcknowledged: boolean; runStatus: string | null
  finalizationFailed: boolean; streamObserved: boolean
}

export async function installNativeControls(app: ElectronApplication, profile: string, mode: NativeFault,
  replay: NativeReplay[] = [], postAck?: PostAckArmConfig, mainDirectory = join(process.cwd(), 'out/main')): Promise<void> {
  await app.evaluate((_, input) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const { readdirSync, realpathSync, lstatSync, writeFileSync, renameSync } = process.getBuiltinModule('node:fs')
    const { join, relative, isAbsolute } = process.getBuiltinModule('node:path')
    const { IncomingMessage, ServerResponse } = process.getBuiltinModule('node:http')
    const require = createRequire(join(input.mainDirectory, 'main.js'))
    const chunks = readdirSync(input.mainDirectory).filter((name: string) => /^Application-[^/]+\.js$/.test(name))
    if (chunks.length !== 1) throw new Error('Native control Application chunk is ambiguous')
    const loaded = require.cache[require.resolve(join(input.mainDirectory, chunks[0]))]
    if (!loaded) throw new Error('Native control Application chunk is not loaded')
    const application = loaded.exports.application
    const root = application.getPath('app.userdata')
    const database = application.getPath('app.database.file')
    const runtime = application.getPath('feature.agents.uar.data')
    const rootsIsolated = root.includes(input.profile) && [database, runtime].every((path: string) => {
      const child = relative(root, path)
      return child !== '' && !child.startsWith('..') && !isAbsolute(child)
    })
    if (!rootsIsolated) throw new Error('Native controls refused non-isolated storage')
    const db = new (require('better-sqlite3'))(database, { fileMustExist: true })
    const state = globalThis as any
    if (state.__bauarNative) { db.close(); throw new Error('Native controls already installed') }
    const originalFetch = globalThis.fetch
    const originalEmit = IncomingMessage.prototype.emit
    const originalEnd = ServerResponse.prototype.end
    const bodies = new WeakMap<object, Buffer[]>()
    const nativeIds = new Set<string>()
    const claims: NativeReplay[] = []
    const urls = new Set<string>()
    const streamUrls = new Set<string>()
    const runtimeRequests: Array<{ url: string; runUrl: string; runId: string; headers: any }> = []
    let armedRunId: string | undefined
    const postAckState: PostAckControlState = { armed: false, correlationDigest: null, cancelAcknowledged: false,
      runStatus: null, finalizationFailed: false, streamObserved: false }
    const observation: NativeObservation = { preparations: 0, consumes: 0, durableConsumes: 0, finishRequests: 0,
      successfulFinishRequests: 0, terminalFailures: 0, dropped: 0, held: false, observationFailed: false,
      hostStates: [], replayStatuses: [], rootsIsolated, runtimeStates: [], cancellationAcknowledgments: 0 }
    let held: { response: any; args: any[] } | undefined
    const storage = {
      document() {
        const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get('uarToolAdmission:lifecycle')
        return row ? JSON.parse(row.value) : { version: 1, records: [] }
      },
      removeTriggers() { db.exec('DROP TRIGGER IF EXISTS bauar_native_terminal_insert; DROP TRIGGER IF EXISTS bauar_native_terminal_update;') },
      installTriggers(id: string) {
        const literal = `'${id.replaceAll("'", "''")}'`
        for (const operation of ['INSERT', 'UPDATE']) db.exec(`CREATE TRIGGER bauar_native_terminal_${operation.toLowerCase()}
          BEFORE ${operation} ON app_state WHEN NEW.key = 'uarToolAdmission:lifecycle' AND EXISTS (
            SELECT 1 FROM json_each(NEW.value, '$.records') WHERE json_extract(value, '$.admissionId') = ${literal}
            AND json_extract(value, '$.state') IN ('succeeded', 'failed'))
          BEGIN SELECT RAISE(ABORT, 'Controlled native host terminal persistence failure'); END;`)
      }
    }
    state.__bauarNative = {
      observation, claims,
      arm(invocation: any, receipt: any) {
        if (!input.postAck) return
        const config = input.postAck
        const directory = join(config.workspace, '.bauar-post-ack-gate')
        if (postAckState.armed || invocation.version !== 2 || receipt.version !== 2 ||
          invocation.workspace !== config.workspace || invocation.mountedServerId !== 'builtin' ||
          invocation.nativeToolName !== 'search_tools' || invocation.providerToolName !== 'search_tools' ||
          invocation.executionKind !== 'runtime_native' || receipt.executionKind !== invocation.executionKind ||
          receipt.invocationId !== invocation.invocationId || receipt.hostEpoch !== invocation.hostEpoch ||
          receipt.runtimeEpoch !== invocation.runtimeEpoch || receipt.authorityRevision !== invocation.authorityRevision ||
          realpathSync(config.workspace) !== config.workspace || realpathSync(directory) !== directory ||
          lstatSync(directory).isSymbolicLink()) throw new Error('Post-ack arm binding failed')
        const values = ['bauar-post-ack-gate/1', invocation.executingRunId, invocation.invocationId,
          invocation.modelToolCallId, invocation.runtimeEpoch, invocation.hostEpoch, 'runtime_native',
          receipt.admissionId, invocation.authorityRevision]
        if (!values.every((value) => typeof value === 'string' && value.length > 0)) throw new Error('Post-ack identity is incomplete')
        const correlationDigest = process.getBuiltinModule('node:crypto').createHash('sha256').update(JSON.stringify(values)).digest('hex')
        const arm = { version: 1, purpose: 'bauar-native-post-ack', controlId: config.controlId, correlationDigest,
          executionKind: 'runtime_native', toolName: 'search_tools', deadlineUnixMs: config.deadlineUnixMs }
        const bytes = JSON.stringify(arm)
        if (Buffer.byteLength(bytes) > 4096) throw new Error('Post-ack arm exceeds protocol bound')
        writeFileSync(join(directory, 'arm.json.pending'), bytes, { flag: 'wx' })
        renameSync(join(directory, 'arm.json.pending'), join(directory, 'arm.json'))
        armedRunId = invocation.executingRunId
        postAckState.armed = true
        postAckState.correlationDigest = correlationDigest
      },
      async postAck(action: 'read' | 'cancel' | 'terminal') {
        if (action === 'read') return postAckState
        const actual = runtimeRequests.filter((entry) => entry.runId === armedRunId)
        if (actual.length !== 1) throw new Error('Post-ack exact run is unavailable')
        const response = await originalFetch(`${actual[0].runUrl}${action === 'cancel' ? '/cancel' : ''}`, {
          headers: actual[0].headers, ...(action === 'cancel' ? { method: 'POST' } : {})
        })
        if (!response.ok) throw new Error('Post-ack owner-bound request failed')
        const result = await response.json()
        if (action === 'cancel') {
          postAckState.cancelAcknowledged = result.cancelled === true
          if (postAckState.cancelAcknowledged) observation.cancellationAcknowledgments += 1
        }
        else {
          if (result.run_id !== armedRunId || !['pending', 'running', 'paused', 'done', 'error', 'cancelled'].includes(result.status)) {
            throw new Error('Post-ack run inspection binding failed')
          }
          postAckState.runStatus = result.status
        }
        return postAckState
      },
      seedLegacyHistory() {
        if (claims.length !== 1) throw new Error('Native history seed requires one genuine consumed admission')
        const history = storage.document()
        const prior = history.records.find((record: any) => record.admissionId === claims[0].admissionId)
        if (!prior) throw new Error('Native history seed has no durable predecessor')
        const replay: NativeReplay[] = []
        for (const versionOne of [false, true]) {
          const admissionId = process.getBuiltinModule('node:crypto').randomUUID()
          const legacy = { ...prior, admissionId, state: 'claimed', executionKind: undefined,
            ...(versionOne ? { version: 1 } : {}) }
          history.records.push(legacy)
          replay.push({ ...structuredClone(claims[0]), admissionId,
            invocation: { ...claims[0].invocation, executionKind: undefined, ...(versionOne ? { version: 1 } : {}) },
            receipt: { ...claims[0].receipt, admissionId, executionKind: undefined, ...(versionOne ? { version: 1 } : {}) } })
        }
        db.prepare('UPDATE app_state SET value = ? WHERE key = ?').run(JSON.stringify(history), 'uarToolAdmission:lifecycle')
        return replay
      },
      release(drop: boolean) {
        if (!held) return
        const current = held
        held = undefined
        observation.held = false
        if (drop) { observation.dropped += 1; current.response.destroy() }
        else Reflect.apply(originalEnd, current.response, current.args)
      },
      async inspect() {
        observation.hostStates = storage.document().records.filter((record: any) => nativeIds.has(record.admissionId))
          .map((record: any) => record.state)
        observation.runtimeStates = []
        for (const request of runtimeRequests) {
          const response = await originalFetch(request.url, { headers: request.headers })
          if (!response.ok) throw new Error('Native runtime evidence inspection failed')
          const evidence = await response.json()
          observation.runtimeStates.push(...evidence.records.filter((record: any) => nativeIds.has(record.admission_id))
            .map((record: any) => record.state))
        }
      },
      restore() {
        this.release(true)
        globalThis.fetch = originalFetch
        IncomingMessage.prototype.emit = originalEmit
        ServerResponse.prototype.end = originalEnd
        try { storage.removeTriggers() } finally { db.close() }
      }
    }
    IncomingMessage.prototype.emit = function (this: HttpRequest, event: string | symbol, ...args: any[]) {
      try {
        const base = `http://127.0.0.1:${this.socket?.localPort}`
        const url = `${base}${this.url}`
        if (this.method === 'POST' && [...urls].some((prefix) => url.startsWith(`${prefix}/`))) {
          if (event === 'data') {
            const chunks = bodies.get(this) ?? []
            chunks.push(Buffer.from(args[0]))
            bodies.set(this, chunks)
          } else if (event === 'end') {
            const chunks = bodies.get(this)
            bodies.delete(this)
            const body = chunks ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
            ;(this as any).__bauarNativeRequest = { body, operation: this.url?.split('/').at(-1) }
          }
        }
      } catch { observation.observationFailed = true }
      return Reflect.apply(originalEmit, this, [event, ...args])
    }
    ServerResponse.prototype.end = function (this: HttpResponse, ...args: any[]) {
      const request = (this.req as any).__bauarNativeRequest
      try {
        if (request?.operation === 'prepare' && request.body?.invocation?.executionKind === 'runtime_native') {
          if (this.statusCode === 200) {
            const preparation = JSON.parse(String(args[0]))
            nativeIds.add(preparation.admissionId)
            observation.preparations += 1
            state.__bauarNative.arm(request.body.invocation, preparation)
            if (input.mode === 'host_terminal') storage.installTriggers(preparation.admissionId)
          }
        }
        if (request?.operation === 'claim-native' && nativeIds.has(request.body?.admissionId) && this.statusCode === 200) {
          observation.consumes += 1
          const stored = storage.document().records.find((record: any) => record.admissionId === request.body.admissionId)
          if (stored?.state !== 'claimed') throw new Error('Native acknowledgment preceded durable consumption')
          observation.durableConsumes += 1
          claims.push(structuredClone(request.body))
          if (input.mode === 'drop_ack') { observation.dropped += 1; this.destroy(); return this }
          if (input.mode === 'hold_ack') {
            held = { response: this, args }
            observation.held = true
            return this
          }
        }
        if (request?.operation === 'finish' && nativeIds.has(request.body?.admissionId)) {
          observation.finishRequests += 1
          if (request.body.outcome === 'succeeded') observation.successfulFinishRequests += 1
          if (this.statusCode >= 500) observation.terminalFailures += 1
        }
      } catch { observation.observationFailed = true; this.destroy(); return this }
      return Reflect.apply(originalEnd, this, args)
    } as typeof originalEnd
    globalThis.fetch = async (request, init) => {
      const url = new URL(request instanceof Request ? request.url : String(request))
      if (input.postAck && streamUrls.has(`${url.origin}${url.pathname}`) && (init?.method ?? 'GET') === 'GET') {
        const response = await originalFetch(request, init)
        if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
          observation.observationFailed = true
          return response
        }
        postAckState.streamObserved = true
        const decoder = new TextDecoder()
        let pending = ''
        let observing = true
        const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            try {
              if (observing) {
                if (Buffer.byteLength(pending) + chunk.byteLength > 256 * 1024) throw new Error('Post-ack stream frame exceeds bound')
                pending = (pending + decoder.decode(chunk, { stream: true })).replaceAll('\r\n', '\n')
                let boundary: number
                while ((boundary = pending.indexOf('\n\n')) >= 0) {
                  const frame = pending.slice(0, boundary)
                  pending = pending.slice(boundary + 2)
                  const data = frame.split('\n').filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trimStart()).join('\n')
                  if (!data) continue
                  const event = JSON.parse(data)
                  if (event?.type === 'RUN_ERROR' && event.code === 'NATIVE_ADMISSION_GATE_FINALIZATION_FAILED') {
                    postAckState.finalizationFailed = true
                  }
                }
              }
            } catch { observation.observationFailed = true; observing = false; pending = '' }
            controller.enqueue(chunk)
          },
          flush() { if (observing && (pending + decoder.decode()).trim()) observation.observationFailed = true }
        }))
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
      }
      if (/^\/api\/uar\/runs\/[^/]+\/cancel$/.test(url.pathname) && init?.method === 'POST') {
        const response = await originalFetch(request, init)
        if (response.ok) observation.cancellationAcknowledgments += 1
        return response
      }
      if (url.pathname !== '/api/uar/runs' || init?.method !== 'POST') return originalFetch(request, init)
      const body = JSON.parse(String(init.body))
      urls.add(body.tool_admission.url)
      for (const old of input.replay) {
        const response = await originalFetch(`${body.tool_admission.url}/claim-native`, { method: 'POST',
          headers: { ...body.tool_admission.headers, 'content-type': 'application/json' }, body: JSON.stringify(old) })
        observation.replayStatuses.push(response.status)
      }
      const response = await originalFetch(request, init)
      if (response.ok) {
        const created = await response.clone().json()
        if (input.postAck) {
          const streamUrl = new URL(created.stream_url, url)
          streamUrls.add(`${streamUrl.origin}${streamUrl.pathname}`)
        }
        const runUrl = new URL(`/api/uar/runs/${created.run_id}`, url).href
        runtimeRequests.push({ url: `${runUrl}/tool-admission-evidence`, runUrl, runId: created.run_id, headers: init.headers })
      }
      return response
    }
  }, { mainDirectory, profile, mode, replay, postAck })
}

export async function nativeObservation(app: ElectronApplication, inspect = false): Promise<NativeObservation> {
  return app.evaluate(async (_, inspect) => {
    const fixture = (globalThis as any).__bauarNative
    if (inspect) await fixture.inspect()
    return fixture.observation
  }, inspect)
}

export async function releaseNativeAck(app: ElectronApplication, drop: boolean): Promise<void> {
  await app.evaluate((_, drop) => (globalThis as any).__bauarNative.release(drop), drop)
}

export async function nativeReplay(app: ElectronApplication): Promise<NativeReplay[]> {
  return app.evaluate(() => {
    const fixture = (globalThis as any).__bauarNative
    return [...fixture.claims, ...fixture.seedLegacyHistory()]
  })
}

export async function restoreNativeControls(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const state = globalThis as any
    state.__bauarNative?.restore()
    delete state.__bauarNative
  })
}

export async function postAckControl(app: ElectronApplication, action: 'read' | 'cancel' | 'terminal'): Promise<PostAckControlState> {
  return app.evaluate(async (_, action) => (globalThis as any).__bauarNative.postAck(action), action)
}
