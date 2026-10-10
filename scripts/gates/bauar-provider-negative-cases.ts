import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

import { expect, type ElectronApplication, type Page } from '@playwright/test'

import { encodeUarProviderToolName } from '../../src/main/ai/runtime/uar/uarToolNames'
import { closeProjectionHistorySession } from './bauar-secret-projection-lifecycle'
import { prepareProjectionToolAgent } from './bauar-secret-projection-mcp'
import { ProjectionProviderConversation, type ProjectionProviderDriver } from './bauar-secret-projection-provider'
import { installCapture, finishCapture, readCaptureDiagnostic, restoreCapture } from './bauar-secret-projection-revision'
import { runTurn } from './bauar-secret-projection-turn'

const categories = ['unadvertised_target_after_discovery', 'unrelated_tool_call_id', 'missing_tool_call_id',
  'missing_tool_result', 'filler_dispatch_refused'] as const
type Category = typeof categories[number]
type Stage = 'configuration' | 'run' | 'inspection' | 'assertions' | 'cleanup'
type Receipt = { version: 1; category: Category; boundary: 'provider_input_fixture' | 'receiving_mcp_refusal';
  status: 'unrun' | 'running' | 'passed' | 'failed'; stage: Stage; cleanupConfirmed: boolean;
  evidence?: Record<string, unknown> }
const progress: Receipt[] = categories.map((category) => ({ version: 1, category,
  boundary: category === 'filler_dispatch_refused' ? 'receiving_mcp_refusal' : 'provider_input_fixture',
  status: 'unrun', stage: 'configuration', cleanupConfirmed: false }))
export function providerNegativeCaseProgress(): Receipt[] { return structuredClone(progress) }

/** Mutations affect only one copied provider input; UAR's history/catalog remain untouched. */
class NegativeConversation implements ProjectionProviderDriver {
  private readonly validator: ProjectionProviderConversation
  private call?: { id: string; name: string; arguments: string }
  private requests = 0
  private originalMatched = false
  private mutations = 0
  private failure: string | null = null
  private preconditionFailed = false
  private resultProvenance = false
  private originalTargetAdvertised = false
  private mutatedTargetAdvertised: boolean | null = null
  private mutatedResultCount: number | null = null
  private mutatedIdPresent: boolean | null = null
  constructor(private readonly category: Category, private readonly target: string, canary: string,
    private readonly filler: string, private readonly serverId: string, private readonly authenticated: () => boolean) {
    this.validator = new ProjectionProviderConversation('success', target, canary, 'deferred', serverId)
  }
  next(value: unknown): ReturnType<ProjectionProviderDriver['next']> {
    this.requests += 1
    try {
      assert.equal(this.authenticated(), true)
      const body = value as any
      assert(body && Array.isArray(body.messages) && Array.isArray(body.tools))
      const names = body.tools.map((entry: any) => entry?.function?.name)
      if (this.requests === 1) {
        assert.equal(names.filter((name: unknown) => name === this.target).length, 0)
        if (this.category === 'filler_dispatch_refused') {
          const advertised = body.tools.filter((entry: any) => entry?.function?.name === this.filler)
          assert.equal(advertised.length, 1)
          assert.equal(advertised[0].function.parameters?.type, 'object')
          assert.deepEqual(advertised[0].function.parameters.properties, {})
          assert.equal(advertised[0].function.parameters.required?.length ?? 0, 0)
          this.call = { id: randomUUID(), name: this.filler, arguments: '{}' }
          return { kind: 'call', call: this.call }
        }
        const step = this.validator.next(value)
        assert.equal(step.kind, 'call')
        assert(step.kind === 'call' && step.call.name === 'search_tools')
        this.call = step.call
        return step
      }
      assert.equal(this.requests, 2)
      assert(this.call)
      const start = body.messages.findLastIndex((message: any) => message?.role === 'user')
      assert(start >= 0)
      const current = body.messages.slice(start + 1)
      const calls = current.flatMap((message: any, index: number) => message?.role === 'assistant'
        ? (message.tool_calls ?? []).map((call: any) => ({ call, index })) : [])
      const results = current.flatMap((message: any, index: number) => message?.role === 'tool' ? [{ message, index }] : [])
      assert.equal(calls.length, 1)
      assert.equal(results.length, 1)
      assert.equal(calls[0].call.id, this.call.id)
      assert.equal(calls[0].call.function?.name, this.call.name)
      assert.equal(results[0].message.tool_call_id, this.call.id)
      assert(results[0].index > calls[0].index)
      if (this.category === 'filler_dispatch_refused') {
        const result = JSON.parse(results[0].message.content)
        assert.equal(result.status, 'error')
        assert.equal(result.tool_call_id, this.call.id)
        assert.equal(result.tool, this.filler)
        assert.equal(result.provenance?.source, 'mcp')
        assert.equal(result.provenance?.terminal_state, 'failed')
        assert.equal(result.provenance?.observed_by, 'trusted_host')
        assert.equal(result.message, `MCP tool ${JSON.stringify(this.filler)} failed on server ${JSON.stringify(this.serverId)}`)
        this.originalMatched = true
        this.resultProvenance = true
        this.failure = 'filler_dispatch_refused'
        return { kind: 'failure', category: this.failure }
      }
      assert.equal(names.filter((name: unknown) => name === this.target).length, 1)
      assert(JSON.stringify(results[0].message.content).includes(this.target))
      this.originalMatched = true
      this.originalTargetAdvertised = true
      const copy = structuredClone(body)
      const resultIndex = start + 1 + results[0].index
      if (this.category === 'unadvertised_target_after_discovery') {
        copy.tools = copy.tools.filter((entry: any) => entry?.function?.name !== this.target)
        this.mutatedTargetAdvertised = copy.tools.some((entry: any) => entry?.function?.name === this.target)
      } else if (this.category === 'unrelated_tool_call_id') {
        const unrelated = randomUUID()
        assert.notEqual(unrelated, this.call.id)
        copy.messages[resultIndex].tool_call_id = unrelated
      } else if (this.category === 'missing_tool_call_id') {
        delete copy.messages[resultIndex].tool_call_id
        this.mutatedIdPresent = Object.hasOwn(copy.messages[resultIndex], 'tool_call_id')
      } else copy.messages.splice(resultIndex, 1)
      this.mutations += 1
      this.mutatedResultCount = copy.messages.slice(start + 1).filter((message: any) => message?.role === 'tool').length
      const refused = this.validator.next(copy)
      assert.equal(refused.kind, 'failure')
      assert(refused.kind === 'failure')
      this.failure = refused.category
      return refused
    } catch {
      this.preconditionFailed = true
      this.failure = 'negative_fixture_precondition_failed'
      return { kind: 'failure', category: this.failure }
    }
  }
  matchesCall(value: unknown): boolean { return typeof value === 'string' && value === this.call?.id }
  diagnostic() {
    return { requests: this.requests, originalPreconditionsMatched: this.originalMatched, mutations: this.mutations,
      failure: this.failure, preconditionFailed: this.preconditionFailed, resultProvenanceMatched: this.resultProvenance,
      originalTargetAdvertised: this.originalTargetAdvertised, mutatedTargetAdvertised: this.mutatedTargetAdvertised,
      mutatedResultCount: this.mutatedResultCount, mutatedIdPresent: this.mutatedIdPresent,
      discoveryProposals: this.category === 'filler_dispatch_refused' ? 0 : this.validator.diagnostic().discoveryProposals,
      targetProposals: this.validator.diagnostic().targetProposals,
      fillerProposals: this.category === 'filler_dispatch_refused' && this.call ? 1 : 0, noInventedCompletion: true }
  }
}

/** Scoped observation of actual preparation and authenticated run inspection, with no executor override. */
async function installRunObservation(app: ElectronApplication, input: { serverId: string; providerName: string; filler: boolean }) {
  await app.evaluate((_, input) => {
    const state = globalThis as any
    if (state.__bauarProviderNegative) throw new Error('Negative observation already installed')
    const { IncomingMessage } = process.getBuiltinModule('node:http')
    const originalFetch = globalThis.fetch
    const originalEmit = IncomingMessage.prototype.emit
    const urls = new Set<string>()
    const bodies = new WeakMap<object, Buffer[]>()
    const prepared: any[] = []
    const runs: Array<{ url: string; headers: HeadersInit | undefined }> = []
    let failed = false
    IncomingMessage.prototype.emit = function (this: IncomingMessage, event: string | symbol, ...args: any[]) {
      try {
        const url = `http://127.0.0.1:${this.socket?.localPort}${this.url}`
        if (this.method === 'POST' && urls.has(url)) {
          if (event === 'data') {
            const chunks = bodies.get(this) ?? []
            chunks.push(Buffer.from(args[0]))
            if (chunks.reduce((size, chunk) => size + chunk.length, 0) > 1024 * 1024) throw new Error('Negative preparation bound exceeded')
            bodies.set(this, chunks)
          } else if (event === 'end') {
            const chunks = bodies.get(this)
            bodies.delete(this)
            const { invocation } = JSON.parse(Buffer.concat(chunks ?? []).toString())
            prepared.push({ runId: invocation.executingRunId, callId: invocation.modelToolCallId,
              revision: invocation.catalogRevision, matches: invocation.executionKind === (input.filler ? 'host_mcp' : 'runtime_native')
                && invocation.mountedServerId === (input.filler ? input.serverId : 'builtin')
                && invocation.providerToolName === input.providerName
                && invocation.nativeToolName === (input.filler ? 'a_filler_00' : 'search_tools') })
          }
        }
      } catch { failed = true }
      return Reflect.apply(originalEmit, this, [event, ...args])
    }
    globalThis.fetch = async (request, init) => {
      const url = new URL(request instanceof Request ? request.url : String(request))
      if (url.pathname !== '/api/uar/runs' || init?.method !== 'POST') return originalFetch(request, init)
      const body = JSON.parse(String(init.body))
      urls.add(`${body.tool_admission.url}/prepare`)
      const response = await originalFetch(request, init)
      if (response.ok) {
        const created = await response.clone().json()
        runs.push({ url: new URL(`/api/uar/runs/${created.run_id}`, url).href, headers: init.headers })
      }
      return response
    }
    state.__bauarProviderNegative = {
      async inspect() {
        if (runs.length !== 1) throw new Error('Negative run count mismatch')
        const response = await originalFetch(runs[0].url, { headers: runs[0].headers })
        if (!response.ok) throw new Error('Negative run inspection failed')
        const run = await response.json()
        return { failed, preparations: prepared.length, exactSource: prepared.length === 1 && prepared[0].matches,
          sourceRevisionMatches: prepared.length === 1 && prepared[0].runId === run.run_id && prepared[0].revision === run.agent_revision,
          callId: prepared.length === 1 ? prepared[0].callId : null, status: run.status }
      },
      restore() { globalThis.fetch = originalFetch; IncomingMessage.prototype.emit = originalEmit }
    }
  }, input)
}

async function inspectRun(app: ElectronApplication) {
  return app.evaluate(async () => (globalThis as any).__bauarProviderNegative.inspect()) as Promise<{
    failed: boolean; preparations: number; exactSource: boolean; sourceRevisionMatches: boolean; callId: unknown; status: string }>
}
async function restoreRunObservation(app: ElectronApplication) {
  await app.evaluate(() => {
    const state = globalThis as any
    state.__bauarProviderNegative?.restore()
    delete state.__bauarProviderNegative
  })
}

export async function exerciseProviderNegativeCases(input: {
  app: ElectronApplication; page: Page; sourceAgent: string; modelId: string; workspaceId: string; serverId: string
  canary: string; intendedTargetName: string; targetEffects(): number; fillerDispatches(): number
  conversation(value: ProjectionProviderDriver | undefined): void
  setResponseObserver(observer: ((status: number) => void) | undefined): void
  providerRequestSnapshot(): Array<{ authorized: boolean }>
}) {
  const { app, page } = input
  const fillerName = encodeUarProviderToolName(`${input.serverId}__a_filler_00`)
  for (const receipt of progress) {
    receipt.status = 'running'
    let sessionId: string | undefined
    let captureInstalled = false
    let observationInstalled = false
    const statuses: number[] = []
    try {
      const filler = receipt.category === 'filler_dispatch_refused'
      const agent = await prepareProjectionToolAgent(page, input.sourceAgent, input.modelId, input.serverId, 'deferred')
      sessionId = await page.evaluate(async ({ agentId, workspaceId }) => {
        const response = await window.api.dataApi.request({ id: crypto.randomUUID(), method: 'POST', path: '/agent-sessions',
          body: { agentId, name: 'Provider refusal acceptance', workspace: { type: 'user', workspaceId } } }) as any
        if (response.error || !response.data?.id) throw new Error('Negative session creation failed')
        return response.data.id as string
      }, { agentId: agent.id, workspaceId: input.workspaceId })
      const driver = new NegativeConversation(receipt.category, input.intendedTargetName, input.canary, fillerName, input.serverId,
        () => input.providerRequestSnapshot().at(-1)?.authorized === true)
      const requestBefore = input.providerRequestSnapshot().length
      const targetBefore = input.targetEffects()
      const fillerBefore = input.fillerDispatches()
      input.conversation(driver)
      input.setResponseObserver((status) => { statuses.push(status) })
      await installCapture(app, input.canary, 'none')
      captureInstalled = true
      await installRunObservation(app, { serverId: input.serverId, providerName: filler ? fillerName : 'search_tools', filler })
      observationInstalled = true
      receipt.stage = 'run'
      const turn = await runTurn(page, `agent-session:${sessionId}`, input.modelId, { approve: true })
      receipt.stage = 'inspection'
      await expect.poll(async () => (await inspectRun(app)).status, { timeout: 30_000 }).toBe('error')
      await expect.poll(() => statuses.length, { timeout: 10_000 }).toBe(2)
      const observed = await inspectRun(app)
      await restoreRunObservation(app)
      observationInstalled = false
      const captures = await finishCapture(app)
      captureInstalled = false
      const capture = await readCaptureDiagnostic(app)
      const provider = driver.diagnostic()
      const requests = input.providerRequestSnapshot().slice(requestBefore)
      receipt.stage = 'assertions'
      receipt.evidence = { provider, actualProviderRequests: requests.length, actualProviderHttpStatuses: [...statuses],
        authenticatedProviderRequests: requests.length > 0 && requests.every((request) => request.authorized),
        actualPreparations: observed.preparations, exactSourceMatched: observed.exactSource,
        sourceRevisionMatches: observed.sourceRevisionMatches, protectedTargetEffects: input.targetEffects() - targetBefore,
        fillerDispatches: input.fillerDispatches() - fillerBefore, actualRunFailureObserved: observed.status === 'error',
        streamErrorObserved: turn.diagnostic.streamErrorEvents > 0 }
      assert.deepEqual(statuses, [200, 400])
      assert.equal(requests.length, 2)
      assert(requests.every((request) => request.authorized))
      assert.equal(provider.preconditionFailed, false)
      assert.equal(provider.originalPreconditionsMatched, true)
      assert.equal(provider.requests, 2)
      assert.equal(provider.mutations, filler ? 0 : 1)
      const expectedFailure = filler ? 'filler_dispatch_refused' : receipt.category === 'unadvertised_target_after_discovery'
        ? 'target_not_advertised' : receipt.category === 'missing_tool_result' ? 'missing_tool_result' : 'unexpected_tool_history'
      assert.equal(provider.failure, expectedFailure)
      assert.equal(provider.targetProposals, 0)
      assert.equal(provider.discoveryProposals, filler ? 0 : 1)
      assert.equal(provider.fillerProposals, filler ? 1 : 0)
      assert.equal(observed.failed, false)
      assert.equal(observed.preparations, 1)
      assert(observed.exactSource && observed.sourceRevisionMatches && driver.matchesCall(observed.callId))
      assert.equal(captures.length, 1)
      assert(captures[0].runSnapshotMatched && captures[0].preparedRevisionsMatched && captures[0].preparedInvocations === 1)
      assert(capture && capture.stream.runErrors > 0 && !capture.stream.parseFailed && !capture.stream.incomplete)
      assert(turn.error.length > 0 && turn.diagnostic.streamErrorEvents > 0)
      assert.equal(turn.approvals.requests.length, 1)
      assert.equal(turn.approvals.accepted.length, 1)
      assert.equal(turn.approvals.requests[0].id, turn.approvals.accepted[0])
      assert.equal(turn.approvals.requests[0].name, filler ? fillerName : 'search_tools')
      assert.equal(turn.approvals.requests[0].matchingInputStarts, 1)
      assert.equal(input.targetEffects() - targetBefore, 0)
      assert.equal(input.fillerDispatches() - fillerBefore, filler ? 1 : 0)
      receipt.evidence = { originalPreconditionsMatched: true, faultAppliedOnce: !filler,
        actualProviderRequests: requests.length, authenticatedProviderRequests: true, actualProviderHttpStatuses: statuses,
        expectedFailureCategoryMatched: true, failureCategory: expectedFailure, provider,
        discoveryPreparations: filler ? 0 : observed.preparations, targetPreparations: 0,
        fillerPreparations: filler ? observed.preparations : 0, exactApprovalDecisions: 1,
        sourceRevisionMatches: true, exactPreparedCallMatched: true, protectedTargetEffects: 0,
        fillerDispatches: input.fillerDispatches() - fillerBefore, actualRunFailureObserved: true,
        actualRunStatus: observed.status, streamRunErrors: capture.stream.runErrors, noInventedCompletion: true }
    } catch (error) { receipt.status = 'failed'; throw error }
    finally {
      input.conversation(undefined)
      input.setResponseObserver(undefined)
      try {
        try {
          if (sessionId) {
            const aborted = await page.evaluate(async (topicId) => window.api.ipcApi.request('ai.stream.abort', { topicId }),
              `agent-session:${sessionId}`) as any
            assert.equal(aborted.ok, true)
            await closeProjectionHistorySession(app, sessionId)
          }
        } finally {
          try { if (observationInstalled) await restoreRunObservation(app) }
          finally { if (captureInstalled) await restoreCapture(app) }
        }
        receipt.cleanupConfirmed = true
      } catch (error) { receipt.status = 'failed'; receipt.stage = 'cleanup'; throw error }
    }
    receipt.status = 'passed'
  }
  return { cases: providerNegativeCaseProgress() }
}
