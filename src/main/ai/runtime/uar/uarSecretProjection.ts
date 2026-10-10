import { redactLiteral } from '@shared/utils/redaction'

import type { UarHistoryMessage } from './uarHostHistory'

export interface UarSecretStream {
  push(value: string): string
  finish(): string
}

export interface UarSecretProjection {
  text(value: string): string
  value(value: unknown): unknown
  error(value: unknown): unknown
  history(messages: readonly UarHistoryMessage[]): UarHistoryMessage[]
  withValues(values: Iterable<string>): UarSecretProjection
  stream(): UarSecretStream
}

export function collectUarMcpSecrets(
  snapshots: Iterable<{ headers?: Record<string, string>; env?: Record<string, string> } | undefined>
): string[] {
  const values: string[] = []
  for (const snapshot of snapshots) {
    values.push(...Object.values(snapshot?.env ?? {}), ...Object.values(snapshot?.headers ?? {}))
    for (const [name, value] of Object.entries(snapshot?.headers ?? {})) {
      if (!['authorization', 'proxy-authorization'].includes(name.toLowerCase())) continue
      const credential = /^(?:Bearer|Basic)\s+(.+)$/i.exec(value)?.[1]
      if (credential) values.push(credential)
    }
  }
  return values
}

/** The captured values remain private to one run; callers project content, never protocol envelopes. */
export function createUarSecretProjection(values: Iterable<string>): UarSecretProjection {
  const secrets = [...new Set(values)].filter((value) => value.length > 0).sort((left, right) => right.length - left.length)
  const text = (value: string): string => secrets.reduce((output, secret) => redactLiteral(output, secret), value)
  const project = (value: unknown, seen: WeakMap<object, unknown>): unknown => {
    if (typeof value === 'string') return text(value)
    if (!value || typeof value !== 'object') return value
    if (seen.has(value)) return seen.get(value)
    if (value instanceof Error) {
      const result = new Error(text(value.message))
      seen.set(value, result)
      result.name = text(value.name)
      result.stack = value.stack === undefined ? undefined : text(value.stack)
      if ('cause' in value) result.cause = project(value.cause, seen)
      for (const [key, item] of Object.entries(value)) {
        Object.defineProperty(result, text(key), {
          value: project(item, seen), enumerable: true, writable: true, configurable: true
        })
      }
      return result
    }
    if (Array.isArray(value)) {
      const result: unknown[] = []
      seen.set(value, result)
      for (const item of value) result.push(project(item, seen))
      return result
    }
    const result: Record<string, unknown> = {}
    seen.set(value, result)
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(result, text(key), {
        value: project(item, seen), enumerable: true, writable: true, configurable: true
      })
    }
    return result
  }
  const value = (input: unknown): unknown => project(input, new WeakMap())
  const jsonText = (input: string): string => {
    try {
      const parsed: unknown = JSON.parse(input)
      const projected = JSON.stringify(value(parsed))
      return projected === JSON.stringify(parsed) ? input : projected
    } catch {
      return text(input)
    }
  }
  return {
    text,
    value,
    error: value,
    stream: () => {
      let pending = ''
      return {
        push: (delta) => {
          pending += delta
          let output = ''
          let index = 0
          while (index < pending.length) {
            const remaining = pending.length - index
            if (secrets.some((secret) => secret.length > remaining && secret.startsWith(pending.slice(index)))) break
            const match = secrets.find((secret) => pending.startsWith(secret, index))
            if (match) {
              output += '<redacted>'
              index += match.length
            } else {
              output += pending[index]
              index += 1
            }
          }
          pending = pending.slice(index)
          return output
        },
        finish: () => {
          const output = pending ? '<redacted>' : ''
          pending = ''
          return output
        }
      }
    },
    history: (messages) => messages.map((message) => ({
      ...message,
      content: jsonText(message.content),
      ...(message.tool_calls ? {
        tool_calls: message.tool_calls.map((call) => ({
          ...call,
          function: { ...call.function, arguments: jsonText(call.function.arguments) }
        }))
      } : {})
    })),
    withValues: (additional) => createUarSecretProjection([...secrets, ...additional])
  }
}
