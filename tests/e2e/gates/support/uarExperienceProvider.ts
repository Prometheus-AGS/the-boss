import { existsSync, readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { join } from 'node:path'

const OUTPUT_NAME = 'gate-v-approved.txt'
const OUTPUT_MARKER = 'Gate V approved filesystem operation.'

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content)
  } catch {
    return ''
  }
}

function reportsToolError(content: unknown): boolean {
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>
    if (record.isError === true || record.is_error === true) return true
  }

  const text = toolResultText(content).trim()
  if (!text) return true
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      if (record.isError === true || record.is_error === true || record.error) return true
    }
  } catch {
    // Plain-text tool results are valid. Check their explicit failure markers below.
  }
  return /(?:^|\b)(?:tool execution failed|invalid params|error:|failed to write)(?:\b|$)/i.test(text)
}

function diagnosticRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function toolResultDiagnostic(content: unknown) {
  const record = diagnosticRecord(content)
  const provenance = diagnosticRecord(record?.provenance)
  const message = typeof record?.message === 'string' ? record.message : ''
  let category = 'unclassified'
  let hostPreparationStatus: string | null = null
  const preparationPrefix = 'Tool call rejected: Host preparation failed: '
  if (diagnosticRecord(message)?.type === 'invalid_arguments') category = 'invalid_arguments'
  else if (message.startsWith(preparationPrefix)) {
    const reason = message.slice(preparationPrefix.length)
    const status = /^Paired host rejected tool admission \(HTTP (\d{3})\)$/.exec(reason)?.[1]
    const exactReasons: Record<string, string> = {
      'Paired host returned an unmanaged admission preparation': 'host_preparation_unmanaged',
      'Host preparation does not match the prepared invocation': 'host_preparation_binding_mismatch',
      'Unsupported tool admission protocol version': 'host_preparation_protocol',
      'Tool authority envelope is incomplete': 'host_preparation_incomplete',
      'Tool payload no longer matches its authority binding': 'host_preparation_payload_binding',
      'Tool lease or budget reservation does not match its authority binding': 'host_preparation_lease_binding',
      'Tool lease or budget reservation expired before claim': 'host_preparation_lease_expired',
      'Tool authority envelope digest does not match its fields': 'host_preparation_digest',
      'Tool admission preparation was not persisted': 'host_preparation_persistence'
    }
    if (status) {
      category = 'host_preparation_http'
      hostPreparationStatus = ['403', '404', '409', '422', '500', '503'].includes(status) ? status : 'other'
    } else if (Object.hasOwn(exactReasons, reason)) category = exactReasons[reason]
    else if (reason.startsWith('Tool admission preparation was not persisted and host invalidation failed: ')) {
      category = 'host_preparation_persistence_invalidation'
    } else category = 'host_preparation_unclassified'
  } else if (message === 'Tool call rejected: Tool call is denied by the host policy') category = 'host_policy_denied'
  else if (message.startsWith("Tool call rejected: Tool '") && message.endsWith("' is denied by the effective run policy")) {
    category = 'effective_policy_denied'
  } else if (message.startsWith("Tool call rejected: Tool '") && message.endsWith("' is denied by governance policy")) {
    category = 'governance_policy_denied'
  } else if (message.startsWith('Tool call rejected: Host admission failed: ')) category = 'host_resolution_failed'
  return {
    statusError: record?.status === 'error',
    terminalFailed: provenance?.terminal_state === 'failed',
    trustedHost: provenance?.observed_by === 'trusted_host',
    category, hostPreparationStatus
  }
}

function rejectToolResult(response: ServerResponse, message: string): void {
  response.writeHead(422, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { message } }))
}

export function sendGateVCompletion(
  response: ServerResponse,
  model: string,
  body: Record<string, any>,
  workspace: string
): void {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const tools = Array.isArray(body.tools) ? body.tools : []
  const toolMessages = messages.filter((message: any) => message?.role === 'tool')
  const afterTool = toolMessages.length > 0
  const writeTool = tools.find((tool: any) => tool?.function?.name?.endsWith('__write_file'))?.function?.name
  const failedResult = toolMessages.find((message: any) => reportsToolError(message?.content))
  const output = join(workspace, OUTPUT_NAME)
  const effectExists = existsSync(output)
  const effectMarkerPresent = effectExists && readFileSync(output, 'utf8').includes(OUTPUT_MARKER)
  // One scalar checkpoint per actual provider request. No prompt, result,
  // function name, correlation ID or filesystem path leaves this fixture.
  console.error(JSON.stringify({ approvalProviderCheckpoint: {
    afterTool, toolResultCount: toolMessages.length, errorDetectorMatched: Boolean(failedResult),
    writeToolAdvertised: Boolean(writeTool),
    expectedWriteCallInHistory: messages.some((message: any) => message?.role === 'assistant'
      && message.tool_calls?.some((call: any) => call?.id === 'gate-v-write'
        && call.function?.name?.endsWith('__write_file'))),
    allToolResultsMatchExpectedCall: afterTool && toolMessages.every((message: any) => message.tool_call_id === 'gate-v-write'),
    effectExists, effectMarkerPresent,
    toolResults: toolMessages.map((message: any) => toolResultDiagnostic(message?.content))
  } }))

  if (afterTool) {
    if (failedResult) {
      rejectToolResult(response, 'Gate V fixture rejected an error tool result')
      return
    }
    if (!effectMarkerPresent) {
      rejectToolResult(response, 'Gate V fixture refused to narrate success before the filesystem effect existed')
      return
    }
  }

  const delta =
    !afterTool && writeTool
      ? {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'gate-v-write',
              type: 'function',
              function: {
                name: writeTool,
                arguments: JSON.stringify({
                  path: OUTPUT_NAME,
                  content: `${OUTPUT_MARKER}\n`
                })
              }
            }
          ]
        }
      : { role: 'assistant', content: 'Gate V completed after the approved filesystem operation.' }
  const finishReason = !afterTool && writeTool ? 'tool_calls' : 'stop'
  const chunk = (value: Record<string, unknown>, finish_reason: string | null) =>
    `data: ${JSON.stringify({
      id: 'gate-v-completion',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1_000),
      model,
      choices: [{ index: 0, delta: value, finish_reason }]
    })}\n\n`
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  response.write(chunk(delta, null))
  response.write(chunk({}, finishReason))
  response.end('data: [DONE]\n\n')
}
