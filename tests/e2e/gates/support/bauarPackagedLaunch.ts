import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

export type PackagedConfig = { configPath: string; privateRoot: string; runtimeSealPath: string;
  scenarios: Array<{ id: string; componentId: string; ownerTaskKey: string }>; [key: string]: any }
export type PackagedLaunch = { app: ElectronApplication; page: Page; mainDirectory: string; root: string;
  stop(): Promise<void> }

export async function acceptanceConfig(): Promise<PackagedConfig> {
  const configPath = process.env.THE_BOSS_ACCEPTANCE_CONFIG
  assert(configPath && isAbsolute(configPath), 'Packaged acceptance configuration is unavailable')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  return { ...config, configPath, bossRoot: config.components.find((item: any) => item.id === 'desktop').command.cwd }
}

export async function privateProfile(config: PackagedConfig, name: string): Promise<string> {
  const parent = process.env.THE_BOSS_ACCEPTANCE_ROOT
  assert(parent && relative(config.privateRoot, parent) && !relative(config.privateRoot, parent).startsWith('..'))
  const root = join(parent, `${name}-${randomUUID()}`)
  await mkdir(root, { mode: 0o700 })
  assert.equal(await realpath(root), root)
  return root
}

export function packagedExecutable(config: PackagedConfig): string {
  return join(config.bossRoot, 'dist/mac-arm64/The Boss.app/Contents/MacOS/The Boss')
}

export async function launchPackaged(config: PackagedConfig, root: string, supportingSidecar?: string): Promise<PackagedLaunch> {
  assert.equal(await realpath(root), root)
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)),
    NODE_ENV: 'production', THE_BOSS_PROFILE_ROOT: root }
  delete env.CS_DEV_USER_DATA_SUFFIX
  delete env.ELECTRON_RUN_AS_NODE
  delete env.THE_BOSS_UAR_SIDECAR_PATH
  if (supportingSidecar) env.THE_BOSS_UAR_SIDECAR_PATH = supportingSidecar
  const app = await electron.launch({ executablePath: packagedExecutable(config), args: [], env, timeout: 60_000 })
  const stop = async () => {
    const child = app.process()
    if (child.exitCode !== null || child.signalCode !== null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([app.close(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Packaged application shutdown timed out')), 15_000)
      })])
    } finally { if (timer) clearTimeout(timer) }
    assert(child.exitCode !== null || child.signalCode !== null, 'Packaged application process remains alive')
  }
  try {
    let page: Page | undefined
    await expect.poll(() => {
      page = app.windows().find(candidate => candidate.url().includes('/windows/main/index.html'))
      return Boolean(page)
    }, { timeout: 60_000 }).toBe(true)
    assert(page)
    await page.locator('#root').waitFor({ state: 'visible', timeout: 60_000 })
    const mainDirectory = await app.evaluate(({ app }, expectedRoot) => {
      const { join, relative, isAbsolute } = process.getBuiltinModule('node:path')
      const { readdirSync } = process.getBuiltinModule('node:fs')
      const { createRequire } = process.getBuiltinModule('node:module')
      if (!app.isPackaged || !app.getAppPath().endsWith('/app.asar')) throw new Error('Actual packaged ASAR is unavailable')
      const directory = join(app.getAppPath(), 'out/main')
      const chunks = readdirSync(directory).filter(name => /^Application-[^/]+\.js$/.test(name))
      if (chunks.length !== 1) throw new Error('Packaged Application chunk is ambiguous')
      const require = createRequire(join(directory, 'main.js'))
      const loaded = require.cache[require.resolve(join(directory, chunks[0]))]
      if (!loaded) throw new Error('Packaged Application chunk is not loaded')
      const paths = ['userData', 'sessionData', 'logs', 'temp'].map(name => app.getPath(name as any))
      paths.push(loaded.exports.application.getPath('app.userdata'), loaded.exports.application.getPath('app.logs'),
        loaded.exports.application.getPath('feature.agents.uar.data'))
      if (!paths.every(path => {
        const child = relative(expectedRoot, path)
        return child !== '' && !child.startsWith('..') && !isAbsolute(child)
      })) throw new Error('Packaged owned path escaped private root')
      return directory
    }, root)
    await page.evaluate(() => window.api.preference.setMultiple({ 'app.language': 'en-US',
      'app.onboarding.provider_setup.status': 'skipped', 'app.privacy.data_collection.enabled': false,
      'app.developer_mode.enabled': true }))
    return { app, page, mainDirectory, root, stop }
  } catch (error) {
    await stop()
    throw error
  }
}

export async function ipc<T = any>(page: Page, route: string, input: unknown): Promise<T> {
  const result = await page.evaluate(({ route, input }) => window.api.ipcApi.request(route, input), { route, input }) as any
  assert.equal(result.ok, true, 'Packaged IPC request failed')
  return result.data
}

export async function data<T = any>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  const result = await page.evaluate(({ method, path, body }) => window.api.dataApi.request({
    id: crypto.randomUUID(), method: method as any, path, ...(body === undefined ? {} : { body })
  }), { method, path, body }) as any
  assert(!result.error, 'Packaged data request failed')
  return result.data
}

export async function configureAgent(page: Page, baseUrl: string, canary: string, workspace: string) {
  const providerId = `packaged-${randomUUID()}`
  const modelId = `${providerId}::projection-model`
  await data(page, 'POST', '/providers', { providerId, name: 'Packaged fixture',
    endpointConfigs: { 'openai-chat-completions': { baseUrl } }, defaultChatEndpoint: 'openai-chat-completions',
    apiKeys: [{ id: randomUUID(), key: canary, label: 'Synthetic fixture', isEnabled: true }] })
  await data(page, 'POST', '/models', [{ providerId, modelId: 'projection-model', name: 'Packaged fixture model',
    capabilities: ['function-call'], endpointTypes: ['openai-chat-completions'], supportsStreaming: true,
    contextWindow: 128_000, maxOutputTokens: 1024 }])
  const agent = await ipc<{ id: string }>(page, 'ai.agent.create', { type: 'uar', name: 'Packaged fixture', model: modelId,
    mcps: [], instructions: `Reply briefly. Known system value: ${canary}`,
    configuration: { permission_mode: 'plan', uar_model_assignment: { source: 'boss' } } })
  const work = await data<{ id: string }>(page, 'POST', '/agent-workspaces', { path: workspace })
  return { agentId: agent.id, modelId, workspaceId: work.id }
}

export async function session(page: Page, agentId: string, workspaceId: string): Promise<string> {
  const value = await data<{ id: string }>(page, 'POST', '/agent-sessions', { agentId, name: 'Packaged acceptance',
    workspace: { type: 'user', workspaceId } })
  return value.id
}

export async function writeDesktopReceipt(config: PackagedConfig, rows: Array<{ id: string; status: string;
  executedCount: number; negativeCount: number; observations: Record<string, unknown>;
  evidence?: Array<{ path: string; sha256: string }> }>, cleanupConfirmed: boolean) {
  const binding = JSON.parse(await readFile(process.env.BAUAR_COMPONENT_BINDING_PATH!, 'utf8'))
  const scenarios = config.scenarios.filter(item => item.componentId === binding.componentId).map(item => {
    const row = rows.find(row => row.id === item.id)
    return { id: item.id, ownerTaskKey: item.ownerTaskKey, status: row?.status ?? 'BLOCKED',
      observations: { ...(row?.observations ?? {}), cleanupConfirmed }, executedCount: row?.executedCount ?? 0,
      negativeControl: { status: row?.status === 'PASS' ? 'PASS' : 'BLOCKED', executedCount: row?.negativeCount ?? 0 },
      evidence: row?.evidence ?? [] }
  })
  const receipt = { schemaVersion: 1, kind: 'component', binding,
    status: scenarios.every(row => row.status === 'PASS') && cleanupConfirmed ? 'PASS' : 'FAIL', scenarios,
    cleanup: { descendantsReconciled: cleanupConfirmed, ownedResourcesRemaining: cleanupConfirmed ? 0 : 1,
      ledger: [{ kind: 'process', state: cleanupConfirmed ? 'closed' : 'retained', owned: true },
        { kind: 'directory', state: 'retained', owned: true }] } }
  await writeFile(process.env.BAUAR_COMPONENT_RECEIPT_PATH!, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
}

export async function failureEvidence(stage: string, diagnostic: Record<string, unknown>, sourceLine?: number) {
  const root = process.env.BAUAR_PRIVATE_ROOT
  assert(root && isAbsolute(root), 'Private diagnostic root is unavailable')
  const path = join(root, `desktop-failure-${randomUUID()}.json`)
  const bytes = `${JSON.stringify({ schemaVersion: 1, kind: 'desktop-diagnostic', stage,
    category: 'packaged_scenario_failed', diagnostic, ...(sourceLine ? { sourceLine } : {}),
    rawDiagnosticRetained: false }, null, 2)}\n`
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') }
}

export async function invalidRoots(config: PackagedConfig, evidence: Array<{ path: string; sha256: string }>): Promise<number> {
  const parent = await privateProfile(config, 'invalid-roots')
  const file = join(parent, 'file')
  await writeFile(file, 'fixture')
  const inaccessible = join(parent, 'inaccessible')
  await mkdir(inaccessible, { mode: 0 })
  const { runOwned } = await import(pathToFileURL(join(dirname(config.configPath), 'lib/processes.mjs')).href)
  const diagnosticRoot = process.env.BAUAR_PRIVATE_ROOT
  assert(diagnosticRoot && isAbsolute(diagnosticRoot), 'Private diagnostic root is unavailable')
  for (const [caseName, root] of [['empty', ''], ['relative', 'relative-root'], ['absent', join(parent, 'absent')],
    ['file', file], ['inaccessible', inaccessible]]) {
    let refusal = false
    const result = await runOwned({ program: packagedExecutable(config), args: [], cwd: config.bossRoot,
      env: { ...process.env, THE_BOSS_PROFILE_ROOT: root, NODE_ENV: 'production' }, budgetMs: 30_000,
      outputPolicy: { observeLine(_stream: string, line: string) {
        if (line.includes('THE_BOSS_PROFILE_ROOT is invalid or unavailable.')) refusal = true
      }, result() { return { refusal } } } })
    const path = join(diagnosticRoot, `desktop-invalid-root-${caseName}-${randomUUID()}.json`)
    const bytes = `${JSON.stringify({ schemaVersion: 1, kind: 'desktop-invalid-root-diagnostic', caseName,
      category: result.category, exitCode: result.exitCode, refusal,
      cleanup: { groupAbsent: result.cleanup.groupAbsent, unknownDescendants: result.cleanup.unknownDescendants,
        gracefulStopAttempted: result.cleanup.gracefulStopAttempted, forcedStopAttempted: result.cleanup.forcedStopAttempted },
      rawDiagnosticRetained: false }, null, 2)}\n`
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
    evidence.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
    assert.equal(result.category, 'completed')
    assert(result.exitCode !== 0 && refusal && result.cleanup.groupAbsent && !result.cleanup.unknownDescendants)
  }
  return 5
}

export async function bundleReadiness(launch: PackagedLaunch) {
  return launch.app.evaluate(async (_, input) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const { readdirSync, readFileSync } = process.getBuiltinModule('node:fs')
    const { join } = process.getBuiltinModule('node:path')
    const require = createRequire(join(input.mainDirectory, 'main.js'))
    const chunk = readdirSync(input.mainDirectory).find(name => /^Application-[^/]+\.js$/.test(name))!
    const application = require.cache[require.resolve(join(input.mainDirectory, chunk))]!.exports.application
    const service = application.get('UarSidecarService')
    const endpoint = await service.ensureReady()
    const payload = service.payload()
    if (payload?.source !== 'packaged') throw new Error('Packaged fixture selected an external sidecar')
    const response = await service.adminRequest('/api/uar/capabilities')
    if (!response.ok) throw new Error('Authenticated packaged capabilities failed')
    const digest = process.getBuiltinModule('node:crypto').createHash('sha256').update(readFileSync(payload.executable)).digest('hex')
    return { packaged: true, binarySource: payload.source, executable: payload.executable, digest,
      processId: endpoint.processId, authenticatedReadiness: true, generation: endpoint.generation }
  }, { mainDirectory: launch.mainDirectory })
}

export async function installExecutionObservation(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const original = globalThis.fetch
    const admissions: string[] = []
    const streamPaths = new Map<string, string>()
    const streams: Array<{ runId: string; cursor: string | null }> = []
    ;(globalThis as any).__bauarExecutionObservation = { admissions, streams, restore() { globalThis.fetch = original } }
    globalThis.fetch = async (request, init) => {
      const url = new URL(request instanceof Request ? request.url : String(request))
      const response = await original(request, init)
      if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        if (url.pathname === '/api/uar/runs' && init?.method === 'POST' && response.ok) {
          const created = await response.clone().json()
          admissions.push(created.run_id)
          streamPaths.set(new URL(created.stream_url, url).pathname, created.run_id)
        }
        const runId = streamPaths.get(url.pathname)
        if (runId && response.headers.get('content-type')?.includes('text/event-stream')) {
          streams.push({ runId, cursor: new Headers(init?.headers).get('last-event-id') })
        }
      }
      return response
    }
  })
}

export async function finishExecutionObservation(app: ElectronApplication) {
  return app.evaluate(() => {
    const state = (globalThis as any).__bauarExecutionObservation
    try {
      return { admissions: state.admissions.length, streams: state.streams.length,
        oneExecution: state.admissions.length === 1 && state.streams.every((entry: any) => entry.runId === state.admissions[0]),
        cursorResume: state.streams.length === 2 && typeof state.streams[1].cursor === 'string'
          && /^\d+$/.test(state.streams[1].cursor) }
    } finally { state.restore(); delete (globalThis as any).__bauarExecutionObservation }
  })
}

export async function installFilesystemObservation(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    const { IncomingMessage } = process.getBuiltinModule('node:http')
    const original = IncomingMessage.prototype.emit
    const buffers = new WeakMap<object, Buffer[]>()
    const state = { calls: 0, incomplete: false, restore() { IncomingMessage.prototype.emit = original } }
    ;(globalThis as any).__bauarFilesystemObservation = state
    IncomingMessage.prototype.emit = function (event: string | symbol, ...args: any[]) {
      if (this.method === 'POST') {
        if (event === 'data') {
          const chunks = buffers.get(this) ?? []
          chunks.push(Buffer.from(args[0]))
          buffers.set(this, chunks)
        } else if (event === 'end') {
          const chunks = buffers.get(this)
          buffers.delete(this)
          if (chunks) {
            const text = Buffer.concat(chunks).toString()
            if (text.trim().startsWith('{')) {
              try {
                const body = JSON.parse(text)
                if (body.method === 'tools/call' && body.params?.name === 'write_file') state.calls++
              } catch { state.incomplete = true }
            }
          }
        }
      }
      return Reflect.apply(original, this, [event, ...args])
    }
  })
}

export async function finishFilesystemObservation(app: ElectronApplication) {
  return app.evaluate(() => {
    const state = (globalThis as any).__bauarFilesystemObservation
    try { return { calls: state.calls, incomplete: state.incomplete } }
    finally { state.restore(); delete (globalThis as any).__bauarFilesystemObservation }
  })
}
