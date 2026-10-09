import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'

import { launchProjectionDesktop as launch } from './bauar-secret-projection-launch'

import {
  assertMcpSinkCapture, exerciseProjectedClaims, finishMcpSinkCapture, installMcpSinkCapture,
  type ProjectionToolMode, type McpSinkDiagnostic, startProjectionMcp, prepareProjectionToolAgent, projectedModelResultAccepted
} from './bauar-secret-projection-mcp'
import {
  assertProjectedEvents, collectProjectedEventAssertions, eventAssertionDiagnostic, finishEventProjectionFixture, installEventProjectionFixture
} from './bauar-secret-projection-events'
import {
  installCapture, finishCapture, readCaptureDiagnostic, restoreCapture, type CaptureDiagnostic, type Fault
} from './bauar-secret-projection-revision'

import { assertProjectionSources, mcpAssertionDiagnostic, mcpRunDiagnostic, type McpRunContext } from './bauar-secret-projection-mcp-diagnostic'
import { runTurn, registrationReason, registrationErrorDiagnostic, readFailedTurnDiagnostic } from './bauar-secret-projection-turn'
import { historyAssertionDiagnostic } from './bauar-secret-projection-history'
import { closeProjectionHistorySession } from './bauar-secret-projection-lifecycle'
import { ProjectionProviderConversation, type ProjectionProviderDriver, type ProjectionResultDiagnostic } from './bauar-secret-projection-provider'
import { encodeUarProviderToolName } from '../../src/main/ai/runtime/uar/uarToolNames'
import { exerciseNativeDesktopCases, exerciseNativeRestart, exerciseNativeStorageCases, NativeFaultConversation, nativeCaseProgress } from './bauar-native-desktop-cases'
import { restoreNativeControls } from './bauar-native-admission-controls'
import { exercisePostAckCases, postAckCaseProgress } from './bauar-post-ack-cases'
import { exerciseProviderNegativeCases, providerNegativeCaseProgress } from './bauar-provider-negative-cases'

type Message = { id: string; role: string; data: { parts: unknown[]; [key: string]: unknown } }

type DiagnosticStage = 'configuration' | 'host_claim_fixture' | 'mcp_fixture' | 'provider_fixture' |
  'desktop_bootstrap' | 'desktop_relaunch' | 'model_setup' | 'agent_setup' | 'registration_run' |
  'registration_assertions' | 'history_seed' | 'history_run' | 'history_assertions' |
  'fault_run' | 'fault_assertions' | 'mcp_setup' | 'mcp_run' | 'mcp_assertions' | 'mcp_sink_assertions' |
  'approval_agent_setup' | 'event_setup' | 'event_run' | 'event_capture' | 'event_persistence' |
  'event_assertions' | 'provider_negative_cases' | 'native_cases' | 'native_restart' | 'native_storage' | 'native_post_ack' | 'receipt_write' | 'cleanup'
type DiagnosticScenario = 'none' | Fault | ProjectionToolMode | 'split' | 'partial' | 'reconnect' |
  'interrupted' | 'snapshot' | 'run-error' | 'approval' | 'approval-error'
let diagnostic: { stage: DiagnosticStage; scenario: DiagnosticScenario } = { stage: 'configuration', scenario: 'none' }
let failedDiagnostic: typeof diagnostic | undefined
let historyDiagnostic: ReturnType<typeof historyAssertionDiagnostic> | undefined
let mcpDiagnostic: ReturnType<typeof mcpAssertionDiagnostic> | undefined
let mcpRunFailure: ReturnType<typeof mcpRunDiagnostic> | undefined
let eventDiagnostic: ReturnType<typeof eventAssertionDiagnostic> | undefined
let providerConversationDiagnostic: ReturnType<ProjectionProviderDriver['diagnostic']> | ReturnType<NativeFaultConversation['diagnostic']> | undefined
const profileReceipts: Array<ReturnType<typeof assertProjectionSources>> = []
const eventReceipts: Array<ReturnType<typeof assertProjectedEvents>> = []
const eventOutcomes: Array<ReturnType<typeof collectProjectedEventAssertions>> = []
const nativeReceipts: unknown[] = []
let mcpFixtureDiagnostic: { eager: ReturnType<Awaited<ReturnType<typeof startProjectionMcp>>['diagnostic']>; deferred: ReturnType<Awaited<ReturnType<typeof startProjectionMcp>>['diagnostic']> } | undefined
let sinkDiagnostic: { authenticated: boolean; deferredAuthenticated: boolean; allModelInputsRedacted: boolean; allModelResultsAccepted: boolean;
  modelInputs: Array<ProjectionResultDiagnostic & { profile: string; mode: ProjectionToolMode }>;
  capture: McpSinkDiagnostic | null; configuredCredentialPreserved?: boolean } | undefined
let registrationDiagnostic: {
  operation: 'capture_install' | 'run_turn' | 'stream_assertion' | 'capture_inspection' | 'assertions' | 'original_agent_read' | 'original_agent_assertion'
  streamErrorPresent: boolean | null; streamHttpStatus: number | null; reason: string; capture: CaptureDiagnostic | null
  turn?: Awaited<ReturnType<typeof runTurn>>['diagnostic']; thrown?: ReturnType<typeof registrationErrorDiagnostic>
  providerRequestCount: number; providerReached: boolean
} | undefined
function checkpoint(stage: DiagnosticStage, scenario: DiagnosticScenario = 'none'): void {
  diagnostic = { stage, scenario }
}

async function ipc<T>(page: Page, route: string, input: unknown): Promise<T> {
  const result = await page.evaluate(({ route, input }) => window.api.ipcApi.request(route, input), { route, input }) as {
    ok: boolean; data?: T; error?: { message?: string }
  }
  if (!result.ok) throw new Error(result.error?.message ?? `${route} failed`)
  return result.data as T
}

async function data<T>(page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const result = await page.evaluate(({ method, path, body }) => window.api.dataApi.request({
    id: crypto.randomUUID(), method, path, ...(body === undefined ? {} : { body })
  }), { method, path, body }) as { data?: T; error?: { message?: string } }
  if (result.error) throw new Error(result.error.message ?? `${method} ${path} failed`)
  return result.data as T
}


async function main(): Promise<void> {
  const sidecar = process.env.THE_BOSS_UAR_SIDECAR_PATH
  if (!sidecar) throw new Error('THE_BOSS_UAR_SIDECAR_PATH is required')
  const gateSidecar = process.env.THE_BOSS_UAR_POST_ACK_SIDECAR_PATH
  const gateArtifactManifest = process.env.THE_BOSS_UAR_POST_ACK_MANIFEST_PATH
  if (!gateSidecar || !gateArtifactManifest) throw new Error('Post-ack gate artifact and manifest inputs are required')
  const canary = `${randomUUID()}-projection-credential`
  checkpoint('host_claim_fixture')
  const claims = await exerciseProjectedClaims(canary)
  checkpoint('mcp_fixture')
  const mcp = await startProjectionMcp(canary)
  const deferredMcp = await startProjectionMcp(canary, 'deferred')
  checkpoint('provider_fixture')
  const profile = `BAUAR-Projection-${Date.now()}`
  const workspace = await mkdtemp(join(tmpdir(), 'bauar-projection-'))
  const providerRequests: Array<{ authorized: boolean; containsCanary: boolean; systemProjected: boolean; racedPrompt: boolean }> = []
  let toolConversation: ProjectionProviderDriver | NativeFaultConversation | undefined
  let responseObserver: ((status: number) => void) | undefined
  const providerConversations: ProjectionProviderConversation[] = []
  let providerFailure = false
  const toolInputs: Array<ProjectionResultDiagnostic & { profile: string; mode: ProjectionToolMode }> = []
  const provider = createServer(async (request, response) => {
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'projection-model' }] }))
      return
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end()
      return
    }
    const observeResponse = responseObserver
    response.once('finish', () => observeResponse?.(response.statusCode))
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString())
    if (providerFailure) {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Controlled projection provider failure', type: 'invalid_request_error' } }))
      return
    }
    providerRequests.push({
      authorized: request.headers.authorization === `Bearer ${canary}`,
      containsCanary: JSON.stringify(body.messages).includes(canary),
      systemProjected: body.messages.some((message: any) => message.role === 'system' && JSON.stringify(message.content).includes('<redacted>')),
      racedPrompt: JSON.stringify(body.messages).includes('Projection catalog race marker.')
    })
    const event = (delta: object, finishReason: string | null) => `data: ${JSON.stringify({
      id: 'projection-reply', object: 'chat.completion.chunk', created: 1, model: body.model,
      choices: [{ index: 0, delta, finish_reason: finishReason }]
    })}\n\n`
    const step = toolConversation?.next(body)
    providerConversationDiagnostic = toolConversation?.diagnostic()
    if (step?.kind === 'failure') {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: step.category, type: 'invalid_request_error' } }))
      return
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    if (step?.kind === 'call') {
      response.end(event({ role: 'assistant', tool_calls: [{ index: 0, id: step.call.id, type: 'function',
        function: { name: step.call.name, arguments: step.call.arguments }
      }] }, null) + event({}, 'tool_calls') + 'data: [DONE]\n\n')
      return
    }
    if (step?.kind === 'complete' && toolConversation instanceof ProjectionProviderConversation) {
      toolInputs.push({ profile: toolConversation.profile, mode: toolConversation.mode, redacted: step.redacted,
        canaryAbsent: step.canaryAbsent, redactionMarkerPresent: step.redactionMarkerPresent,
        uarRedactionMarkerPresent: step.uarRedactionMarkerPresent,
        genericMcpFailure: step.genericMcpFailure, failureProvenanceMatches: step.failureProvenanceMatches })
    }
    for (const delta of [
      { role: 'assistant', reasoning_content: 'Benign reasoning ' }, { reasoning_content: 'marker.' },
      { content: 'Benign projection ' }, { content: 'gate marker.' }
    ]) {
      response.write(event(delta, null))
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    response.end(event({}, 'stop') + 'data: [DONE]\n\n')
  })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address()
  assert(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}/v1`
  let app: ElectronApplication | undefined
  let mcpRunContext: McpRunContext | undefined
  try {
    checkpoint('desktop_bootstrap')
    let launched = await launch(profile, sidecar)
    app = launched.app
    await launched.page.evaluate(() => window.api.preference.setMultiple({
      'app.language': 'en-US', 'app.onboarding.provider_setup.status': 'skipped',
      'app.privacy.data_collection.enabled': false, 'app.developer_mode.enabled': true
    }))
    await app.close()
    checkpoint('desktop_relaunch')
    launched = await launch(profile, sidecar)
    app = launched.app
    let page = launched.page
    const providerId = `projection-${randomUUID()}`
    const modelId = `${providerId}::projection-model`
    checkpoint('model_setup')
    await data(page, 'POST', '/providers', {
      providerId, name: 'Projection fixture', endpointConfigs: { 'openai-chat-completions': { baseUrl } },
      defaultChatEndpoint: 'openai-chat-completions',
      apiKeys: [{ id: randomUUID(), key: canary, label: 'Synthetic fixture credential', isEnabled: true }]
    })
    await data(page, 'POST', '/models', [{
      providerId, modelId: 'projection-model', name: 'Projection model', capabilities: ['function-call'],
      endpointTypes: ['openai-chat-completions'], supportsStreaming: true, contextWindow: 128_000, maxOutputTokens: 1024
    }])
    checkpoint('agent_setup')
    const agent = await ipc<{ id: string }>(page, 'ai.agent.create', {
      type: 'uar', name: 'Projection fixture', model: modelId, mcps: [],
      instructions: `Reply briefly. Known system value: ${canary}`, configuration: { permission_mode: 'plan', uar_model_assignment: { source: 'boss' } }
    })
    const workspaceEntity = await data<{ id: string }>(page, 'POST', '/agent-workspaces', { path: workspace })
    const session = await data<{ id: string }>(page, 'POST', '/agent-sessions', {
      agentId: agent.id, name: 'Projection fixture', workspace: { type: 'user', workspaceId: workspaceEntity.id }
    })
    const topicId = `agent-session:${session.id}`
    checkpoint('registration_run')
    registrationDiagnostic = { operation: 'capture_install', streamErrorPresent: null, streamHttpStatus: null, reason: 'none', capture: null,
      providerRequestCount: 0, providerReached: false }
    let registration: Awaited<ReturnType<typeof finishCapture>>
    try {
      await installCapture(app, canary, 'none')
      registrationDiagnostic.operation = 'run_turn'
      const turn = await runTurn(page, topicId, modelId)
      registrationDiagnostic.turn = turn.diagnostic
      registrationDiagnostic.providerRequestCount = providerRequests.length
      registrationDiagnostic.providerReached = providerRequests.length > 0
      registrationDiagnostic.streamErrorPresent = Boolean(turn.error)
      const streamStatus = /^UAR stream failed \(HTTP ([1-5][0-9]{2})\)(?::|$)/.exec(turn.error)
      registrationDiagnostic.streamHttpStatus = streamStatus ? Number(streamStatus[1]) : null
      registrationDiagnostic.reason = registrationReason(turn.error)
      registrationDiagnostic.operation = 'stream_assertion'
      assert.equal(turn.error, '')
      registrationDiagnostic.operation = 'capture_inspection'
      registration = await finishCapture(app)
      registrationDiagnostic.capture = await readCaptureDiagnostic(app)
    } catch (error) {
      registrationDiagnostic.thrown = registrationErrorDiagnostic(error)
      registrationDiagnostic.providerRequestCount = providerRequests.length
      registrationDiagnostic.providerReached = providerRequests.length > 0
      if (registrationDiagnostic.reason === 'none') registrationDiagnostic.reason = registrationReason(error)
      registrationDiagnostic.capture = await readCaptureDiagnostic(app).catch(() => null)
      throw error
    }
    registrationDiagnostic.operation = 'assertions'
    checkpoint('registration_assertions')
    assert.equal(registration.length, 1)
    assert(registration[0].catalogWrites > 0 && registration[0].catalogWritesProjected)
    assert(registration[0].inlineArtifactOnly && registration[0].systemProjected)
    assert(registration[0].catalogSnapshotMatched && registration[0].runSnapshotMatched)
    registrationDiagnostic.operation = 'original_agent_read'
    const originalAgent = await data<{ instructions: string }>(page, 'GET', `/agents/${agent.id}`)
    registrationDiagnostic.operation = 'original_agent_assertion'
    assert.equal(originalAgent.instructions, `Reply briefly. Known system value: ${canary}`)
    checkpoint('history_seed')
    const messages = await data<{ items: Message[] }>(page, 'GET', `/agent-sessions/${session.id}/messages`)
    const seed = messages.items.find((message) => message.role === 'assistant')
    assert(seed)
    const seededData = { ...seed.data, parts: [
      { type: 'text', text: `Legacy ordinary content ${canary}` },
      {
        type: 'dynamic-tool', toolName: 'projection_history_tool', toolCallId: 'projection-history-call',
        state: 'output-available', input: { priorInput: canary }, output: { priorOutput: canary }
      }
    ] }
    await data(page, 'PATCH', `/agent-sessions/${session.id}/messages/${seed.id}`, { data: seededData })
    await closeProjectionHistorySession(app, session.id)
    checkpoint('history_run')
    await installCapture(app, canary, 'none', agent.id)
    const historyTurn = await runTurn(page, topicId, modelId, { text: `Reply briefly. Deliberate known-value echo: ${canary}` })
    const history = await finishCapture(app)
    checkpoint('history_assertions')
    historyDiagnostic = historyAssertionDiagnostic(historyTurn.error, history, providerRequests)
    assert.equal(historyTurn.error, '')
    assert.equal(history.length, 1)
    assert.deepEqual(history[0], {
      inlineArtifactOnly: true, systemProjected: true, catalogWrites: 0, catalogWritesProjected: true,
      catalogSnapshotMatched: true, runSnapshotMatched: true, catalogRaceObserved: true,
      preparedInvocations: 0, preparedRevisionsMatched: false,
      credentialsPreserved: true, historyPresent: true, historyContainsCanary: false,
      inputContainsCanary: false, inputContainsReplacement: true,
      historyContainsReplacement: true, historyToolIdentityPreserved: true
    })
    historyDiagnostic.operation = 'provider_assertions'
    assert(providerRequests.length >= 2)
    assert(providerRequests.every((request) => request.authorized && !request.containsCanary && request.systemProjected && !request.racedPrompt))
    historyDiagnostic.operation = 'stored_history_read'
    const unchanged = await data<Message>(page, 'GET', `/agent-sessions/${session.id}/messages/${seed.id}`)
    historyDiagnostic.operation = 'stored_history_assertion'
    historyDiagnostic.originalHistoryUnchanged = JSON.stringify(unchanged.data) === JSON.stringify(seededData)
    assert.equal(JSON.stringify(unchanged.data), JSON.stringify(seededData))
    const diagnostics: Array<{ fault: Fault; redacted: boolean }> = []
    for (const fault of ['http', 'throw'] as const) {
      checkpoint('fault_run', fault)
      await ipc(page, 'ai.agent.session.close_warm', { sessionId: session.id })
      await installCapture(app, canary, fault)
      const result = await runTurn(page, topicId, modelId)
      const captures = await finishCapture(app)
      checkpoint('fault_assertions', fault)
      assert.equal(captures.length, 1)
      assert(captures[0]?.credentialsPreserved)
      assert(result.error.includes('<redacted>'))
      assert.equal(result.error.includes(canary.slice(0, 10)), false)
      assert.equal(result.chunks.includes(canary.slice(0, 10)), false)
      diagnostics.push({ fault, redacted: true })
    }
    let eagerServerId = ''
    let deferredServerId = ''
    await installMcpSinkCapture(app, canary)
    for (const fixture of [{ profile: 'eager', mcp }, { profile: 'deferred', mcp: deferredMcp }] as const) {
      const mcp = fixture.mcp
      checkpoint('mcp_setup')
      const server = await data<{ id: string }>(page, 'POST', '/mcp-servers', {
        name: `Projection external ${fixture.profile} fixture`, type: 'streamableHttp', baseUrl: mcp.url,
        headers: { Authorization: `Bearer ${canary}` }, isActive: true, isTrusted: true
      })
      if (fixture.profile === 'eager') eagerServerId = server.id
      else deferredServerId = server.id
      const targetName = encodeUarProviderToolName(`${server.id}__read_projection`)
      const toolAgent = await prepareProjectionToolAgent(page, `the-boss:${agent.id}`, modelId, server.id, fixture.profile)
      for (const mode of ['success', 'isError', 'error'] as const) {
        checkpoint('mcp_run', mode)
        const positiveConversation = new ProjectionProviderConversation(mode, targetName, canary, fixture.profile, server.id)
        toolConversation = positiveConversation
        providerConversations.push(positiveConversation)
        const toolSession = await data<{ id: string }>(page, 'POST', '/agent-sessions', {
          agentId: toolAgent.id, name: `Projection ${mode}`, workspace: { type: 'user', workspaceId: workspaceEntity.id }
        })
        const before = mcp.calls.length
        const inputBefore = toolInputs.length
        mcpRunContext = { mode, profile: fixture.profile, before, inputBefore, calls: mcp.calls, toolInputs, providerRequests }
        await installCapture(app, canary, 'none', undefined, { serverId: server.id, providerName: targetName })
        const result = await runTurn(page, `agent-session:${toolSession.id}`, modelId, { approve: true })
        const revisions = await finishCapture(app)
        const currentInputs = toolInputs.slice(inputBefore)
        checkpoint('mcp_assertions', mode)
        mcpDiagnostic = mcpAssertionDiagnostic(mode, revisions, mcp.calls, before, currentInputs, {
          present: Boolean(result.error), containsCanary: result.error.includes(canary), category: registrationReason(result.error)
        }, await readCaptureDiagnostic(app).catch(() => null), fixture.profile, result.approvals, targetName)
        assert.equal(revisions.length, 1)
        assert(revisions[0].runSnapshotMatched && revisions[0].preparedRevisionsMatched)
        const profileReceipt = assertProjectionSources(fixture.profile, mode, targetName, revisions[0], result.approvals,
          positiveConversation.diagnostic(), mcp.calls.length - before, mcp.fillerCalls())
        assert.equal(mcp.calls.length - before, 1)
        assert.equal(mcp.calls.at(-1)?.mode, mode)
        assert.equal(mcp.calls.at(-1)?.originalArguments, true)
        assert.equal(result.error.includes(canary), false)
        if (mode !== 'error') {
          assert.equal(result.error, '')
          assert(currentInputs.some((input) => input.mode === mode && input.redacted))
        }
        assert(currentInputs.some((input) => input.mode === mode && projectedModelResultAccepted(input)))
        profileReceipts.push(profileReceipt)
        await ipc(page, 'ai.agent.session.close_warm', { sessionId: toolSession.id })
      }
    }
    checkpoint('mcp_sink_assertions')
    const sinkStatus = { authenticated: mcp.authenticatedRequests() > 0,
      deferredAuthenticated: deferredMcp.authenticatedRequests() > 0,
      allModelInputsRedacted: toolInputs.every((input) => input.redacted),
      allModelResultsAccepted: toolInputs.every(projectedModelResultAccepted), modelInputs: [...toolInputs], capture: null as McpSinkDiagnostic | null }
    sinkDiagnostic = sinkStatus
    const sinkCapture = await finishMcpSinkCapture(app, (capture) => { sinkStatus.capture = capture })
    const configured = await data<{ headers: Record<string, string> }>(page, 'GET', `/mcp-servers/${eagerServerId}`)
    sinkDiagnostic.configuredCredentialPreserved = configured.headers.Authorization === `Bearer ${canary}`
    checkpoint('approval_agent_setup')
    const approvalAgent = await prepareProjectionToolAgent(page, `the-boss:${agent.id}`, modelId, eagerServerId, 'eager')
    for (const scenario of ['split', 'partial', 'reconnect', 'interrupted', 'cancel', 'snapshot', 'run-error', 'approval', 'approval-error'] as const) {
      checkpoint('event_setup', scenario)
      const approval = scenario.startsWith('approval')
      toolConversation = approval
        ? new ProjectionProviderConversation('success', encodeUarProviderToolName(`${eagerServerId}__read_projection`), canary)
        : undefined
      if (toolConversation instanceof ProjectionProviderConversation) providerConversations.push(toolConversation)
      providerFailure = scenario === 'run-error'
      const eventSession = await data<{ id: string }>(page, 'POST', '/agent-sessions', {
        agentId: approval ? approvalAgent.id : agent.id, name: `Projection events ${scenario}`,
        workspace: { type: 'user', workspaceId: workspaceEntity.id }
      })
      const eventTopic = `agent-session:${eventSession.id}`
      await installEventProjectionFixture(app, canary, scenario)
      let capture: Awaited<ReturnType<typeof finishEventProjectionFixture>>
      let result: Awaited<ReturnType<typeof runTurn>>
      try {
        checkpoint('event_run', scenario)
        result = await runTurn(page, eventTopic, modelId, { approve: approval, cancel: scenario === 'cancel' })
      } catch (error) {
        failedDiagnostic = { ...diagnostic }
        throw error
      } finally {
        checkpoint('event_capture', scenario)
        await ipc(page, 'ai.stream.abort', { topicId: eventTopic })
        capture = await finishEventProjectionFixture(app)
      }
      checkpoint('event_persistence', scenario)
      await ipc(page, 'ai.agent.session.close_warm', { sessionId: eventSession.id })
      const stored = await data<{ items: Message[] }>(page, 'GET', `/agent-sessions/${eventSession.id}/messages`)
      const assistant = stored.items.filter((message) => message.role === 'assistant').map((message) => message.data)
      checkpoint('event_assertions', scenario)
      const outcome = collectProjectedEventAssertions(scenario, canary, result.chunks, assistant, capture, result.error)
      eventDiagnostic = outcome.diagnostic
      eventOutcomes.push(outcome)
      if (outcome.status === 'passed') eventReceipts.push(outcome.receipt)
    }
    assert(providerConversations.every((conversation) => conversation.diagnostic().failure === null),
      'Controlled projection provider conversation failed')
    providerFailure = false
    const targetName = encodeUarProviderToolName(`${deferredServerId}__read_projection`)
    checkpoint('provider_negative_cases')
    const providerNegatives = await exerciseProviderNegativeCases({ app, page, sourceAgent: `the-boss:${agent.id}`, modelId,
      workspaceId: workspaceEntity.id, serverId: deferredServerId, canary, intendedTargetName: targetName,
      targetEffects: () => deferredMcp.calls.length, fillerDispatches: () => deferredMcp.fillerCalls(),
      conversation: (value) => { toolConversation = value }, setResponseObserver: (value) => { responseObserver = value },
      providerRequestSnapshot: () => providerRequests.map(({ authorized }) => ({ authorized })) })
    checkpoint('native_cases')
    const native = await exerciseNativeDesktopCases({ app, page, profile, sourceAgent: `the-boss:${agent.id}`,
      modelId, workspaceId: workspaceEntity.id, serverId: deferredServerId, targetName, canary,
      targetEffects: () => deferredMcp.calls.length, conversation: (value) => { toolConversation = value } })
    nativeReceipts.push(...native.cases)
    checkpoint('native_restart')
    await closeProjectionHistorySession(app, session.id)
    await app.close()
    launched = await launch(profile, sidecar)
    app = launched.app
    page = launched.page
    const restart = await exerciseNativeRestart({ app, page, profile, modelId, workspaceId: workspaceEntity.id,
      agentId: native.agentId, replay: native.replay, targetName, canary,
      targetEffects: () => deferredMcp.calls.length,
      conversation: (value) => { toolConversation = value } })
    nativeReceipts.push(restart)
    await app.close()
    app = undefined
    checkpoint('native_storage')
    const storage = await exerciseNativeStorageCases({ launch: (profile) => launch(profile, sidecar), baseUrl, canary,
      mcpUrl: deferredMcp.url, targetEffects: () => deferredMcp.calls.length,
      conversation: (value) => { toolConversation = value } })
    nativeReceipts.push(...storage)
    checkpoint('native_post_ack')
    const postAck = await exercisePostAckCases({ launch, gateSidecar, gateArtifactManifest, baseUrl, canary,
      mcpUrl: deferredMcp.url, targetEffects: () => deferredMcp.calls.length,
      conversation: (value) => { toolConversation = value } })
    nativeReceipts.push(...postAck.cases)
    const blocked = native.blocked.filter((entry) => !postAck.resolvedControls.includes(entry.control))
    assert.equal(blocked.length, 0, 'Native acceptance has unresolved controls')
    checkpoint('mcp_sink_assertions')
    const sinks = assertMcpSinkCapture(sinkCapture)
    assert(sinkStatus.authenticated && sinkStatus.deferredAuthenticated)
    assert(sinkStatus.modelInputs.every(projectedModelResultAccepted))
    assert.equal(sinkDiagnostic.configuredCredentialPreserved, true)
    checkpoint('event_assertions')
    assert(eventOutcomes.every((outcome) => outcome.status === 'passed'), 'Event projection assertions failed')
    mcpFixtureDiagnostic = { eager: mcp.diagnostic(), deferred: deferredMcp.diagnostic() }
    checkpoint('receipt_write')
    const receipt = {
      gate: 'BAUAR projection', boundary: 'real Electron IPC, session store, run HTTP, provider and mounted MCP',
      history: history[0], originalHistoryUnchanged: true, providerAuthenticated: true,
      diagnostics, diagnosticFixture: 'controlled HTTP failure/throw at the real run request boundary',
      claims, sinks, profileReceipts, mcpFixtureDiagnostic, externalMcpAuthenticated: true, configuredCredentialUnchanged: true,
      providerConversations: providerConversations.map((conversation) => conversation.diagnostic()),
      toolModelInputs: toolInputs, traceBoundary: 'real OTel spans observed before delegated end; no persisted-trace claim',
      eventReceipts, providerNegativeCases: providerNegatives.cases, newModelInputProjected: true, catalogRegistration: registration[0],
      providerRevisionPairedWithActualPrepare: true,
      nativeAcceptance: { cases: nativeReceipts, blocked, ordinaryCaseCount: native.cases.length + 1 + storage.length,
        instrumentedPostAck: { artifactSha256: postAck.artifactSha256, sourceManifestSha256: postAck.sourceManifestSha256,
          instrumentedArtifact: postAck.instrumentedArtifact, caseCount: postAck.cases.length },
        caseCount: nativeReceipts.length, blockedCount: blocked.length, acceptanceComplete: blocked.length === 0 },
      originalAgentInstructionsUnchanged: true, systemPromptProjected: true,
      excluded: ['shared transport logs', 'sidecar-owned credentials', 'unknown or transformed secrets', 'actual approval lifecycle/effect acceptance belongs to approval gate']
    }
    const evidencePath = process.argv[2]
    if (evidencePath) {
      await mkdir(dirname(evidencePath), { recursive: true })
      await writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`)
    }
    process.stdout.write(`${JSON.stringify(receipt)}\n`)
  } catch (error) {
    failedDiagnostic ??= { ...diagnostic }
    mcpFixtureDiagnostic = { eager: mcp.diagnostic(), deferred: deferredMcp.diagnostic() }
    if (diagnostic.stage === 'mcp_run' && mcpRunContext) mcpRunFailure = mcpRunDiagnostic(mcpRunContext,
      app ? await readCaptureDiagnostic(app).catch(() => null) : null, readFailedTurnDiagnostic(), registrationReason(error))
    throw error
  } finally {
    checkpoint('cleanup')
    const closed = await Promise.allSettled([mcp.close(), deferredMcp.close(), (async () => {
      if (!app) return
      try {
        try { await restoreNativeControls(app) }
        finally { await restoreCapture(app) }
      } finally { await app.close() }
    })()])
    provider.closeAllConnections()
    await new Promise<void>((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()))
    if (closed.some((entry) => entry.status === 'rejected')) throw new Error('Projection resource cleanup failed')
  }
}

void main().catch(() => {
  process.stderr.write(`${JSON.stringify({ projectionFailure: failedDiagnostic ?? diagnostic, providerConversationDiagnostic, profileReceipts, eventReceipts, eventOutcomes, eventDiagnostic, sinkDiagnostic, mcpFixtureDiagnostic, nativeReceipts, nativeCases: nativeCaseProgress(), postAckCases: postAckCaseProgress(), providerNegativeCases: providerNegativeCaseProgress(),
    ...((failedDiagnostic ?? diagnostic).stage.startsWith('registration_') ? { registrationDiagnostic } : {}),
    ...((failedDiagnostic ?? diagnostic).stage === 'history_assertions' ? { historyDiagnostic } : {}),
    ...((failedDiagnostic ?? diagnostic).stage === 'mcp_assertions' ? { mcpDiagnostic } : {}),
    ...((failedDiagnostic ?? diagnostic).stage === 'mcp_run' ? { mcpRunFailure } : {}) })}\n`)
  process.stderr.write('BAUAR projection gate failed; inspect the isolated app evidence without exposing credentials.\n')
  process.exitCode = 1
})
