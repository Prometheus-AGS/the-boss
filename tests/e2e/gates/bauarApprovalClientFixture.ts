import { existsSync } from 'node:fs'

import { expect, type ElectronApplication, type Page } from '@playwright/test'

import { installHostAdmissionDiagnostic, readHostAdmissionDiagnostic, restoreHostAdmissionDiagnostic } from './bauarHostAdmissionDiagnostic'

export const approvalCases = ['missing', 'empty', 'whitespace', 'approve', 'deny', 'reconnect', 'edited', 'cancel', 'unavailable'] as const
export type ApprovalCase = (typeof approvalCases)[number]

type ProtocolCapture = {
  approvalIds: string[]
  decisions: Array<{ approval_id?: string; approved: boolean }>
  alteredEvents: number
  interceptedStreams: number
}

export async function installApprovalProtocolCapture(app: ElectronApplication, scenario: ApprovalCase): Promise<void> {
  await app.evaluate((_, selected) => {
    const state = globalThis as typeof globalThis & {
      __bauarApproval?: ProtocolCapture & { restore(): void }
    }
    if (state.__bauarApproval) throw new Error('Approval protocol capture is already installed')
    const original = globalThis.fetch
    const capture: ProtocolCapture = { approvalIds: [], decisions: [], alteredEvents: 0, interceptedStreams: 0 }
    state.__bauarApproval = { ...capture, restore: () => (globalThis.fetch = original) }
    const active = state.__bauarApproval
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const scoped = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
        url.pathname.startsWith('/api/uar/runs/')
      if (scoped && url.pathname.endsWith('/tool-approval') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { approval_id?: string; approved: boolean }
        active.decisions.push({ approval_id: body.approval_id, approved: body.approved })
      }
      const response = await original(input, init)
      if (!scoped || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        return response
      }
      active.interceptedStreams += 1
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let pending = ''
      const line = (value: string): string => {
        if (!value.startsWith('data:')) return value
        let event: { name?: string; value?: Record<string, unknown> }
        try {
          event = JSON.parse(value.slice(5))
        } catch {
          return value
        }
        if (event.name !== 'uar.tool.approval_required' || !event.value) return value
        const id = event.value.approvalId
        if (typeof id !== 'string' || !id.trim()) throw new Error('Fixture requires a real exact-ID UAR event')
        active.approvalIds.push(id)
        if (selected === 'missing') delete event.value.approvalId
        else if (selected === 'empty') event.value.approvalId = ''
        else if (selected === 'whitespace') event.value.approvalId = '  \t'
        else return value
        active.alteredEvents += 1
        return `data: ${JSON.stringify(event)}`
      }
      const projected = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          pending += decoder.decode(chunk, { stream: true })
          let boundary: number
          while ((boundary = pending.indexOf('\n')) >= 0) {
            controller.enqueue(encoder.encode(`${line(pending.slice(0, boundary))}\n`))
            pending = pending.slice(boundary + 1)
          }
        },
        flush(controller) {
          pending += decoder.decode()
          if (pending) controller.enqueue(encoder.encode(line(pending)))
        }
      }))
      return new Response(projected, { status: response.status, statusText: response.statusText, headers: response.headers })
    }
  }, scenario)
}

export async function runApprovalClientCase(
  app: ElectronApplication,
  page: Page,
  input: { scenario: ApprovalCase; topicId: string; bossModelId: string; effectPath: string; agentId: string; workspaceId: string }
): Promise<{ scenario: ApprovalCase; boundary: string; capture: ProtocolCapture }> {
  expect(existsSync(input.effectPath)).toBe(false)
  await installHostAdmissionDiagnostic(app)
  try {
    await installApprovalProtocolCapture(app, input.scenario)
    if (input.scenario === 'unavailable') return await runUnavailableUserCase(app, page, input)
    await page.evaluate(async ({ topicId, bossModelId, scenario }) => {
      const state = {
        done: false, error: '', approvalId: '', approvals: 0, decisionDone: false,
        foreignRejected: false, replayRejected: false, reattached: false, toolOutput: false,
        streamErrorCount: 0, missingExactIdErrorCount: 0, providerEffectGuardErrorCount: 0,
        unsubscribe: [] as Array<() => void>
      }
      ;(window as any).__bauarApprovalCase = state
      const request = (route: string, value: unknown) => window.api.ipcApi.request(route, value) as Promise<{
        ok: boolean; data?: { ok?: boolean }; error?: { message?: string }
      }>
      const rejected = (result: { ok: boolean; data?: { ok?: boolean } }) => !result.ok || result.data?.ok === false
      state.unsubscribe.push(window.api.ipcApi.on('ai.stream.chunk', (payload: any) => {
        if (payload.topicId !== topicId) return
        if (payload.chunk?.type === 'tool-output-available') state.toolOutput = true
        if (payload.chunk?.type !== 'tool-approval-request') return
        state.approvals += 1
        if (state.approvalId) return
        state.approvalId = payload.chunk.approvalId
        void (async () => {
          const decision = { approvalId: state.approvalId, approved: true, topicId }
          state.foreignRejected = rejected(await request('ai.tool.respond_approval', {
            ...decision, approvalId: `${state.approvalId}:foreign`
          }))
          if (!state.foreignRejected) throw new Error('Foreign approval identity was accepted')
          const inspection = await window.api.ipcApi.request('prometheus.uar.operations.read', {}) as {
            ok: boolean; data?: { approvals: Array<{ ownerSessionId: string; state: string; approvalId?: string; rootRunId: string }> }
          }
          const pending = inspection.data?.approvals.find((entry) =>
            entry.ownerSessionId === topicId.slice('agent-session:'.length) && entry.state === 'awaiting-human'
          )
          if (!inspection.ok || !pending?.approvalId || `uar:${pending.rootRunId}:${pending.approvalId}` !== state.approvalId) {
            throw new Error('Pending inspection lost the originating approval identity')
          }
          if (scenario === 'reconnect') {
            await request('ai.stream.detach', { topicId })
            const attached = await request('ai.stream.attach', { topicId })
            if (!attached.ok) throw new Error('Approval reconnect failed')
            state.reattached = true
          }
          if (scenario === 'cancel') {
            const aborted = await request('ai.stream.abort', { topicId })
            if (!aborted.ok) throw new Error('Approval cancellation failed')
            state.replayRejected = rejected(await request('ai.tool.respond_approval', decision))
          } else {
            const result = await request('ai.tool.respond_approval', {
              ...decision, approved: scenario !== 'deny',
              ...(scenario === 'edited' ? { updatedInput: { operation: 'changed' } } : {})
            })
            if (rejected(result)) throw new Error('Originating approval identity was rejected')
            state.replayRejected = rejected(await request('ai.tool.respond_approval', decision))
          }
          state.decisionDone = true
        })().catch((error) => { state.error = error instanceof Error ? error.message : String(error) })
      }))
      state.unsubscribe.push(window.api.ipcApi.on('ai.stream.done', (payload: any) => {
        if (payload.topicId === topicId && payload.isTopicDone) state.done = true
      }))
      state.unsubscribe.push(window.api.ipcApi.on('ai.stream.error', (payload: any) => {
        if (payload.topicId === topicId) {
          state.error = payload.error?.message ?? 'unknown stream error'
          state.streamErrorCount += 1
          if (/exact approvalId.*update the runtime/i.test(state.error)) state.missingExactIdErrorCount += 1
          if (state.error.includes('Gate V fixture refused to narrate success before the filesystem effect existed')) {
            state.providerEffectGuardErrorCount += 1
          }
        }
      }))
      const result = await request('ai.stream.open', {
        trigger: 'submit-message', topicId, mentionedModelIds: [bossModelId],
        userMessageParts: [{ type: 'text', text: 'Write the approval marker exactly once, then report completion.' }]
      })
      if (!result.ok) throw new Error(result.error?.message ?? 'ai.stream.open failed')
    }, input)

    const malformed = ['missing', 'empty', 'whitespace'].includes(input.scenario)
    await expect.poll(() => page.evaluate(() => {
      const state = (window as any).__bauarApprovalCase
      return Boolean(state.error || (state.done && state.decisionDone))
    }), { timeout: 180_000 }).toBe(true)
    const state = await page.evaluate(() => {
      const { unsubscribe: _, ...snapshot } = (window as any).__bauarApprovalCase
      return snapshot
    })
    const protocolCounts = await app.evaluate(() => {
      const capture = (globalThis as any).__bauarApproval as ProtocolCapture
      return { interceptedStreams: capture.interceptedStreams, exactApprovalEvents: capture.approvalIds.length,
        alteredEvents: capture.alteredEvents, decisions: capture.decisions.length }
    })
    console.error(JSON.stringify({ approvalClientCheckpoint: { scenario: input.scenario, ...protocolCounts,
      uiApprovals: state.approvals, streamErrorCount: state.streamErrorCount,
      missingExactIdErrorCount: state.missingExactIdErrorCount,
      providerEffectGuardErrorCount: state.providerEffectGuardErrorCount, toolOutputObserved: state.toolOutput } }))
    console.error(JSON.stringify({ hostAdmissionCheckpoint: await readHostAdmissionDiagnostic(app) }))
    if (malformed) {
      expect(state.approvals).toBe(0)
      expect(state.error).toMatch(/exact approvalId.*update the runtime/i)
    } else {
      await expect.poll(() => page.evaluate(() => (window as any).__bauarApprovalCase.decisionDone)).toBe(true)
      const decided = await page.evaluate(() => {
        const { unsubscribe: _, ...snapshot } = (window as any).__bauarApprovalCase
        return snapshot
      })
      expect(decided.foreignRejected).toBe(true)
      expect(decided.replayRejected).toBe(true)
      if (input.scenario === 'reconnect') expect(decided.reattached).toBe(true)
      if (input.scenario === 'approve' || input.scenario === 'reconnect') {
        expect(decided.error).toBe('')
        expect(decided.done).toBe(true)
        expect(decided.toolOutput).toBe(true)
      }
    }
    // Abort before observing no effect; a still-pending request is not a terminal denial.
    await page.evaluate(({ topicId }) => window.api.ipcApi.request('ai.stream.abort', { topicId }), input)
    const capture = await app.evaluate(() => {
      const { approvalIds, decisions, alteredEvents, interceptedStreams } = (globalThis as any).__bauarApproval
      return { approvalIds, decisions, alteredEvents, interceptedStreams } as ProtocolCapture
    })
    expect(capture.approvalIds.length).toBeGreaterThan(0)
    if (malformed) {
      expect(capture.alteredEvents).toBeGreaterThan(0)
      expect(capture.decisions).toEqual([])
    } else if (input.scenario === 'cancel') {
      expect(capture.decisions).toEqual([])
    } else {
      expect(capture.decisions).toEqual([{
        approval_id: capture.approvalIds[0],
        approved: input.scenario === 'approve' || input.scenario === 'reconnect'
      }])
      expect(state.approvalId.endsWith(`:${capture.approvalIds[0]}`)).toBe(true)
    }
    expect(existsSync(input.effectPath)).toBe(input.scenario === 'approve' || input.scenario === 'reconnect')
    return {
      scenario: input.scenario,
      boundary: malformed ? 'client protocol compatibility; altered event from real UAR' : 'real Electron IPC, UAR and filesystem',
      capture
    }
  } finally {
    try {
      await page.evaluate(async ({ topicId }) => {
        await window.api.ipcApi.request('ai.stream.abort', { topicId })
        for (const unsubscribe of (window as any).__bauarApprovalCase?.unsubscribe ?? []) unsubscribe()
        delete (window as any).__bauarApprovalCase
      }, input)
    } finally {
      try {
        await app.evaluate(() => {
          const state = globalThis as any
          state.__bauarApproval?.restore()
          delete state.__bauarApproval
        })
      } finally {
        await restoreHostAdmissionDiagnostic(app)
      }
    }
  }
}

async function runUnavailableUserCase(
  app: ElectronApplication,
  page: Page,
  input: { scenario: ApprovalCase; agentId: string; workspaceId: string; effectPath: string }
): Promise<{ scenario: ApprovalCase; boundary: string; capture: ProtocolCapture }> {
  const taskId = await page.evaluate(async ({ agentId, workspaceId }) => {
    const result = await window.api.ipcApi.request('ai.agent.task.create', {
      agentId,
      name: 'BAUAR unavailable approval',
      prompt: 'Write the approval marker exactly once, then report completion.',
      trigger: { kind: 'once', at: Date.now() + 86_400_000 },
      workspace: { type: 'user', workspaceId },
      timeoutMinutes: 2,
      channelIds: []
    }) as { ok: boolean; data?: { id: string }; error?: { message?: string } }
    if (!result.ok || !result.data) throw new Error(result.error?.message ?? 'Headless task creation failed')
    return result.data.id
  }, input)
  try {
    await page.evaluate(async ({ agentId, taskId }) => {
      const state = { approvals: 0, unsubscribe: [] as Array<() => void> }
      ;(window as any).__bauarApprovalCase = state
      state.unsubscribe.push(window.api.ipcApi.on('ai.stream.chunk', (payload: any) => {
        if (payload.chunk?.type === 'tool-approval-request') state.approvals += 1
      }))
      const result = await window.api.ipcApi.request('ai.agent.task.run', { agentId, taskId }) as { ok: boolean }
      if (!result.ok) throw new Error('Headless task dispatch failed')
    }, { agentId: input.agentId, taskId })
    await expect.poll(async () => page.evaluate(async ({ agentId, taskId }) => {
      const response = await window.api.dataApi.request({
        id: crypto.randomUUID(), method: 'GET', path: `/agents/${agentId}/tasks/${taskId}/logs`
      }) as { data?: { items: Array<{ status: string }> }; error?: { message?: string } }
      if (response.error) throw new Error(response.error.message ?? 'Headless task log read failed')
      return response.data?.items[0]?.status
    }, { agentId: input.agentId, taskId }), { timeout: 180_000 }).toMatch(/^(completed|failed|cancelled)$/)
    const capture = await app.evaluate(() => {
      const { approvalIds, decisions, alteredEvents, interceptedStreams } = (globalThis as any).__bauarApproval
      return { approvalIds, decisions, alteredEvents, interceptedStreams } as ProtocolCapture
    })
    expect(capture.alteredEvents).toBe(0)
    expect(capture.approvalIds.length).toBeGreaterThan(0)
    expect(capture.decisions).toEqual([{ approval_id: capture.approvalIds[0], approved: false }])
    expect(await page.evaluate(() => (window as any).__bauarApprovalCase.approvals)).toBe(0)
    expect(existsSync(input.effectPath)).toBe(false)
    return { scenario: input.scenario, boundary: 'real scheduled task dispatch, headless UAR and filesystem', capture }
  } finally {
    await page.evaluate(async ({ agentId, taskId }) => {
      const result = await window.api.ipcApi.request('ai.agent.task.delete', { agentId, taskId }) as { ok: boolean }
      if (!result.ok) throw new Error('Headless fixture task cleanup failed')
    }, { agentId: input.agentId, taskId })
  }
}
