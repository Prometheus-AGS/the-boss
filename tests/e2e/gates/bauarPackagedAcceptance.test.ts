import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { test } from '@playwright/test'

import { approvalCases, runApprovalClientCase } from './bauarApprovalClientFixture'
import { sendGateVCompletion } from './support/uarExperienceProvider'
import { acceptanceConfig, bundleReadiness, configureAgent, data, invalidRoots, ipc, launchPackaged,
  packagedExecutable, privateProfile, session, writeDesktopReceipt, installExecutionObservation,
  finishExecutionObservation, installFilesystemObservation, finishFilesystemObservation,
  failureEvidence, type PackagedLaunch } from './support/bauarPackagedLaunch'
import { encodeUarProviderToolName } from '../../../src/main/ai/runtime/uar/uarToolNames'
import { closeProjectionHistorySession } from '../../../scripts/gates/bauar-secret-projection-lifecycle'
import { installCapture, finishCapture } from '../../../scripts/gates/bauar-secret-projection-revision'
import { installEventProjectionFixture, finishEventProjectionFixture, assertProjectedEvents } from '../../../scripts/gates/bauar-secret-projection-events'
import { startProjectionMcp, prepareProjectionToolAgent, installMcpSinkCapture, finishMcpSinkCapture,
  assertMcpSinkCapture, projectedModelResultAccepted } from '../../../scripts/gates/bauar-secret-projection-mcp'
import { ProjectionProviderConversation, type ProjectionProviderDriver } from '../../../scripts/gates/bauar-secret-projection-provider'
import { runTurn, registrationErrorDiagnostic } from '../../../scripts/gates/bauar-secret-projection-turn'
import { NativeFaultConversation, exerciseNativeDesktopCases, exerciseNativeRestart, exerciseNativeStorageCases } from '../../../scripts/gates/bauar-native-desktop-cases'
import { exercisePostAckCases } from '../../../scripts/gates/bauar-post-ack-cases'

type Row = { id: string; status: string; executedCount: number; negativeCount: number; observations: Record<string, unknown>;
  evidence?: Array<{ path: string; sha256: string }> }

test('BAUAR packaged local acceptance: D01–D04', async () => {
  test.setTimeout(44 * 60_000)
  const config = await acceptanceConfig()
  const rows: Row[] = []
  const invalidRootEvidence: Array<{ path: string; sha256: string }> = []
  const launches = new Set<PackagedLaunch>()
  const servers = new Set<Server>()
  const mcps: Array<Awaited<ReturnType<typeof startProjectionMcp>>> = []
  let stage = 'D01'
  let cleanupConfirmed = false
  let failure = false
  const launch = async (root: string, sidecar?: string) => {
    const value = await launchPackaged(config, root, sidecar)
    launches.add(value)
    return value
  }
  const stop = async (value: PackagedLaunch) => { await value.stop(); launches.delete(value) }
  const done = (id: string, executedCount: number, negativeCount: number, observations: Record<string, unknown>,
    evidence?: Array<{ path: string; sha256: string }>) =>
    rows.push({ id, status: 'PASS', executedCount, negativeCount, observations, evidence })
  try {
    const negatives = await invalidRoots(config, invalidRootEvidence)
    const root = await privateProfile(config, 'D01')
    const conflict = await privateProfile(config, 'unused-boot-map')
    await mkdir(join(root, 'config'))
    await writeFile(join(root, 'config/boot-config.json'), JSON.stringify({
      'app.user_data_path': { [packagedExecutable(config)]: conflict }
    }))
    const untouched = await readdir(conflict)
    const startup = await launch(root)
    const readiness = await bundleReadiness(startup)
    const seal = JSON.parse(await readFile(config.runtimeSealPath, 'utf8'))
    const executable = seal.packageFiles.find((item: any) => item.path.endsWith('/uar-sidecar'))
    assert.equal(readiness.executable, executable.path)
    assert.equal(readiness.digest, executable.sha256)
    assert(Number.isInteger(readiness.processId) && readiness.processId > 0)
    const command = await promisify(execFile)('/bin/ps', ['-p', String(readiness.processId), '-o', 'comm='])
    assert.equal(command.stdout.trim(), executable.path)
    assert.deepEqual(await readdir(conflict), untouched)
    await stop(startup)
    done('D01', 2, negatives + 1, { packaged: true, binarySourceBundle: true, authenticatedReadiness: true,
      actualExecutableMatched: true, bundledDigestMatched: true, privateRootsObserved: true, bootMapBypassed: true }, invalidRootEvidence)

    stage = 'D02'
    const approvalRoot = await privateProfile(config, 'D02')
    const workspaces: Record<string, string> = {}
    for (const scenario of approvalCases) {
      workspaces[scenario] = await privateProfile(config, `approval-${scenario}`)
    }
    let desktop = await launch(approvalRoot)
    const integration = await ipc(desktop.page, 'prometheus.integration.snapshot', {})
    await ipc(desktop.page, 'prometheus.integration.configure', { updates: [{ feature: 'filesystem',
      expectedRevision: integration.revisions.filesystem,
      value: { ...integration.config.filesystem, enabled: true, allowWrite: true } }], secrets: {} })
    const workspaceIds: Record<string, string> = {}
    for (const scenario of approvalCases) {
      workspaceIds[scenario] = (await data(desktop.page, 'POST', '/agent-workspaces', { path: workspaces[scenario] })).id
    }
    await stop(desktop)
    desktop = await launch(approvalRoot)
    let approvalWorkspace = ''
    const approvalProvider = createServer(async (request, response) => {
      if (request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'projection-model' }] }))
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      sendGateVCompletion(response, body.model, body, approvalWorkspace)
    })
    servers.add(approvalProvider)
    await new Promise<void>(resolve => approvalProvider.listen(0, '127.0.0.1', resolve))
    const approvalAddress = approvalProvider.address()
    assert(approvalAddress && typeof approvalAddress !== 'string')
    const baseUrl = `http://127.0.0.1:${approvalAddress.port}/v1`
    const syntheticKey = `${randomUUID()}-fixture`
    const setup = await configureAgent(desktop.page, baseUrl, syntheticKey, await privateProfile(config, 'registration'))
    const registrationSession = await session(desktop.page, setup.agentId, setup.workspaceId)
    assert.equal((await runTurn(desktop.page, `agent-session:${registrationSession}`, setup.modelId)).error, '')
    await closeProjectionHistorySession(desktop.app, registrationSession, desktop.mainDirectory)
    const configured = await ipc(desktop.page, 'prometheus.integration.snapshot', {})
    let effects = 0
    for (const scenario of approvalCases) {
      approvalWorkspace = workspaces[scenario]
      const filesystem = configured.servers.find((item: any) => item.name.startsWith('Rust Filesystem') && item.workspace === approvalWorkspace)
      assert(filesystem, 'Managed filesystem approval receiver is unavailable')
      const agent = await prepareProjectionToolAgent(desktop.page, `the-boss:${setup.agentId}`, setup.modelId, filesystem.id, 'eager')
      const id = await session(desktop.page, agent.id, workspaceIds[scenario])
      await installFilesystemObservation(desktop.app)
      await runApprovalClientCase(desktop.app, desktop.page, { scenario, topicId: `agent-session:${id}`,
        bossModelId: setup.modelId, agentId: agent.id, workspaceId: workspaceIds[scenario],
        effectPath: join(approvalWorkspace, 'gate-v-approved.txt') })
      const observed = await finishFilesystemObservation(desktop.app)
      assert.deepEqual(observed, { calls: scenario === 'approve' || scenario === 'reconnect' ? 1 : 0, incomplete: false })
      await closeProjectionHistorySession(desktop.app, id, desktop.mainDirectory)
      if (scenario === 'approve' || scenario === 'reconnect') {
        assert((await readFile(join(approvalWorkspace, 'gate-v-approved.txt'), 'utf8')).includes('approved filesystem operation'))
        effects++
      }
    }
    assert.equal(effects, 2)
    await stop(desktop)
    done('D02', approvalCases.length, 7, { exactCutover: true, foreignAndConsumedRefused: true,
      approvedEffects: effects, reconnectOnce: true, unavailableHeadlessDenied: true, malformedDecisions: 0 })

    stage = 'D03'
    const canary = `${randomUUID()}-projection-credential`
    const eager = await startProjectionMcp(canary)
    const deferred = await startProjectionMcp(canary, 'deferred')
    mcps.push(eager, deferred)
    let conversation: ProjectionProviderDriver | NativeFaultConversation | undefined
    let providerFailure = false
    const providerInputs: Array<{ authorized: boolean; canaryAbsent: boolean }> = []
    const modelResults: Array<{ mode: string; accepted: boolean }> = []
    const provider = createServer(async (request, response) => {
      if (request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'projection-model' }] }))
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      providerInputs.push({ authorized: request.headers.authorization === `Bearer ${canary}`,
        canaryAbsent: !JSON.stringify(body.messages).includes(canary) })
      if (providerFailure) {
        response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Controlled provider failure' } }))
        return
      }
      const step = conversation?.next(body)
      if (step?.kind === 'failure') {
        response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: step.category } }))
        return
      }
      const frame = (delta: unknown, reason: string | null) => `data: ${JSON.stringify({ id: 'packaged-fixture',
        object: 'chat.completion.chunk', created: 1, model: body.model,
        choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      if (step?.kind === 'call') {
        response.end(frame({ role: 'assistant', tool_calls: [{ index: 0, id: step.call.id, type: 'function',
          function: { name: step.call.name, arguments: step.call.arguments } }] }, null) + frame({}, 'tool_calls') + 'data: [DONE]\n\n')
        return
      }
      if (step?.kind === 'complete' && conversation instanceof ProjectionProviderConversation) {
        modelResults.push({ mode: conversation.mode, accepted: projectedModelResultAccepted({ ...step, mode: conversation.mode }) })
      }
      for (const delta of [{ role: 'assistant', reasoning_content: 'Benign reasoning ' }, { reasoning_content: 'marker.' },
        { content: 'Benign projection ' }, { content: 'gate marker.' }]) {
        response.write(frame(delta, null))
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      response.end(frame({}, 'stop') + 'data: [DONE]\n\n')
    })
    servers.add(provider)
    await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
    const address = provider.address()
    assert(address && typeof address !== 'string')
    const modelUrl = `http://127.0.0.1:${address.port}/v1`
    const profile = await privateProfile(config, 'D03-D04')
    desktop = await launch(profile)
    const agentSetup = await configureAgent(desktop.page, modelUrl, canary, await privateProfile(config, 'tool-workspace'))
    const initial = await session(desktop.page, agentSetup.agentId, agentSetup.workspaceId)
    await installCapture(desktop.app, canary, 'none')
    assert.equal((await runTurn(desktop.page, `agent-session:${initial}`, agentSetup.modelId)).error, '')
    const registration = await finishCapture(desktop.app)
    assert(registration.length === 1 && registration[0].inlineArtifactOnly && registration[0].systemProjected)
    await closeProjectionHistorySession(desktop.app, initial, desktop.mainDirectory)
    const initialMessages = await data(desktop.page, 'GET', `/agent-sessions/${initial}/messages`)
    const seed = initialMessages.items.find((message: any) => message.role === 'assistant')
    assert(seed)
    const seededData = { ...seed.data, parts: [{ type: 'text', text: `Legacy ordinary content ${canary}` },
      { type: 'dynamic-tool', toolName: 'projection_history_tool', toolCallId: 'projection-history-call',
        state: 'output-available', input: { priorInput: canary }, output: { priorOutput: canary } }] }
    await data(desktop.page, 'PATCH', `/agent-sessions/${initial}/messages/${seed.id}`, { data: seededData })
    await installCapture(desktop.app, canary, 'none', agentSetup.agentId)
    const historical = await runTurn(desktop.page, `agent-session:${initial}`, agentSetup.modelId,
      { text: `Reply briefly. Deliberate known-value echo: ${canary}` })
    assert.equal(historical.error, '')
    const history = await finishCapture(desktop.app)
    assert.equal(history.length, 1)
    assert(history[0].historyPresent && !history[0].historyContainsCanary && history[0].historyContainsReplacement
      && history[0].historyToolIdentityPreserved && !history[0].inputContainsCanary && history[0].inputContainsReplacement)
    assert.deepEqual((await data(desktop.page, 'GET', `/agent-sessions/${initial}/messages/${seed.id}`)).data, seededData)
    await closeProjectionHistorySession(desktop.app, initial, desktop.mainDirectory)
    await installMcpSinkCapture(desktop.app, canary)
    let deferredServer = ''
    let deferredAgent = ''
    for (const [catalogProfile, mcp] of [['eager', eager], ['deferred', deferred]] as const) {
      const server = await data(desktop.page, 'POST', '/mcp-servers', { name: `Projection external ${catalogProfile} fixture`,
        type: 'streamableHttp', baseUrl: mcp.url, headers: { Authorization: `Bearer ${canary}` }, isActive: true, isTrusted: true })
      const targetName = encodeUarProviderToolName(`${server.id}__read_projection`)
      const toolAgent = await prepareProjectionToolAgent(desktop.page, `the-boss:${agentSetup.agentId}`, agentSetup.modelId, server.id, catalogProfile)
      if (catalogProfile === 'deferred') { deferredServer = server.id; deferredAgent = toolAgent.id }
      for (const mode of ['success', 'isError', 'error'] as const) {
        const id = await session(desktop.page, toolAgent.id, agentSetup.workspaceId)
        conversation = new ProjectionProviderConversation(mode, targetName, canary, catalogProfile, server.id)
        const before = mcp.calls.length
        await installCapture(desktop.app, canary, 'none', undefined, { serverId: server.id, providerName: targetName })
        const result = await runTurn(desktop.page, `agent-session:${id}`, agentSetup.modelId, { approve: true })
        const captured = await finishCapture(desktop.app)
        assert.equal(result.error, '')
        assert.equal(mcp.calls.length - before, 1)
        assert.equal(result.approvals.requests.length, catalogProfile === 'eager' ? 1 : 2)
        assert.equal(new Set(result.approvals.accepted).size, catalogProfile === 'eager' ? 1 : 2)
        assert.equal(captured.length, 1)
        assert.equal(captured[0].preparedInvocations, catalogProfile === 'eager' ? 1 : 2)
        assert.deepEqual(captured[0].toolSources, { discovery: catalogProfile === 'eager' ? 0 : 1, target: 1, other: 0,
          discoveryRevisionsMatched: catalogProfile === 'deferred', targetRevisionsMatched: true })
        assert.equal(conversation.diagnostic().failure, null)
        assert.equal(conversation.diagnostic().discoveryProposals, catalogProfile === 'eager' ? 0 : 1)
        await closeProjectionHistorySession(desktop.app, id, desktop.mainDirectory)
      }
    }
    assert.equal(deferred.fillerCalls(), 0)
    const sinkCapture = await finishMcpSinkCapture(desktop.app, () => undefined)
    const sinks = assertMcpSinkCapture(sinkCapture)
    const native = await exerciseNativeDesktopCases({ ...desktop, profile, sourceAgent: `the-boss:${agentSetup.agentId}`,
      modelId: agentSetup.modelId, workspaceId: agentSetup.workspaceId, serverId: deferredServer,
      targetName: encodeUarProviderToolName(`${deferredServer}__read_projection`), canary,
      targetEffects: () => deferred.calls.length, conversation: value => { conversation = value } })
    await stop(desktop)
    desktop = await launch(profile)
    await exerciseNativeRestart({ ...desktop, profile, agentId: native.agentId, workspaceId: agentSetup.workspaceId,
      modelId: agentSetup.modelId, replay: native.replay, targetName: encodeUarProviderToolName(`${deferredServer}__read_projection`),
      canary, targetEffects: () => deferred.calls.length, conversation: value => { conversation = value } })
    await stop(desktop)
    const supportingProfiles = new Map<string, string>()
    const privateLaunch = async (name: string, sidecar?: string) => {
      const root = supportingProfiles.get(name) ?? await privateProfile(config, name)
      supportingProfiles.set(name, root)
      const value = await launch(root, sidecar)
      return value
    }
    const storageProfiles = new Map<string, string>()
    const storage = await exerciseNativeStorageCases({ launch: async name => {
      const root = storageProfiles.get(name) ?? await privateProfile(config, name)
      storageProfiles.set(name, root)
      return launch(root)
    }, baseUrl: modelUrl, canary, mcpUrl: deferred.url, targetEffects: () => deferred.calls.length,
      conversation: value => { conversation = value } })
    const postAck = await exercisePostAckCases({ launch: privateLaunch,
      gateSidecar: process.env.THE_BOSS_UAR_POST_ACK_SIDECAR_PATH!,
      gateArtifactManifest: process.env.THE_BOSS_UAR_POST_ACK_MANIFEST_PATH!, baseUrl: modelUrl, canary,
      mcpUrl: deferred.url, targetEffects: () => deferred.calls.length, conversation: value => { conversation = value } })
    assert.equal(storage.length, 2)
    done('D03', 6 + native.cases.length + 1 + storage.length + postAck.cases.length, 9,
      { eagerAdmissions: 1, deferredAdmissions: 2, deferredFillers: 32, fillerEffects: 0,
        nativeClaimsBound: true, noOldAuthorityAfterRestart: true, storageFaults: storage.length,
        postAckSupportingCases: postAck.cases.length, supportingProfileSeparate: true })

    stage = 'D04'
    desktop = await launch(profile)
    conversation = undefined
    let eventCases = 0
    for (const scenario of ['split', 'partial', 'reconnect', 'interrupted', 'snapshot', 'run-error', 'approval', 'approval-error'] as const) {
      const approval = scenario.startsWith('approval') || scenario === 'reconnect'
      const id = await session(desktop.page, approval ? deferredAgent : agentSetup.agentId, agentSetup.workspaceId)
      conversation = approval ? new ProjectionProviderConversation('success', encodeUarProviderToolName(`${deferredServer}__read_projection`), canary) : undefined
      providerFailure = scenario === 'run-error'
      const beforeEffects = deferred.calls.length
      if (scenario === 'reconnect') await installExecutionObservation(desktop.app)
      await installEventProjectionFixture(desktop.app, canary, scenario)
      const result = await runTurn(desktop.page, `agent-session:${id}`, agentSetup.modelId, { approve: approval })
      const capture = await finishEventProjectionFixture(desktop.app)
      if (scenario === 'reconnect') {
        const execution = await finishExecutionObservation(desktop.app)
        assert.deepEqual(execution, { admissions: 1, streams: 2, oneExecution: true, cursorResume: true })
        assert.equal(deferred.calls.length - beforeEffects, 1)
      }
      await closeProjectionHistorySession(desktop.app, id, desktop.mainDirectory)
      const messages = await data(desktop.page, 'GET', `/agent-sessions/${id}/messages`)
      const assistant = messages.items.filter((item: any) => item.role === 'assistant').map((item: any) => item.data)
      assert(assistant.length > 0)
      if (scenario === 'approval-error' || scenario === 'run-error') assert(result.error.includes('<redacted>'))
      else if (scenario !== 'interrupted') assert.equal(result.error, '')
      assertProjectedEvents(scenario, canary, result.chunks, assistant, capture)
      eventCases++
    }
    providerFailure = false
    conversation = undefined
    for (const fault of ['http', 'throw'] as const) {
      const id = await session(desktop.page, agentSetup.agentId, agentSetup.workspaceId)
      await installCapture(desktop.app, canary, fault)
      const result = await runTurn(desktop.page, `agent-session:${id}`, agentSetup.modelId)
      await finishCapture(desktop.app)
      assert(result.error.includes('<redacted>'))
      assert(!result.error.includes(canary) && !result.chunks.includes(canary))
      await closeProjectionHistorySession(desktop.app, id, desktop.mainDirectory)
    }
    assert(providerInputs.length > 0 && providerInputs.every(item => item.authorized && item.canaryAbsent))
    assert(modelResults.length >= 6 && modelResults.every(item => item.accepted))
    await stop(desktop)
    const logFiles = await readdir(join(profile, 'logs'), { recursive: true, withFileTypes: true })
    let checkedLogs = 0
    for (const entry of logFiles) if (entry.isFile()) {
      const bytes = await readFile(join(entry.parentPath, entry.name))
      assert(!bytes.includes(Buffer.from(canary)), 'Known credential appeared in ordinary log')
      checkedLogs++
    }
    assert(checkedLogs > 0)
    done('D04', eventCases + 2 + 6, 10, { streamCases: eventCases, providerInputs: providerInputs.length,
      modelResults: modelResults.length, knownCredentialAbsent: true, logsChecked: checkedLogs,
      ordinaryEventPersistenceProjected: true, legacyHistoryModelProjection: true, legacySourcePreserved: true,
      sinkLogs: sinks.logs, sinkSpans: sinks.spans, noCancellationUndoClaim: true })
  } catch (error) {
    failure = true
    const sourceLine = error instanceof Error ? /bauarPackagedAcceptance\.test\.ts:(\d+):\d+/.exec(error.stack ?? '')?.[1] : undefined
    const evidence = await failureEvidence(stage, registrationErrorDiagnostic(error), sourceLine ? Number(sourceLine) : undefined)
    rows.push({ id: stage, status: 'FAIL', executedCount: 0, negativeCount: 0,
      observations: { scenarioFailed: true, diagnosticRecorded: true, rawDiagnosticRetained: false },
      evidence: [...(stage === 'D01' ? invalidRootEvidence : []), evidence] })
  } finally {
    const results = await Promise.allSettled([...launches].map(value => value.stop()))
    const peerResults = await Promise.allSettled([...mcps.map(peer => peer.close()), ...[...servers].map(server => {
      server.closeAllConnections()
      return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    })])
    cleanupConfirmed = results.every(value => value.status === 'fulfilled') && peerResults.every(value => value.status === 'fulfilled')
    await writeDesktopReceipt(config, rows, cleanupConfirmed)
  }
  assert(!failure && cleanupConfirmed, 'Packaged BAUAR acceptance did not complete; see finite component receipt')
})
