import { createHash } from 'node:crypto'

export function toUarToolName(toolName: string): string {
  const wireName = toolName.startsWith('mcp__') ? toolName.slice(5) : toolName
  return sanitizeUarProviderToolName(wireName)
}

/** Mirror UAR's registry mapping for its exact server-name/tool-name pair. */
export function sanitizeUarProviderToolName(wireName: string): string {
  const normalized = wireName.replace(/[^A-Za-z0-9_-]/g, '_')
  const prefixed = /^[A-Za-z]/.test(normalized) ? normalized : `t${normalized}`
  if (prefixed.length <= 64) return prefixed
  return `${prefixed.slice(0, 51)}_${createHash('sha256').update(wireName).digest('hex').slice(0, 12)}`
}
