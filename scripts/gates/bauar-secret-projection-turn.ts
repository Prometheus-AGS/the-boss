import { expect, type Page } from '@playwright/test'

type FailedTurn = { available: boolean; done: boolean; cancelled: boolean; streamErrorPresent: boolean;
  streamCategory: string; chunkCount: number; approvalRequests: number; approvalDecisionsSent: number }
let failedTurn: FailedTurn | null = null
export function readFailedTurnDiagnostic(): FailedTurn | null { return failedTurn }

export function registrationReason(value: unknown): string {
  const message = typeof value === 'string' ? value : value instanceof Error ? value.message : ''
  for (const [prefix, category] of [
    ['UAR catalog lookup failed (HTTP ', 'catalog_lookup_http'],
    ['UAR catalog registration failed (HTTP ', 'catalog_registration_http'],
    ['UAR catalog update failed (HTTP ', 'catalog_update_http'],
    ['UAR rejected the run (HTTP ', 'run_admission_http'],
    ['UAR stream failed (HTTP ', 'stream_http'],
    ['UAR sidecar readiness timed out: ', 'sidecar_readiness_timeout'],
    ['UAR sidecar exited before readiness (', 'sidecar_exit_before_ready'],
    ['Failed to launch UAR sidecar: ', 'sidecar_launch_failed'],
    ['UAR sidecar capability check failed with HTTP ', 'sidecar_capability_http'],
    ['UAR sidecar is missing required capabilities: ', 'sidecar_capabilities_missing']
  ] as const) if (message.startsWith(prefix)) return category
  if (message === 'A dynamic import callback was not specified.' ||
    message === 'electronApplication.evaluate: TypeError: A dynamic import callback was not specified.') return 'serialized_dynamic_import_unavailable'
  if (message === '__name is not defined' ||
    message === 'electronApplication.evaluate: ReferenceError: __name is not defined') return 'serialized_name_helper_missing'
  if (message.startsWith('UAR agent ') && message.endsWith(' has no model configured')) return 'runtime_model_missing'
  if (message.startsWith('UAR agent ') && message.endsWith(' is unavailable')) return 'runtime_agent_unavailable'
  if (message.startsWith('Provider "') && message.endsWith('" is not compatible with Universal Agent Runtime')) return 'model_provider_incompatible'
  if (message.startsWith('Provider "') && message.endsWith('" has no API key configured')) return 'model_credential_unavailable'
  for (const [literal, category] of [
    ['Protected admission content cannot be published', 'protected_admission_refused'],
    ['Failed to create the run orchestrator', 'orchestrator_start_failed'],
    ['Skill selection could not be reconciled; read selection state before retrying', 'skill_selection_unavailable'],
    ['UAR sidecar restarted before the request was admitted', 'sidecar_generation_changed'],
    ['UAR sidecar is shutting down', 'sidecar_stopping'],
    ['UAR protected authority could not be provisioned', 'sidecar_authority_unavailable'],
    ['UAR sidecar exited immediately after becoming ready', 'sidecar_exit_after_ready'],
    ['UAR sidecar reported an invalid readiness port', 'sidecar_readiness_invalid'],
    ['UAR sidecar capability response is invalid', 'sidecar_capabilities_invalid'],
    ['UAR runtime connection is closed', 'runtime_connection_closed'],
    ['UAR agent is unavailable', 'runtime_agent_unavailable'],
    ['The selected liter-llm gateway has no credential configured', 'model_credential_unavailable'],
    ['UAR stream returned no body', 'stream_body_missing'],
    ['UAR emitted an AG-UI event without an SSE event ID', 'stream_sse_id_missing'],
    ['UAR emitted invalid AG-UI JSON', 'stream_json_invalid'],
    ['UAR emitted an invalid AG-UI event', 'stream_event_invalid'],
    ['UAR emitted an event for the wrong run', 'stream_run_mismatch'],
    ['UAR emitted an unsupported AG-UI profile', 'stream_profile_unsupported'],
    ['UAR emitted an AG-UI event without stable ordering metadata', 'stream_ordering_missing'],
    ['UAR started a step before the active step finished', 'stream_step_overlap'],
    ['UAR finished an unexpected step', 'stream_step_mismatch'],
    ['projection_snapshot_source_cursor_missing', 'snapshot_source_cursor_missing'],
    ['projection_snapshot_source_order_invalid', 'snapshot_source_order_invalid'],
    ['projection_snapshot_source_run_failed', 'snapshot_source_run_failed'],
    ['projection_snapshot_step_order_invalid', 'snapshot_step_order_invalid'],
    ['projection_snapshot_nonterminal_cursor_unavailable', 'snapshot_nonterminal_cursor_unavailable'],
    ['Actual snapshot stream returned no body', 'snapshot_stream_body_missing']
  ] as const) if (message === literal) return category
  if (message === 'UAR returned an invalid run response') return 'invalid_run_response'
  if (message === 'UAR stream ended before a terminal event') return 'stream_ended_before_terminal'
  if (message === 'Projection gate stream did not open') return 'stream_open_rejected'
  if (message === 'Actual run inspection failed') return 'run_inspection_http'
  return message ? 'unclassified' : 'none'
}

export function registrationErrorDiagnostic(value: unknown) {
  const message = typeof value === 'string' ? value : value instanceof Error ? value.message : ''
  const name = value instanceof Error ? value.name : ''
  const nameCategory = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'AggregateError', 'AssertionError', 'ZodError'].includes(name)
    ? name : name ? 'other' : 'unavailable'
  const status = /^(?:UAR (?:catalog (?:lookup|registration|update) failed|rejected the run|stream failed) \(HTTP ([1-5][0-9]{2})\)|UAR sidecar capability check failed with HTTP ([1-5][0-9]{2})(?:$|\s))/.exec(message)
  return { category: registrationReason(value), nameCategory, messagePresent: Boolean(message),
    httpStatus: status ? Number(status[1] ?? status[2]) : null }
}
export type ProjectionApprovalCapture = {
  requests: Array<{ id: string; name: string | undefined; matchingInputStarts: number }>; accepted: string[]
}
export async function runTurn(
  page: Page, topicId: string, modelId: string,
  options: { text?: string; approve?: boolean; cancel?: boolean } = {}
): Promise<{ error: string; chunks: string; approvals: ProjectionApprovalCapture;
  diagnostic: { openAccepted: boolean; streamErrorEvents: number; streamErrorName: string; streamErrorStatus: number | null;
    done: boolean; chunkCount: number; error: ReturnType<typeof registrationErrorDiagnostic> } }> {
  failedTurn = null
  await page.evaluate(async ({ topicId, modelId, options }) => {
    const state = { done: false, error: '', cancelled: false, openAccepted: false, streamErrorEvents: 0,
      streamErrorName: 'unavailable', streamErrorStatus: null as number | null,
      approvalDecisionsSent: 0, approvals: { requests: [], accepted: [] } as ProjectionApprovalCapture, chunks: [] as unknown[], off: [] as Array<() => void> }
    ;(window as any).__bauarProjectionTurn = state
    state.off.push(window.api.ipcApi.on('ai.stream.chunk', (payload: any) => {
      if (payload.topicId !== topicId) return
      state.chunks.push(payload.chunk)
      if (options.approve && payload.chunk?.type === 'tool-approval-request') {
        const inputs = state.chunks.filter((chunk: any) =>
          chunk?.type === 'tool-input-start' && chunk.toolCallId === payload.chunk.toolCallId) as Array<{ toolName: string }>
        state.approvals.requests.push({ id: payload.chunk.approvalId,
          name: inputs.length === 1 ? inputs[0].toolName : undefined, matchingInputStarts: inputs.length })
        state.approvalDecisionsSent += 1
        void window.api.ipcApi.request('ai.tool.respond_approval', {
          topicId, approvalId: payload.chunk.approvalId, approved: true
        }).then((result: any) => {
          if (!result.ok || result.data?.ok === false) state.error = 'Actual projection approval was rejected'
          else state.approvals.accepted.push(payload.chunk.approvalId)
        }).catch(() => { state.error = 'Projection approval request failed' })
      }
      if (options.cancel && !state.cancelled && payload.chunk?.type === 'text-delta') {
        state.cancelled = true
        void window.api.ipcApi.request('ai.stream.abort', { topicId }).then((result: any) => {
          if (result.ok) state.done = true
          else state.error = 'Projection cancellation was rejected'
        }).catch(() => { state.error = 'Projection cancellation failed' })
      }
    }))
    state.off.push(window.api.ipcApi.on('ai.stream.done', (payload: any) => {
      if (payload.topicId === topicId && payload.isTopicDone) state.done = true
    }))
    state.off.push(window.api.ipcApi.on('ai.stream.error', (payload: any) => {
      if (payload.topicId !== topicId) return
      state.error = payload.error?.message ?? 'Unknown stream error'
      state.streamErrorEvents += 1
      const name = payload.error?.name
      state.streamErrorName = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'AggregateError', 'AssertionError', 'ZodError'].includes(name)
        ? name : typeof name === 'string' && name ? 'other' : 'unavailable'
      const status = payload.error?.statusCode
      state.streamErrorStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null
    }))
    const result = await window.api.ipcApi.request('ai.stream.open', {
      trigger: 'submit-message', topicId, mentionedModelIds: [modelId],
      userMessageParts: [{ type: 'text', text: options.text ?? 'Reply with the benign projection gate marker.' }]
    }) as { ok: boolean }
    state.openAccepted = result.ok
    if (!result.ok) throw new Error('Projection gate stream did not open')
  }, { topicId, modelId, options })
  try {
    await expect.poll(() => page.evaluate(() => {
      const state = (window as any).__bauarProjectionTurn
      return Boolean(state.done || state.error)
    }), { timeout: 180_000 }).toBe(true)
    const result = await page.evaluate(() => {
      const state = (window as any).__bauarProjectionTurn
      return { error: state.error as string, chunks: JSON.stringify(state.chunks), approvals: state.approvals as ProjectionApprovalCapture,
        diagnostic: { openAccepted: Boolean(state.openAccepted), streamErrorEvents: Number(state.streamErrorEvents),
          streamErrorName: state.streamErrorName as string, streamErrorStatus: state.streamErrorStatus as number | null,
          done: Boolean(state.done), chunkCount: state.chunks.length as number } }
    })
    return { ...result, diagnostic: { ...result.diagnostic, error: registrationErrorDiagnostic(result.error) } }
  } catch (error) {
    const snapshot = await page.evaluate(() => {
      const state = (window as any).__bauarProjectionTurn
      return state ? { done: Boolean(state.done), cancelled: Boolean(state.cancelled), error: String(state.error ?? ''),
        chunkCount: state.chunks.length,
        approvalRequests: state.chunks.filter((chunk: any) => chunk?.type === 'tool-approval-request').length,
        approvalDecisionsSent: state.approvalDecisionsSent } : null
    }).catch(() => null)
    failedTurn = snapshot ? { available: true, done: snapshot.done, cancelled: snapshot.cancelled,
      streamErrorPresent: Boolean(snapshot.error), streamCategory: registrationReason(snapshot.error),
      chunkCount: snapshot.chunkCount, approvalRequests: snapshot.approvalRequests,
      approvalDecisionsSent: snapshot.approvalDecisionsSent } : null
    throw error
  } finally {
    await page.evaluate(() => {
      const state = (window as any).__bauarProjectionTurn
      for (const off of state.off) off()
      delete (window as any).__bauarProjectionTurn
    })
  }
}
