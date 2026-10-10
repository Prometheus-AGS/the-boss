import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import { expect, type ElectronApplication, type Page } from '@playwright/test'

import { encodeUarProviderToolName } from '../../src/main/ai/runtime/uar/uarToolNames'
import { installNativeControls, nativeObservation, postAckControl, restoreNativeControls } from './bauar-native-admission-controls'
import { NativeFaultConversation } from './bauar-native-desktop-cases'
import { closeProjectionHistorySession } from './bauar-secret-projection-lifecycle'
import { prepareProjectionToolAgent } from './bauar-secret-projection-mcp'
import type { ProjectionProviderConversation } from './bauar-secret-projection-provider'
import { runTurn, registrationErrorDiagnostic, readFailedTurnDiagnostic } from './bauar-secret-projection-turn'
import { installCapture, readCaptureDiagnostic, restoreCapture } from './bauar-secret-projection-revision'

type Stage = 'artifact_binding' | 'bootstrap' | 'configuration' | 'registration' | 'arm' | 'checkpoint' |
  'cancel' | 'release' | 'final' | 'outcomes' | 'cleanup'
type CaseProgress = { category: string; status: 'unrun' | 'running' | 'passed' | 'failed'; stage: Stage;
  cleanupConfirmed: boolean; evidence?: Record<string, unknown>; registration?: Record<string, unknown>;
  failure?: ReturnType<typeof registrationErrorDiagnostic> }
const progress: CaseProgress[] = ['post_ack_positive_calibration', 'post_ack_pre_dispatch_cancellation']
  .map((category) => ({ category, status: 'unrun', stage: 'artifact_binding', cleanupConfirmed: false }))
export function postAckCaseProgress(): CaseProgress[] { return structuredClone(progress) }

/** Source-defined app errors only; retain no raw registration message or substituted identifiers. */
function registrationPretransportDiagnostic(message: string) {
  const exact = [
    ['Configured UAR sidecar payload is incomplete or unavailable', 'configured_payload_unavailable'],
    ['Packaged UAR sidecar payload is incomplete or unavailable', 'packaged_payload_unavailable'],
    ['Universal Agent Runtime is disabled in this release', 'uar_feature_disabled'],
    ['prometheus.error.secretDecryption', 'managed_secret_decryption'],
    ['prometheus.error.secretStorage', 'managed_secret_storage'],
    ['Session writes are paused', 'session_writes_paused'],
    ['Agent runtime connection unavailable', 'runtime_connection_unavailable'],
    ['providerId cannot be empty', 'model_provider_id_empty'],
    ['modelId cannot be empty', 'model_id_empty']
  ] as const
  const prefixes = [
    ['Unsupported agent runtime type: ', 'runtime_type_unsupported'],
    ['Unsupported workspace type: ', 'workspace_type_unsupported'],
    ['System workspace path is outside the managed workspace root: ', 'workspace_outside_managed_root'],
    ['Agent storage path escapes its root: ', 'agent_storage_escapes_root'],
    ['Agent storage root must be a real directory: ', 'agent_storage_root_invalid'],
    ['Agent storage path contains a symbolic link: ', 'agent_storage_symlink'],
    ['Agent storage path parent is not a directory: ', 'agent_storage_parent_invalid'],
    ['Agent storage path resolves outside its root: ', 'agent_storage_resolves_outside_root'],
    ['Agent storage directory must be a real directory: ', 'agent_storage_directory_invalid'],
    ['Invalid agent id for data directory: ', 'agent_data_id_invalid'],
    ['Invalid UniqueModelId format: ', 'model_identity_invalid']
  ] as const
  const exactMatches = exact.filter(([literal]) => message === literal).map(([, category]) => category)
  const prefixMatches = prefixes.filter(([prefix]) => message.startsWith(prefix)).map(([, category]) => category)
  return { category: exactMatches[0] ?? prefixMatches[0] ?? (message ? 'unclassified' : 'none'),
    exactMatches, prefixMatches, messageLength: message.length,
    messageSha256: message ? createHash('sha256').update(message).digest('hex') : null }
}

const expectedFeatures = ['a2a-transport', 'admin-ui', 'api-docs', 'bauar-native-admission-gate', 'cedar-governance',
  'document-intelligence', 'local-models', 'minimal', 'response-quality', 'server', 'server-full',
  'surreal-backend', 'telemetry', 'wasm-runtime']
type ArtifactManifest = { schemaVersion: number; artifactPath: string; artifactSha256: string;
  sourceManifestPath: string; sourceManifestSha256: string; features: string[] }
type Correlation = { version: 1; controlId: string; correlationDigest: string }
type FinalSnapshot = Correlation & { phase: 'final'; checkpointOutcome: string; bodyEntries: number;
  runCancelled: boolean; runFailed: boolean; observerError: string | null }

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function verifyArtifact(path: string, manifestPath: string): Promise<ArtifactManifest> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ArtifactManifest
  assert.equal(manifest.schemaVersion, 1)
  assert(isAbsolute(manifest.artifactPath) && isAbsolute(manifest.sourceManifestPath))
  assert.match(manifest.artifactSha256, /^[a-f0-9]{64}$/)
  assert.match(manifest.sourceManifestSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual([...manifest.features].sort(), expectedFeatures)
  assert.equal(await realpath(path), await realpath(manifest.artifactPath))
  assert.equal(await fileHash(path), manifest.artifactSha256)
  assert.equal(await fileHash(manifest.sourceManifestPath), manifest.sourceManifestSha256)
  return manifest
}

async function controlDocument(directory: string, name: 'arm' | 'reached' | 'final'): Promise<Record<string, unknown> | undefined> {
  const path = join(directory, `${name}.json`)
  let metadata
  try { metadata = await lstat(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  assert(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size <= 4096)
  assert.equal(await realpath(directory), directory)
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const buffer = Buffer.alloc(4097)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    assert(bytesRead > 0 && bytesRead <= 4096)
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))
  } finally { await handle.close() }
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort())
}

async function release(directory: string, correlation: Correlation): Promise<void> {
  assert.equal(await realpath(directory), directory)
  const pending = join(directory, 'release.json.pending')
  await writeFile(pending, JSON.stringify(correlation), { flag: 'wx' })
  await rename(pending, join(directory, 'release.json'))
}

async function data<T>(page: Page, path: string, body: unknown): Promise<T> {
  return page.evaluate(async ({ path, body }) => {
    const response = await window.api.dataApi.request({ id: crypto.randomUUID(), method: 'POST', path, body }) as any
    if (response.error) throw new Error('Post-ack fixture configuration failed')
    return response.data
  }, { path, body })
}

async function setup(page: Page, workspace: string, input: { baseUrl: string; canary: string; mcpUrl: string }) {
  const providerId = `post-ack-${randomUUID()}`
  const modelId = `${providerId}::projection-model`
  await data(page, '/providers', { providerId, name: 'Post-ack calibration fixture',
    endpointConfigs: { 'openai-chat-completions': { baseUrl: input.baseUrl } }, defaultChatEndpoint: 'openai-chat-completions',
    apiKeys: [{ id: randomUUID(), key: input.canary, label: 'Synthetic fixture credential', isEnabled: true }] })
  await data(page, '/models', [{ providerId, modelId: 'projection-model', name: 'Post-ack model', capabilities: ['function-call'],
    endpointTypes: ['openai-chat-completions'], supportsStreaming: true, contextWindow: 128_000, maxOutputTokens: 1024 }])
  const created = await page.evaluate(async ({ modelId, canary }) => window.api.ipcApi.request('ai.agent.create', {
    type: 'uar', name: 'Post-ack fixture', model: modelId, mcps: [], instructions: `Reply briefly. Known system value: ${canary}`,
    configuration: { permission_mode: 'plan', uar_model_assignment: { source: 'boss' } }
  }), { modelId, canary: input.canary }) as any
  assert.equal(created.ok, true)
  const work = await data<{ id: string }>(page, '/agent-workspaces', { path: workspace })
  const mcp = await data<{ id: string }>(page, '/mcp-servers', { name: 'Post-ack selected MCP fixture', type: 'streamableHttp',
    baseUrl: input.mcpUrl, headers: { Authorization: `Bearer ${input.canary}` }, isActive: true, isTrusted: true })
  return { sourceAgent: `the-boss:${created.data.id}`, sourceAgentId: created.data.id as string,
    workspaceId: work.id, serverId: mcp.id, modelId }
}

async function createSession(page: Page, agentId: string, workspaceId: string): Promise<string> {
  const session = await data<{ id: string }>(page, '/agent-sessions', { agentId, name: 'Post-ack native case',
    workspace: { type: 'user', workspaceId } })
  return session.id
}

export async function exercisePostAckCases(input: {
  launch(profile: string, sidecar: string): Promise<{ app: ElectronApplication; page: Page; mainDirectory?: string }>
  gateSidecar: string; gateArtifactManifest: string; baseUrl: string; canary: string; mcpUrl: string
  targetEffects(): number
  conversation(value: NativeFaultConversation | ProjectionProviderConversation | undefined): void
}) {
  let binding: ArtifactManifest | undefined
  for (const [index, cancel] of [false, true].entries()) {
    const receipt = progress[index]
    receipt.status = 'running'
    let app: ElectronApplication | undefined
    let sessionId: string | undefined
    let running: Promise<Awaited<ReturnType<typeof runTurn>>> | undefined
    let controls = false
    let mainDirectory: string | undefined
    let registrationCapture = false
    let released = false
    let correlation: Correlation | undefined
    let directory: string | undefined
    try {
      receipt.stage = 'artifact_binding'
      const artifact = await verifyArtifact(input.gateSidecar, input.gateArtifactManifest)
      if (binding) assert.deepEqual(artifact, binding)
      binding = artifact
      const profile = `BAUAR-PostAck-${randomUUID()}`
      const workspace = await realpath(await mkdtemp(join(tmpdir(), 'bauar-post-ack-')))
      receipt.stage = 'bootstrap'
      let launched = await input.launch(profile, input.gateSidecar)
      app = launched.app
      mainDirectory = launched.mainDirectory
      await launched.page.evaluate(() => window.api.preference.setMultiple({ 'app.language': 'en-US',
        'app.onboarding.provider_setup.status': 'skipped', 'app.privacy.data_collection.enabled': false,
        'app.developer_mode.enabled': true }))
      await app.close()
      app = undefined
      assert.deepEqual(await verifyArtifact(input.gateSidecar, input.gateArtifactManifest), binding)
      launched = await input.launch(profile, input.gateSidecar)
      app = launched.app
      mainDirectory = launched.mainDirectory
      const page = launched.page
      receipt.stage = 'configuration'
      const configuration = await setup(page, workspace, input)
      input.conversation(undefined)
      receipt.stage = 'registration'
      receipt.registration = { operation: 'session_create' }
      sessionId = await createSession(page, configuration.sourceAgentId, configuration.workspaceId)
      receipt.registration.operation = 'capture_install'
      await installCapture(app, input.canary, 'none')
      registrationCapture = true
      receipt.registration.operation = 'run_turn'
      const registration = await runTurn(page, `agent-session:${sessionId}`, configuration.modelId)
      receipt.registration.turn = registration.diagnostic
      receipt.registration.streamError = registrationErrorDiagnostic(registration.error)
      receipt.registration.pretransportError = registrationPretransportDiagnostic(registration.error)
      receipt.registration.capture = await readCaptureDiagnostic(app)
      receipt.registration.operation = 'stream_assertion'
      assert.equal(registration.error, '')
      await restoreCapture(app)
      registrationCapture = false
      receipt.registration.operation = 'warm_session_close'
      await closeProjectionHistorySession(app, sessionId, mainDirectory)
      receipt.registration.operation = 'tool_agent_setup'
      const agent = await prepareProjectionToolAgent(page, configuration.sourceAgent, configuration.modelId, configuration.serverId, 'deferred')
      receipt.registration.operation = 'tool_session_create'
      sessionId = await createSession(page, agent.id, configuration.workspaceId)
      const conversation = new NativeFaultConversation(encodeUarProviderToolName(`${configuration.serverId}__read_projection`))
      input.conversation(conversation)
      receipt.stage = 'arm'
      directory = join(workspace, '.bauar-post-ack-gate')
      await mkdir(directory)
      assert.equal(await realpath(directory), directory)
      const controlId = randomUUID()
      const deadlineUnixMs = Date.now() + 120_000
      await installNativeControls(app, profile, 'observe', [], { workspace, controlId, deadlineUnixMs }, mainDirectory)
      controls = true
      const before = input.targetEffects()
      running = runTurn(page, `agent-session:${sessionId}`, configuration.modelId, { approve: true })
      void running.catch(() => undefined)
      receipt.stage = 'checkpoint'
      await expect.poll(async () => Boolean(await controlDocument(directory!, 'reached')), { timeout: 60_000 }).toBe(true)
      const armed = await postAckControl(app, 'read')
      assert.equal(armed.armed, true)
      assert.equal(armed.finalizationFailed, false)
      assert.equal(armed.streamObserved, true)
      assert.match(armed.correlationDigest ?? '', /^[a-f0-9]{64}$/)
      correlation = { version: 1, controlId, correlationDigest: armed.correlationDigest! }
      const arm = await controlDocument(directory, 'arm')
      assert.deepEqual(arm, { ...correlation, purpose: 'bauar-native-post-ack', executionKind: 'runtime_native',
        toolName: 'search_tools', deadlineUnixMs })
      const reached = await controlDocument(directory, 'reached')
      assert.deepEqual(reached, { ...correlation, phase: 'post_ack_pre_guard', bodyEntries: 0 })
      const consumed = await nativeObservation(app)
      assert.equal(consumed.observationFailed, false)
      assert.equal(consumed.preparations, 1)
      assert.equal(consumed.consumes, 1)
      assert.equal(consumed.durableConsumes, 1)
      let cancelAcknowledged = false
      if (cancel) {
        receipt.stage = 'cancel'
        cancelAcknowledged = (await postAckControl(app, 'cancel')).cancelAcknowledged
        assert.equal(cancelAcknowledged, true)
      }
      receipt.stage = 'release'
      await release(directory, correlation)
      released = true
      receipt.stage = 'final'
      await expect.poll(async () => Boolean(await controlDocument(directory!, 'final')), { timeout: 60_000 }).toBe(true)
      const final = await controlDocument(directory, 'final') as FinalSnapshot
      exactKeys(final, ['version', 'controlId', 'correlationDigest', 'phase', 'checkpointOutcome', 'bodyEntries',
        'runCancelled', 'runFailed', 'observerError'])
      assert.equal(final.version, correlation.version)
      assert.equal(final.controlId, correlation.controlId)
      assert.equal(final.correlationDigest, correlation.correlationDigest)
      assert.equal(final.phase, 'final')
      assert.equal(final.observerError, null)
      assert.equal(final.bodyEntries, cancel ? 0 : 1)
      assert.equal(final.runCancelled, cancel)
      assert.equal(final.runFailed, false)
      assert((cancel ? ['dropped_while_held', 'released_then_guard_observed'] : ['released_then_guard_allowed']).includes(final.checkpointOutcome))
      const turn = await running
      receipt.stage = 'outcomes'
      await expect.poll(async () => (await postAckControl(app!, 'terminal')).runStatus, { timeout: 30_000 })
        .toBe(cancel ? 'cancelled' : 'done')
      await closeProjectionHistorySession(app, sessionId, mainDirectory)
      const completedControl = await postAckControl(app, 'read')
      assert.equal(completedControl.finalizationFailed, false)
      assert.equal(completedControl.streamObserved, true)
      const observed = await nativeObservation(app, true)
      assert.equal(observed.observationFailed, false)
      assert.equal(observed.preparations, 1)
      assert.equal(observed.consumes, 1)
      assert.equal(observed.durableConsumes, 1)
      assert.equal(observed.finishRequests, cancel ? 0 : 1)
      assert.equal(observed.successfulFinishRequests, cancel ? 0 : 1)
      assert.equal(observed.terminalFailures, 0)
      assert.equal(input.targetEffects() - before, 0)
      assert.equal(turn.approvals.requests.length, 1)
      assert.equal(turn.approvals.accepted.length, 1)
      const provider = conversation.diagnostic()
      assert.equal(provider.failure, null)
      assert.equal(provider.requestCount, cancel ? 1 : 2)
      assert.equal(provider.successfulResult, !cancel)
      if (cancel) {
        assert(observed.runtimeStates.includes('outcome_unknown'))
        assert(!observed.runtimeStates.some((state) => ['succeeded', 'failed'].includes(state)))
        assert.deepEqual(observed.hostStates, ['outcome-unknown'])
      } else {
        assert.equal(turn.error, '')
        assert(observed.runtimeStates.includes('succeeded'))
        assert.deepEqual(observed.hostStates, ['succeeded'])
      }
      receipt.evidence = { artifactSha256: artifact.artifactSha256, sourceManifestSha256: artifact.sourceManifestSha256,
        instrumentedArtifact: true, sameDigest: true, checkpointReached: true, cancelAcknowledged,
        bodyEntries: final.bodyEntries, checkpointOutcome: final.checkpointOutcome, runCancelled: final.runCancelled,
        runFailed: final.runFailed, observerError: null, finalizationFailureObserved: false,
        observed, provider, targetEffects: 0, noReplay: true }
    } catch (error) {
      receipt.status = 'failed'
      receipt.failure = registrationErrorDiagnostic(error)
      if (receipt.stage === 'registration' && receipt.registration) {
        if (receipt.registration.operation === 'run_turn') receipt.registration.failedTurn = readFailedTurnDiagnostic()
        if (app && registrationCapture) {
          try { receipt.registration.capture = await readCaptureDiagnostic(app) }
          catch { receipt.registration.captureReadFailed = true }
        }
      }
      throw error
    }
    finally {
      input.conversation(undefined)
      try {
        if (app) {
          try {
            if (controls) {
              await postAckControl(app, 'cancel').catch(() => undefined)
              if (!released && directory) {
                const armed = await postAckControl(app, 'read')
                const arm = await controlDocument(directory, 'arm')
                if (armed.armed && armed.correlationDigest && arm) {
                  await release(directory, { version: 1, controlId: String(arm.controlId), correlationDigest: armed.correlationDigest })
                }
              }
            }
            if (sessionId) await closeProjectionHistorySession(app, sessionId, mainDirectory)
            await running?.catch(() => undefined)
          } finally {
            try {
              try { if (controls) await restoreNativeControls(app) }
              finally { if (registrationCapture) await restoreCapture(app) }
            }
            finally { await app.close() }
          }
        }
        receipt.cleanupConfirmed = true
      } catch (error) { receipt.status = 'failed'; receipt.stage = 'cleanup'; throw error }
    }
    receipt.status = 'passed'
  }
  assert(binding)
  return { cases: postAckCaseProgress(), resolvedControls: ['FC-POSTACK-CANCEL'], instrumentedArtifact: true,
    artifactSha256: binding.artifactSha256, sourceManifestSha256: binding.sourceManifestSha256 }
}
