import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js'

import { type McpOutputProjection, projectMcpToolResult } from '@main/ai/mcp/types'

/** Wrap an owned server transport, leaving incoming authority and public SDK correlation intact. */
export function createUarProjectedMcpTransport(
  transport: Transport,
  projection: () => McpOutputProjection
): Transport {
  const toolRequests = new Set<RequestId>()
  const wrapped: Transport = {
    start: () => transport.start(),
    close: () => transport.close(),
    get sessionId() { return transport.sessionId },
    setProtocolVersion: (version) => transport.setProtocolVersion?.(version),
    async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
      const project = projection()
      let output = message
      if ('result' in message) {
        if (toolRequests.delete(message.id)) {
          output = { ...message, result: projectMcpToolResult(
            message.result as typeof message.result & { content?: unknown; structuredContent?: unknown }, project
          ) }
        }
      } else if ('error' in message) {
        if (message.id !== undefined) toolRequests.delete(message.id)
        output = { ...message, error: {
          ...message.error,
          message: project.text(message.error.message),
          ...('data' in message.error ? { data: project.value(message.error.data) } : {})
        } }
      } else if (message.method === 'notifications/progress' && typeof message.params?.message === 'string') {
        output = { ...message, params: { ...message.params, message: project.text(message.params.message) } }
      } else if (message.method === 'notifications/message' && message.params) {
        output = { ...message, params: { ...message.params, data: project.value(message.params.data) } }
      }
      try {
        await transport.send(output, options)
      } catch (error) {
        throw project.error(error)
      }
    }
  }
  transport.onmessage = (message, extra) => {
    if ('method' in message && message.method === 'tools/call' && 'id' in message) toolRequests.add(message.id)
    wrapped.onmessage?.(message, extra)
  }
  transport.onerror = (error) => wrapped.onerror?.(projection().error(error) as Error)
  transport.onclose = () => {
    toolRequests.clear()
    wrapped.onclose?.()
  }
  return wrapped
}
