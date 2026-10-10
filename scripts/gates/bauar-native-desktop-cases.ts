import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { expect, type ElectronApplication, type Page } from '@playwright/test'

import { closeProjectionHistorySession } from './bauar-secret-projection-lifecycle'
import { prepareProjectionToolAgent } from './bauar-secret-projection-mcp'
import { ProjectionProviderConversation } from './bauar-secret-projection-provider'
import { runTurn } from './bauar-secret-projection-turn'
import { encodeUarProviderToolName } from '../../src/main/ai/runtime/uar/uarToolNames'
import { installNativeControls, nativeObservation, nativeReplay, releaseNativeAck, restoreNativeControls,
  type NativeReplay } from './bauar-native-admission-controls'

const progress = new Map(['before_approval', 'drop_ack', 'hold_ack', 'host_terminal',
  'isolated_restart_no_old_authority', 'UAR_claim_intent_persistence_failure', 'UAR_local_terminal_persistence_failure']
  .map((category) => [category, 'unrun']))
let activeCategory: string | undefined
export function nativeCaseProgress() {
  return [...progress].map(([category, status]) => ({ category,
    status: category === activeCategory && status === 'running' ? 'failed' : status }))
}

export class NativeFaultConversation {
  private callId = randomUUID()
  private proposed = false
  private requests = 0
  private refused = false
  private successfulResult = false
  private failure: string | null = null
  constructor(private readonly target: string) {}
  next(body: any) {
    this.requests += 1
    if (!this.proposed) {
      const advertised = body.tools?.filter((tool: any) => tool.function?.name === 'search_tools') ?? []
      if (advertised.length !== 1) { this.failure = 'native_not_advertised'; return { kind: 'failure' as const, category: this.failure } }
      this.proposed = true
      return { kind: 'call' as const, call: { id: this.callId, name: 'search_tools', arguments: JSON.stringify({ query: this.target }) } }
    }
    const results = body.messages?.filter((message: any) => message.role === 'tool' && message.tool_call_id === this.callId) ?? []
    const calls = body.messages?.flatMap((message: any) => message.role === 'assistant' ? message.tool_calls ?? [] : [])
      .filter((call: any) => call.id === this.callId && call.function?.name === 'search_tools') ?? []
    if (results.length !== 1 || calls.length !== 1 || this.requests !== 2) {
      this.failure = 'native_result_identity_mismatch'
      return { kind: 'failure' as const, category: this.failure }
    }
    const text = JSON.stringify(results[0].content)
    this.refused = text.includes('Tool admission claim was refused or unconfirmed') ||
      text.includes('Tool admission claim and cancellation are unconfirmed')
    this.successfulResult = !this.refused && text.includes(this.target)
    return { kind: 'native_complete' as const }
  }
  diagnostic() { return { requestCount: this.requests, proposed: this.proposed, refused: this.refused,
    successfulResult: this.successfulResult, failure: this.failure } }
}

async function request<T>(page: Page, route: string, input: unknown): Promise<T> {
  const result = await page.evaluate(({ route, input }) => window.api.ipcApi.request(route, input), { route, input }) as any
  if (!result.ok) throw new Error('Native case IPC request failed')
  return result.data
}

async function session(page: Page, agentId: string, workspaceId: string): Promise<string> {
  return page.evaluate(async ({ agentId, workspaceId }) => {
    const result = await window.api.dataApi.request({ id: crypto.randomUUID(), method: 'POST', path: '/agent-sessions',
      body: { agentId, name: 'Native admission acceptance', workspace: { type: 'user', workspaceId } } }) as any
    if (result.error || !result.data?.id) throw new Error('Native case session creation failed')
    return result.data.id as string
  }, { agentId, workspaceId })
}

async function beforeApprovalCancellation(page: Page, topicId: string, modelId: string) {
  await page.evaluate(async ({ topicId, modelId }) => {
    const state = { requests: 0, cancelled: false, wrongApprovalRefused: false, failed: false, off: [] as Array<() => void> }
    ;(window as any).__bauarNativeTurn = state
    state.off.push(window.api.ipcApi.on('ai.stream.chunk', (event: any) => {
      if (event.topicId !== topicId || event.chunk?.type !== 'tool-approval-request') return
      state.requests += 1
      void (async () => {
        const wrong = await window.api.ipcApi.request('ai.tool.respond_approval', {
          topicId, approvalId: crypto.randomUUID(), approved: true
        }) as any
        state.wrongApprovalRefused = !wrong.ok || wrong.data?.ok === false
        const abort = await window.api.ipcApi.request('ai.stream.abort', { topicId }) as any
        state.cancelled = abort.ok === true
      })().catch(() => { state.failed = true })
    }))
    const opened = await window.api.ipcApi.request('ai.stream.open', { trigger: 'submit-message', topicId,
      mentionedModelIds: [modelId], userMessageParts: [{ type: 'text', text: 'Exercise native discovery once.' }] }) as any
    if (!opened.ok) throw new Error('Native cancellation stream open failed')
  }, { topicId, modelId })
  try {
    await expect.poll(() => page.evaluate(() => {
      const state = (window as any).__bauarNativeTurn
      return state.cancelled || state.failed
    }), { timeout: 60_000 }).toBe(true)
    const result = await page.evaluate(() => {
      const { requests, cancelled, wrongApprovalRefused, failed } = (window as any).__bauarNativeTurn
      return { requests, cancelled, wrongApprovalRefused, failed }
    })
    assert.deepEqual(result, { requests: 1, cancelled: true, wrongApprovalRefused: true, failed: false })
    return result
  } finally {
    await page.evaluate(() => {
      for (const off of (window as any).__bauarNativeTurn.off) off()
      delete (window as any).__bauarNativeTurn
    })
  }
}

export async function exerciseNativeDesktopCases(input: {
  app: ElectronApplication; page: Page; profile: string; mainDirectory?: string; sourceAgent: string; modelId: string
  workspaceId: string; serverId: string; targetName: string; canary: string
  targetEffects(): number
  conversation(value: NativeFaultConversation | ProjectionProviderConversation | undefined): void
}) {
  const cases: unknown[] = []
  const agent = await prepareProjectionToolAgent(input.page, input.sourceAgent, input.modelId, input.serverId, 'deferred')
  let replay: NativeReplay[] = []
  for (const mode of ['before_approval', 'drop_ack', 'hold_ack', 'host_terminal'] as const) {
    activeCategory = mode
    progress.set(mode, 'running')
    const sessionId = await session(input.page, agent.id, input.workspaceId)
    const topicId = `agent-session:${sessionId}`
    const conversation = new NativeFaultConversation(input.targetName)
    input.conversation(conversation)
    const before = input.targetEffects()
    await installNativeControls(input.app, input.profile, mode === 'before_approval' ? 'observe' : mode, [], undefined, input.mainDirectory)
    let running: Promise<Awaited<ReturnType<typeof runTurn>>> | undefined
    try {
      let error = ''
      let chunks = ''
      let cancellation: unknown
      if (mode === 'before_approval') cancellation = await beforeApprovalCancellation(input.page, topicId, input.modelId)
      else {
        running = runTurn(input.page, topicId, input.modelId, { approve: true })
        // Attach immediately so an early run rejection cannot become unhandled while waiting for the held acknowledgment.
        void running.catch(() => undefined)
        if (mode === 'hold_ack') {
          await expect.poll(async () => (await nativeObservation(input.app)).held, { timeout: 60_000 }).toBe(true)
          const aborted = request(input.page, 'ai.stream.abort', { topicId })
          void aborted.catch(() => undefined)
          await expect.poll(async () => (await nativeObservation(input.app)).cancellationAcknowledgments,
            { timeout: 60_000 }).toBeGreaterThan(0)
          await releaseNativeAck(input.app, false)
          await aborted
        }
        const turn = await running
        error = turn.error
        chunks = turn.chunks
        assert.equal(turn.approvals.requests.length, 1)
        assert.equal(turn.approvals.accepted.length, 1)
      }
      await closeProjectionHistorySession(input.app, sessionId, input.mainDirectory)
      const observed = await nativeObservation(input.app, true)
      assert.equal(observed.observationFailed, false)
      assert.equal(observed.preparations, 1)
      assert.equal(input.targetEffects() - before, 0)
      assert.equal(conversation.diagnostic().failure, null)
      if (mode === 'before_approval') {
        assert.equal(observed.consumes, 0)
        assert.equal(observed.finishRequests, 0)
        assert(observed.hostStates.every((state) => ['cancelled', 'interrupted'].includes(state)))
      } else {
        assert.equal(observed.consumes, 1)
        assert.equal(observed.durableConsumes, 1)
        if (mode === 'host_terminal') {
          assert.equal(observed.finishRequests, 1)
          assert.equal(observed.successfulFinishRequests, 1)
          assert.equal(observed.terminalFailures, 1)
          assert(error.includes('terminal') || chunks.includes('TERMINAL_RESULT_PERSISTENCE_FAILED'))
          assert(observed.runtimeStates.includes('succeeded'))
        } else {
          assert.equal(observed.finishRequests, 0)
          assert(!observed.runtimeStates.some((state) => state === 'succeeded' || state === 'failed'))
          assert(observed.runtimeStates.includes('outcome_unknown'))
          if (mode === 'drop_ack') assert(conversation.diagnostic().refused)
          assert.equal(conversation.diagnostic().successfulResult, false)
        }
        assert(observed.hostStates.every((state) => state === 'outcome-unknown'))
        if (mode === 'drop_ack') replay = await nativeReplay(input.app)
      }
      cases.push({ category: mode, status: 'passed', observed, cancellation,
        provider: conversation.diagnostic(), mcpEffects: 0, terminalError: mode === 'host_terminal' })
      progress.set(mode, 'passed')
    } finally {
      await request(input.page, 'ai.stream.abort', { topicId }).catch(() => undefined)
      await releaseNativeAck(input.app, true)
      await running?.catch(() => undefined)
      try { await closeProjectionHistorySession(input.app, sessionId, input.mainDirectory) }
      finally { await restoreNativeControls(input.app); input.conversation(undefined) }
    }
  }
  return { cases, replay, agentId: agent.id, blocked: [
    { category: 'post_ack_pre_dispatch_cancellation', status: 'blocked_unrun', control: 'FC-POSTACK-CANCEL' }
  ] }
}

type StorageReceipt = { version: number; ok: boolean; mode: string; assertion: string;
  stateCounts: Record<string, number>; totalRows: number }

async function storageFixture(root: string, mode: 'seed-claim-intent' | 'seed-terminal' | 'inspect'): Promise<StorageReceipt> {
  const executable = process.env.THE_BOSS_UAR_STORAGE_FIXTURE_PATH
  if (!executable) throw new Error('Native storage fixture artifact is unavailable')
  let stdout: string
  try {
    ;({ stdout } = await promisify(execFile)(executable, ['--exact', 'storage_fixture', '--nocapture'], {
      env: { ...process.env, BAUAR_STORAGE_FIXTURE_MODE: mode, BAUAR_STORAGE_FIXTURE_ROOT: root,
        BAUAR_STORAGE_FIXTURE_NS: 'uar', BAUAR_STORAGE_FIXTURE_DB: 'uar' }, timeout: 60_000, maxBuffer: 64 * 1024
    }))
  } catch { throw new Error('Native storage fixture did not complete') }
  const lines = [...stdout.matchAll(/BAUAR_STORAGE_FIXTURE_JSON=(\{[^\r\n]*\})/g)]
  assert.equal(lines.length, 1)
  const receipt = JSON.parse(lines[0][1]) as StorageReceipt
  assert.equal(receipt.ok, true)
  assert.equal(receipt.mode, mode)
  return receipt
}

async function storageRoot(app: ElectronApplication, profile: string, mainDirectory = join(process.cwd(), 'out/main')): Promise<string> {
  return app.evaluate((_, input) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const { readdirSync } = process.getBuiltinModule('node:fs')
    const { join, relative, isAbsolute } = process.getBuiltinModule('node:path')
    const require = createRequire(join(input.mainDirectory, 'main.js'))
    const chunks = readdirSync(input.mainDirectory).filter((name: string) => /^Application-[^/]+\.js$/.test(name))
    if (chunks.length !== 1) throw new Error('Native storage Application chunk is ambiguous')
    const loaded = require.cache[require.resolve(join(input.mainDirectory, chunks[0]))]
    if (!loaded) throw new Error('Native storage Application chunk is not loaded')
    const application = loaded.exports.application
    if (application.get('UarSidecarService').status()) throw new Error('Native storage seed requires an unstarted sidecar')
    const root = application.getPath('feature.agents.uar.data')
    const userData = application.getPath('app.userdata')
    const child = relative(userData, root)
    if (!userData.includes(input.profile) || child.startsWith('..') || isAbsolute(child) || !child) {
      throw new Error('Native storage seed refused non-isolated profile')
    }
    return root
  }, { mainDirectory, profile })
}

export async function exerciseNativeStorageCases(input: {
  launch(profile: string): Promise<{ app: ElectronApplication; page: Page; mainDirectory?: string }>
  baseUrl: string; canary: string; mcpUrl: string
  targetEffects(): number
  conversation(value: NativeFaultConversation | ProjectionProviderConversation | undefined): void
}) {
  const cases: unknown[] = []
  for (const mode of ['seed-claim-intent', 'seed-terminal'] as const) {
    const category = mode === 'seed-claim-intent' ? 'UAR_claim_intent_persistence_failure' : 'UAR_local_terminal_persistence_failure'
    activeCategory = category
    progress.set(category, 'running')
    const profile = `BAUAR-Native-Storage-${randomUUID()}`
    let app: ElectronApplication | undefined
    let sessionId: string | undefined
    let controls = false
    let mainDirectory: string | undefined
    try {
      let launched = await input.launch(profile)
      app = launched.app
      mainDirectory = launched.mainDirectory
      await launched.page.evaluate(() => window.api.preference.setMultiple({ 'app.language': 'en-US',
        'app.onboarding.provider_setup.status': 'skipped', 'app.privacy.data_collection.enabled': false,
        'app.developer_mode.enabled': true }))
      const root = await realpath(await storageRoot(app, profile, mainDirectory))
      await app.close()
      app = undefined
      await mkdir(root, { recursive: true })
      await writeFile(join(root, '.bauar-native-storage-fixture.json'), JSON.stringify({ version: 1,
        purpose: 'bauar-native-admission-storage-fixture' }), { flag: 'wx' })
      const seeded = await storageFixture(root, mode)
      assert.equal(seeded.totalRows, 0)
      launched = await input.launch(profile)
      app = launched.app
      const page = launched.page
      const providerId = `native-storage-${randomUUID()}`
      const modelId = `${providerId}::projection-model`
      const setup = await page.evaluate(async ({ providerId, baseUrl, canary, modelId, mcpUrl, workspace }) => {
        const api = { async write(path: string, body: unknown) {
          const response = await window.api.dataApi.request({ id: crypto.randomUUID(), method: 'POST', path, body }) as any
          if (response.error) throw new Error('Native storage fixture configuration failed')
          return response.data
        } }
        await api.write('/providers', { providerId, name: 'Native storage fixture',
          endpointConfigs: { 'openai-chat-completions': { baseUrl } }, defaultChatEndpoint: 'openai-chat-completions',
          apiKeys: [{ id: crypto.randomUUID(), key: canary, label: 'Synthetic fixture credential', isEnabled: true }] })
        await api.write('/models', [{ providerId, modelId: 'projection-model', name: 'Native storage model',
          capabilities: ['function-call'], endpointTypes: ['openai-chat-completions'], supportsStreaming: true,
          contextWindow: 128_000, maxOutputTokens: 1024 }])
        const agent = await window.api.ipcApi.request('ai.agent.create', { type: 'uar', name: 'Native storage fixture',
          model: modelId, mcps: [], instructions: `Reply briefly. Known system value: ${canary}`,
          configuration: { permission_mode: 'plan', uar_model_assignment: { source: 'boss' } } }) as any
        if (!agent.ok) throw new Error('Native storage agent creation failed')
        const work = await api.write('/agent-workspaces', { path: workspace })
        const mcp = await api.write('/mcp-servers', { name: 'Native storage MCP fixture', type: 'streamableHttp',
          baseUrl: mcpUrl, headers: { Authorization: `Bearer ${canary}` }, isActive: true, isTrusted: true })
        return { agentId: agent.data.id as string, workspaceId: work.id as string, serverId: mcp.id as string }
      }, { providerId, baseUrl: input.baseUrl, canary: input.canary, modelId, mcpUrl: input.mcpUrl,
        workspace: await mkdtemp(join(tmpdir(), 'bauar-native-storage-')) })
      input.conversation(undefined)
      const registrationSession = await session(page, setup.agentId, setup.workspaceId)
      const registration = await runTurn(page, `agent-session:${registrationSession}`, modelId)
      assert.equal(registration.error, '')
      await closeProjectionHistorySession(app, registrationSession, mainDirectory)
      const agent = await prepareProjectionToolAgent(page, `the-boss:${setup.agentId}`, modelId, setup.serverId, 'deferred')
      const conversation = new NativeFaultConversation(encodeUarProviderToolName(`${setup.serverId}__read_projection`))
      input.conversation(conversation)
      sessionId = await session(page, agent.id, setup.workspaceId)
      await installNativeControls(app, profile, 'observe', [], undefined, mainDirectory)
      controls = true
      const before = input.targetEffects()
      const turn = await runTurn(page, `agent-session:${sessionId}`, modelId, { approve: true })
      await closeProjectionHistorySession(app, sessionId, mainDirectory)
      const observed = await nativeObservation(app, true)
      assert.equal(observed.observationFailed, false)
      assert.equal(observed.preparations, 1)
      assert.equal(observed.finishRequests, 0)
      assert.equal(input.targetEffects() - before, 0)
      assert.equal(turn.approvals.requests.length, 1)
      assert.equal(turn.approvals.accepted.length, 1)
      if (mode === 'seed-claim-intent') {
        assert.equal(observed.durableConsumes, 0)
        assert(conversation.diagnostic().refused)
      } else {
        assert.equal(observed.durableConsumes, 1)
        assert(turn.error.includes('terminal') || turn.chunks.includes('TERMINAL_RESULT_PERSISTENCE_FAILED'))
      }
      await restoreNativeControls(app)
      controls = false
      await app.close()
      app = undefined
      const persisted = await storageFixture(root, 'inspect')
      assert.equal(persisted.assertion, mode === 'seed-claim-intent' ? 'claim-intent' : 'terminal')
      assert.equal(persisted.stateCounts.ClaimIntent, mode === 'seed-claim-intent' ? 0 : 1)
      assert.equal(persisted.stateCounts.Succeeded, 0)
      assert.equal(persisted.stateCounts.Failed, 0)
      cases.push({ category,
        status: 'passed', observed, persisted, nativeOutcome: mode === 'seed-claim-intent' ? 'claim_refused' : 'terminal_persistence_failed',
        mcpEffects: 0, noReplay: true })
      progress.set(category, 'passed')
    } finally {
      input.conversation(undefined)
      if (app) {
        try { if (sessionId) await closeProjectionHistorySession(app, sessionId, mainDirectory) }
        finally {
          try { if (controls) await restoreNativeControls(app) }
          finally { await app.close() }
        }
      }
    }
  }
  return cases
}

export async function exerciseNativeRestart(input: {
  app: ElectronApplication; page: Page; profile: string; mainDirectory?: string; agentId: string; workspaceId: string; modelId: string
  replay: NativeReplay[]; targetName: string; canary: string
  targetEffects(): number
  conversation(value: NativeFaultConversation | ProjectionProviderConversation | undefined): void
}) {
  activeCategory = 'isolated_restart_no_old_authority'
  progress.set(activeCategory, 'running')
  assert.equal(input.replay.length, 3)
  const history = await request<any>(input.page, 'prometheus.uar.operations.read', {})
  const oldIds = new Set(input.replay.map((entry) => entry.admissionId))
  const prior = history.approvals.filter((entry: any) => oldIds.has(entry.admissionId))
  assert.equal(prior.length, 3)
  assert(prior.every((entry: any) => entry.state === 'outcome-unknown'))
  await installNativeControls(input.app, input.profile, 'observe', input.replay, undefined, input.mainDirectory)
  const sessionId = await session(input.page, input.agentId, input.workspaceId)
  const conversation = new ProjectionProviderConversation('success', input.targetName, input.canary)
  input.conversation(conversation)
  const before = input.targetEffects()
  try {
    const result = await runTurn(input.page, `agent-session:${sessionId}`, input.modelId, { approve: true })
    assert.equal(result.error, '')
    assert.equal(result.approvals.requests.length, 2)
    assert.equal(new Set(result.approvals.accepted).size, 2)
    assert.equal(input.targetEffects() - before, 1)
    await closeProjectionHistorySession(input.app, sessionId, input.mainDirectory)
    const observed = await nativeObservation(input.app, true)
    assert.deepEqual(observed.replayStatuses, [404, 404, 404])
    assert.equal(observed.durableConsumes, 1)
    assert.equal(observed.successfulFinishRequests, 1)
    assert.equal(conversation.diagnostic().discoveryCorrelated, true)
    assert.equal(conversation.diagnostic().targetCorrelated, true)
    progress.set('isolated_restart_no_old_authority', 'passed')
    return { category: 'isolated_restart_no_old_authority', status: 'passed', oldHistoryUnknown: true,
      priorReceiptRefused: true, legacyVersionKindlessReplayRefused: true, observed }
  } finally {
    await request(input.page, 'ai.stream.abort', { topicId: `agent-session:${sessionId}` }).catch(() => undefined)
    try { await closeProjectionHistorySession(input.app, sessionId, input.mainDirectory) }
    finally { await restoreNativeControls(input.app); input.conversation(undefined) }
  }
}
