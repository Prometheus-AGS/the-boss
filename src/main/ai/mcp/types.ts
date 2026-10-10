import type { McpResource } from '@shared/types/mcp'

/** Optional per-call ordinary-content projection; never applied to executable input. */
export interface McpOutputProjection {
  text(value: string): string
  value(value: unknown): unknown
  error(value: unknown): unknown
}

/** Preserve result controls and binary encodings while projecting readable tool content. */
export function projectMcpToolResult<T extends { content?: unknown; structuredContent?: unknown }>(
  result: T,
  projection: McpOutputProjection
): T {
  const readable = (input: Record<string, unknown>, fields: string[]): Record<string, unknown> => {
    const output = { ...input }
    for (const field of fields) {
      if (typeof input[field] === 'string') output[field] = projection.text(input[field])
    }
    return output
  }
  return {
    ...result,
    ...(Array.isArray(result.content) ? {
      content: result.content.map((part: Record<string, unknown>) => ({
        ...readable(part, ['text', 'name', 'title', 'description', 'uri']),
        ...(part.resource && typeof part.resource === 'object' ? {
          resource: readable(part.resource as Record<string, unknown>, ['text', 'uri'])
        } : {})
      }))
    } : {}),
    ...('structuredContent' in result ? { structuredContent: projection.value(result.structuredContent) } : {})
  }
}

/**
 * MCP tool-call / resource protocol response shapes. Main-process only — the
 * renderer surfaces tool results via `McpToolResponse` (renderer types), not
 * these raw protocol shapes. Verified renderer-unused on both `main` and the
 * feat/chat-page (v2) branch.
 */
export interface McpToolResultContent {
  type: 'text' | 'image' | 'audio' | 'resource'
  text?: string
  data?: string
  mimeType?: string
  resource?: {
    uri?: string
    text?: string
    mimeType?: string
    blob?: string
  }
}

export interface McpCallToolResponse {
  content: McpToolResultContent[]
  structuredContent?: unknown
  isError?: boolean
}

export interface GetResourceResponse {
  contents: McpResource[]
}
