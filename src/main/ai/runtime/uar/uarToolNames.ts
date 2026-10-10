import { createHash } from 'node:crypto'

export function toUarToolName(toolName: string): string {
  const wireName = toolName.startsWith('mcp__') ? toolName.slice(5) : toolName
  return encodeUarProviderToolName(wireName)
}

/** Match the pinned UAR MCP registry's provider-name encoding exactly. */
export function encodeUarProviderToolName(rawName: string): string {
  let name = Array.from(rawName, (character) => /^[A-Za-z0-9_-]$/.test(character) ? character : '_').join('')
  if (!/^[A-Za-z]/.test(name)) name = `t${name}`
  if (name.length > 64) {
    const suffix = createHash('sha256').update(rawName, 'utf8').digest('hex').slice(0, 12)
    name = `${name.slice(0, 51)}_${suffix}`
  }
  return name
}
