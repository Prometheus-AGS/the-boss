import assert from 'node:assert/strict'

import type { ElectronApplication } from '@playwright/test'

import { registrationErrorDiagnostic } from './bauar-secret-projection-turn'

export type ProjectionEventCase = 'split' | 'partial' | 'reconnect' | 'interrupted' | 'cancel' | 'snapshot' | 'run-error' | 'approval' | 'approval-error'
type EventCapture = {
  streams: number
  changed: number
  text: number
  reasoning: number
  snapshot: number
  snapshotFrames: number
  snapshotCursorSelected: boolean
  snapshotSource: { stage: 'unreached' | 'draining' | 'selecting' | 'reopening' | 'reopened'; drained: boolean;
    inspectedFrames: number; textFrames: number; stepStarts: number; stepFinishes: number; activeSteps: number;
    unmatchedStepFinishes: number; terminalFrames: number; runErrors: number; otherFrames: number;
    sourceIdsValid: boolean; sourceOrderMonotonic: boolean; candidateObserved: boolean; cursorBeforeTerminal: boolean | null;
    textIncluded: boolean; replayFrames: number; replayTerminals: number; replayUnmatchedStepFinishes: number }
  runErrors: number
  contentIds: string[]
  approvals: Array<{ id: string; runId: string; toolCallId: string }>
  decisions: Array<{ id: string; approved: boolean }>
}

/** Alter human content only on actual UAR events; retain every control ID, type and sequence. */
export async function installEventProjectionFixture(
  app: ElectronApplication, canary: string, scenario: ProjectionEventCase
): Promise<void> {
  await app.evaluate((_, input) => {
    const original = globalThis.fetch
    const capture: EventCapture = { streams: 0, changed: 0, text: 0, reasoning: 0, snapshot: 0, snapshotFrames: 0, snapshotCursorSelected: false,
      snapshotSource: { stage: 'unreached', drained: false, inspectedFrames: 0, textFrames: 0, stepStarts: 0,
        stepFinishes: 0, activeSteps: 0, unmatchedStepFinishes: 0, terminalFrames: 0, runErrors: 0, otherFrames: 0,
        sourceIdsValid: true, sourceOrderMonotonic: true, candidateObserved: false, cursorBeforeTerminal: null,
        textIncluded: false, replayFrames: 0, replayTerminals: 0, replayUnmatchedStepFinishes: 0 }, runErrors: 0, contentIds: [], approvals: [], decisions: [] }
    const rewrites = new Map<string, string>()
    const counts = new Map<string, number>()
    ;(globalThis as any).__bauarProjectionEvents = { capture, restore() { globalThis.fetch = original } }
    globalThis.fetch = async (request, init) => {
      const url = new URL(request instanceof Request ? request.url : String(request))
      const scoped = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname.startsWith('/api/uar/runs/')
      if (scoped && url.pathname.endsWith('/tool-approval') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        capture.decisions.push({ id: body.approval_id, approved: body.approved })
        if (input.scenario === 'approval-error') {
          return new Response(`${'x'.repeat(990)}${input.canary} diagnostic tail`, { status: 502 })
        }
      }
      let response = await original(request, init)
      if (!scoped || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) return response
      if (input.scenario === 'snapshot') {
        const sourceDiagnostic = capture.snapshotSource
        sourceDiagnostic.stage = 'draining'
        const drained = (await response.text()).replaceAll('\r\n', '\n')
        sourceDiagnostic.drained = true
        sourceDiagnostic.stage = 'selecting'
        let previousSource: bigint | undefined
        const activeSteps = new Set<string>()
        const observed: Array<{ source: string; type: string; stepId?: string }> = []
        let lastTextSource: string | undefined
        let terminal: string | undefined
        for (const frame of drained.split('\n\n')) {
          const lines = frame.split('\n')
          const source = lines.find((line) => line.startsWith('id:'))?.slice(3).trim()
          const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5)).join('\n')
          if (!data) continue
          sourceDiagnostic.inspectedFrames += 1
          const event = JSON.parse(data)
          sourceDiagnostic.sourceIdsValid &&= Boolean(source && /^\d+$/.test(source))
          if (!source || !/^\d+$/.test(source)) throw new Error('projection_snapshot_source_cursor_missing')
          const sequence = BigInt(source)
          sourceDiagnostic.sourceOrderMonotonic &&= previousSource === undefined || sequence >= previousSource
          previousSource = sequence
          if (event.type === 'TEXT_MESSAGE_CONTENT') sourceDiagnostic.textFrames += 1
          else if (event.type === 'STEP_STARTED') sourceDiagnostic.stepStarts += 1
          else if (event.type === 'STEP_FINISHED') sourceDiagnostic.stepFinishes += 1
          else if (event.type === 'RUN_FINISHED') sourceDiagnostic.terminalFrames += 1
          else if (event.type === 'RUN_ERROR') sourceDiagnostic.runErrors += 1
          else sourceDiagnostic.otherFrames += 1
          observed.push({ source, type: event.type, stepId: event.stepId })
          if (event.type === 'RUN_ERROR') throw new Error('projection_snapshot_source_run_failed')
          if (event.type === 'RUN_FINISHED') { terminal = source; break }
          if (event.type === 'TEXT_MESSAGE_CONTENT' && typeof event.delta === 'string' && event.delta.length > 0) lastTextSource = source
          if (event.type === 'STEP_STARTED') activeSteps.add(event.stepId)
          if (event.type === 'STEP_FINISHED') {
            if (!activeSteps.delete(event.stepId)) {
              sourceDiagnostic.unmatchedStepFinishes += 1
            }
          }
          sourceDiagnostic.activeSteps = activeSteps.size
        }
        if (!sourceDiagnostic.sourceOrderMonotonic) throw new Error('projection_snapshot_source_order_invalid')
        // Discarded prefix step state is not restored by a messages snapshot. Validate only the real replay suffix.
        const cursor = terminal ? observed.findLast((event) => BigInt(event.source) < BigInt(terminal!))?.source : undefined
        sourceDiagnostic.candidateObserved = cursor !== undefined
        sourceDiagnostic.textIncluded = Boolean(cursor && lastTextSource && BigInt(cursor) >= BigInt(lastTextSource))
        sourceDiagnostic.cursorBeforeTerminal = cursor && terminal ? BigInt(cursor) < BigInt(terminal) : null
        if (!cursor || !terminal || !sourceDiagnostic.textIncluded || BigInt(cursor) >= BigInt(terminal)) {
          throw new Error('projection_snapshot_nonterminal_cursor_unavailable')
        }
        const replaySteps = new Set<string | undefined>()
        for (const event of observed.filter((event) => BigInt(event.source) > BigInt(cursor))) {
          sourceDiagnostic.replayFrames += 1
          if (event.type === 'RUN_FINISHED') sourceDiagnostic.replayTerminals += 1
          if (event.type === 'STEP_STARTED') replaySteps.add(event.stepId)
          if (event.type === 'STEP_FINISHED' && !replaySteps.delete(event.stepId)) {
            sourceDiagnostic.replayUnmatchedStepFinishes += 1
            throw new Error('projection_snapshot_step_order_invalid')
          }
        }
        capture.snapshotCursorSelected = true
        const headers = new Headers(init?.headers ?? (request instanceof Request ? request.headers : undefined))
        headers.set('last-event-id', cursor)
        sourceDiagnostic.stage = 'reopening'
        response = await original(request, { ...init, headers })
        if (!response.body) throw new Error('Actual snapshot stream returned no body')
        sourceDiagnostic.stage = 'reopened'
      }
      capture.streams += 1
      const streamOrdinal = capture.streams
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let pending = ''
      let terminated = false
      const frames = { rewrite(frame: string): { frame: string; text: boolean } {
        let isText = false
        const lines = frame.split('\n').map((line) => {
          if (!line.startsWith('data:')) return line
          const event = JSON.parse(line.slice(5))
          if (event.type === 'TEXT_MESSAGE_CONTENT' || event.type === 'REASONING_MESSAGE_CONTENT') {
            isText = event.type === 'TEXT_MESSAGE_CONTENT'
            const key = `${event.type}:${event.messageId}`
            if (!rewrites.has(event.eventId)) {
              const ordinal = (counts.get(key) ?? 0) + 1
              counts.set(key, ordinal)
              const half = Math.floor(input.canary.length / 2)
              const partial = ['partial', 'cancel', 'interrupted'].includes(input.scenario)
              const value = input.scenario === 'snapshot' ? '' : ordinal === 1
                ? `Before ${input.canary.slice(0, half)}`
                : ordinal === 2 && !partial ? `${input.canary.slice(half)} after.` : ''
              rewrites.set(event.eventId, value)
              if (isText) capture.text += 1
              else capture.reasoning += 1
              if (typeof event.messageId === 'string') capture.contentIds.push(event.messageId)
            }
            event.delta = rewrites.get(event.eventId)
            capture.changed += 1
          } else if (event.type === 'MESSAGES_SNAPSHOT' && input.scenario === 'snapshot') {
            capture.snapshotFrames += 1
            for (const message of event.messages ?? []) {
              if (message.role === 'assistant' && typeof message.content === 'string') {
                message.content = `Before ${input.canary} after.`
                capture.snapshot += 1
              }
            }
          } else if (event.type === 'CUSTOM' && event.name === 'uar.tool.approval_required') {
            const value = event.value
            if (typeof value?.approvalId !== 'string' || typeof value.toolCallId !== 'string') {
              throw new Error('Projection fixture requires an actual exact-ID approval event')
            }
            capture.approvals.push({ id: value.approvalId, runId: event.runId, toolCallId: value.toolCallId })
            value.arguments = { operation: `Read ${input.canary}`, server: `Server ${input.canary}`,
              target: `${'x'.repeat(500)}${input.canary}`, detailsAvailable: true }
            capture.changed += 1
          } else if (event.type === 'TOOL_CALL_RESULT') {
            event.content = JSON.stringify({ readable: `Tool result ${input.canary}`, benign: 'kept' })
            capture.changed += 1
          } else if (event.type === 'RUN_ERROR' && typeof event.message === 'string') {
            event.message = `Run diagnostic ${input.canary}`
            capture.runErrors += 1
            capture.changed += 1
          }
          return `data: ${JSON.stringify(event)}`
        })
        return { frame: lines.join('\n'), text: isText }
      } }
      const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, controller) {
          if (terminated) return
          pending += decoder.decode(chunk, { stream: true }).replaceAll('\r\n', '\n')
          let boundary: number
          while ((boundary = pending.indexOf('\n\n')) >= 0) {
            const transformed = frames.rewrite(pending.slice(0, boundary))
            pending = pending.slice(boundary + 2)
            controller.enqueue(encoder.encode(`${transformed.frame}\n\n`))
            if (!transformed.text) continue
            if (input.scenario === 'interrupted' || (input.scenario === 'reconnect' && streamOrdinal === 1)) {
              terminated = true
              controller.terminate()
              return
            }
            if (input.scenario === 'cancel') {
              await new Promise<void>((_, reject) => {
                const cancellation = { abort() { reject(new Error('Projection fixture stream cancelled')) } }
                if (init?.signal?.aborted) cancellation.abort()
                else init?.signal?.addEventListener('abort', cancellation.abort, { once: true })
              })
            }
          }
        },
        flush(controller) {
          if (terminated) return
          pending += decoder.decode()
          if (pending.trim()) controller.enqueue(encoder.encode(frames.rewrite(pending).frame))
        }
      }), { signal: init?.signal ?? undefined })
      return new Response(body, { status: response.status, headers: response.headers })
    }
  }, { canary, scenario })
}

export async function finishEventProjectionFixture(app: ElectronApplication): Promise<EventCapture> {
  return app.evaluate(() => {
    const state = (globalThis as any).__bauarProjectionEvents
    state.restore()
    delete (globalThis as any).__bauarProjectionEvents
    return state.capture as EventCapture
  })
}

/** Fixed comparisons for every event assertion; never expose content or correlation identifiers. */
export function eventAssertionDiagnostic(
  scenario: ProjectionEventCase, canary: string, chunks: string, storedAssistantData: readonly unknown[],
  capture: EventCapture, streamError: string
) {
  const events = JSON.parse(chunks) as Array<Record<string, any>>
  const ordinary = events.map((event) => {
    const content = { ...event }
    for (const field of ['id', 'toolCallId', 'approvalId', 'toolName']) delete content[field]
    return content
  })
  const ordinaryText = JSON.stringify(ordinary)
  const stored = JSON.stringify(storedAssistantData)
  const textDeltas = events.filter((event) => event.type === 'text-delta')
  const reasoningDeltas = events.filter((event) => event.type === 'reasoning-delta')
  const text = textDeltas.map((event) => event.delta).join('')
  const reasoning = reasoningDeltas.map((event) => event.delta).join('')
  const starts = events.filter((event) => event.type === 'text-start' || event.type === 'reasoning-start')
  const approval = scenario === 'approval' || scenario === 'approval-error'
  const errorExpected = scenario === 'approval-error' || scenario === 'run-error'
  return { scenario, counts: { streams: capture.streams, changed: capture.changed, textEvents: capture.text,
    reasoningEvents: capture.reasoning, snapshot: capture.snapshot, snapshotFrames: capture.snapshotFrames, runErrors: capture.runErrors,
    contentIds: capture.contentIds.length, approvals: capture.approvals.length, decisions: capture.decisions.length,
    chunks: events.length, textDeltas: textDeltas.length, reasoningDeltas: reasoningDeltas.length,
    textLength: text.length, reasoningLength: reasoning.length, contentStarts: starts.length,
    storedAssistantRecords: storedAssistantData.length },
    streamErrorPresent: Boolean(streamError), streamError: registrationErrorDiagnostic(streamError),
    snapshotCursorSelected: capture.snapshotCursorSelected, snapshotSource: capture.snapshotSource, fieldMatches: {
      assistantPersisted: storedAssistantData.length > 0,
      expectedStreamError: errorExpected ? streamError.includes('<redacted>')
        : ['interrupted', 'cancel'].includes(scenario) ? null : streamError === '',
      streamErrorPrefixAbsent: errorExpected ? !streamError.includes(canary.slice(0, 10)) : null,
      approvalObserved: approval ? capture.approvals.length > 0 && capture.decisions.length > 0 : null,
      streamCanaryAbsent: !ordinaryText.includes(canary), storedCanaryAbsent: !stored.includes(canary),
      streamPrefixAbsent: !ordinaryText.includes(canary.slice(0, 10)), storedPrefixAbsent: !stored.includes(canary.slice(0, 10)),
      textHalfAbsent: !text.includes(canary.slice(0, Math.floor(canary.length / 2))),
      textRedacted: !['approval-error', 'run-error', 'cancel'].includes(scenario) ? text.includes('<redacted>') : null,
      exactText: ['split', 'reconnect', 'snapshot', 'approval'].includes(scenario) ? text === 'Before <redacted> after.'
        : scenario === 'partial' ? text === 'Before <redacted>' : null,
      splitEventCounts: scenario === 'split' ? capture.text >= 2 && capture.reasoning >= 2 : null,
      splitReasoning: scenario === 'split' ? reasoning === 'Before <redacted> after.' : null,
      reconnectStreams: ['reconnect', 'interrupted'].includes(scenario) ? capture.streams === 2 : null,
      snapshotObserved: scenario === 'snapshot' ? capture.snapshot > 0 : null,
      runErrorObserved: scenario === 'run-error' ? capture.runErrors > 0 : null,
      contentIdsPreserved: starts.every((event) => capture.contentIds.some((id) => event.id.startsWith(`${id}:`)) || scenario === 'snapshot'),
      approvalIdsPreserved: capture.approvals.every((item) => events.some((event) => event.type === 'tool-approval-request'
        && event.approvalId === `uar:${item.runId}:${item.id}` && event.toolCallId === `uar:${item.runId}:${item.toolCallId}`)),
      exactDecisions: capture.approvals.every((item) => capture.decisions.some((decision) => decision.id === item.id && decision.approved))
    } }
}

export function assertProjectedEvents(
  scenario: ProjectionEventCase, canary: string, chunks: string, storedAssistantData: unknown, capture: EventCapture
) {
  const events = JSON.parse(chunks) as Array<Record<string, any>>
  const ordinary = events.map((event) => {
    const content = { ...event }
    for (const field of ['id', 'toolCallId', 'approvalId', 'toolName']) delete content[field]
    return content
  })
  assert.equal(JSON.stringify(ordinary).includes(canary), false)
  assert.equal(JSON.stringify(storedAssistantData).includes(canary), false)
  assert.equal(JSON.stringify(ordinary).includes(canary.slice(0, 10)), false)
  assert.equal(JSON.stringify(storedAssistantData).includes(canary.slice(0, 10)), false)
  const text = events.filter((event) => event.type === 'text-delta').map((event) => event.delta).join('')
  assert.equal(text.includes(canary.slice(0, Math.floor(canary.length / 2))), false)
  if (!['approval-error', 'run-error', 'cancel'].includes(scenario)) assert(text.includes('<redacted>'))
  if (['split', 'reconnect', 'snapshot', 'approval'].includes(scenario)) assert.equal(text, 'Before <redacted> after.')
  if (scenario === 'partial') assert.equal(text, 'Before <redacted>')
  if (scenario === 'split') {
    assert(capture.text >= 2 && capture.reasoning >= 2)
    const reasoning = events.filter((event) => event.type === 'reasoning-delta').map((event) => event.delta).join('')
    assert.equal(reasoning, 'Before <redacted> after.')
  }
  if (scenario === 'reconnect' || scenario === 'interrupted') assert.equal(capture.streams, 2)
  if (scenario === 'snapshot') assert(capture.snapshot > 0)
  if (scenario === 'run-error') assert(capture.runErrors > 0)
  for (const event of events.filter((entry) => entry.type === 'text-start' || entry.type === 'reasoning-start')) {
    assert(capture.contentIds.some((id) => event.id.startsWith(`${id}:`)) || scenario === 'snapshot')
  }
  for (const approval of capture.approvals) {
    assert(events.some((event) => event.type === 'tool-approval-request' &&
      event.approvalId === `uar:${approval.runId}:${approval.id}` && event.toolCallId === `uar:${approval.runId}:${approval.toolCallId}`))
    assert(capture.decisions.some((decision) => decision.id === approval.id && decision.approved))
  }
  return { scenario, humanContentProjected: true, persistenceObserved: true, controlCorrelationPreserved: true,
    controlledFixture: 'human content on actual UAR events; no manufactured execution or approval authority' }
}

/** Called only after normal stream/capture/persistence cleanup; collect assertion failures, not operational errors. */
export function collectProjectedEventAssertions(
  scenario: ProjectionEventCase, canary: string, chunks: string, assistant: readonly unknown[],
  capture: EventCapture, streamError: string
) {
  const diagnostic = eventAssertionDiagnostic(scenario, canary, chunks, assistant, capture, streamError)
  const result = { error: streamError }
  const approval = scenario.startsWith('approval')
  try {
    assert(assistant.length > 0)
    if (scenario === 'approval-error' || scenario === 'run-error') {
      assert(result.error.includes('<redacted>'))
      assert.equal(result.error.includes(canary.slice(0, 10)), false)
    } else if (scenario !== 'interrupted' && scenario !== 'cancel') assert.equal(result.error, '')
    if (approval) assert(capture.approvals.length > 0 && capture.decisions.length > 0)
    const receipt = assertProjectedEvents(scenario, canary, chunks, assistant, capture)
    return { scenario, status: 'passed' as const, diagnostic, receipt }
  } catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error
    return { scenario, status: 'failed' as const, diagnostic }
  }
}
