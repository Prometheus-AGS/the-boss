import { setTimeout as delay } from 'node:timers/promises'

import { normalizeHeaders } from '@ai-sdk/provider-utils'

import { ATTRIBUTION_NAME, ATTRIBUTION_URL } from '@shared/utils/branding'

export const defaultAppHeaders = () => {
  return {
    'HTTP-Referer': ATTRIBUTION_URL,
    'X-Title': ATTRIBUTION_NAME
  }
}

/**
 * Merge header records with case-insensitive last-writer-wins.
 *
 * A plain `{ ...defaults, ...extraHeaders }` keeps case variants of the same
 * name as separate keys — a default `User-Agent` plus a user-supplied
 * `user-agent` both reach the wire, and `new Headers(...).get()` comma-joins
 * them. Normalizing each part to lowercase first collapses them so the last
 * writer actually wins.
 *
 * @param parts - Header records in precedence order; later parts override earlier ones.
 * @returns A record with lowercase header names and no duplicates.
 */
export const mergeHeaders = (...parts: Array<Record<string, string | undefined> | undefined>): Record<string, string> =>
  Object.assign({}, ...parts.map(normalizeHeaders))

/** Retry throttled reads within the existing six-attempt, five-delay budget. */
export async function fetchWithRateLimitRetries(
  url: URL,
  init: RequestInit,
  beforeFetch?: () => Promise<void>
): Promise<Response> {
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') {
    await beforeFetch?.()
    return fetch(url, init)
  }
  let remainingDelay = 5 * 250
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await beforeFetch?.()
    const response = await fetch(url, init)
    if (response.status !== 429 || attempt === 5) return response
    const retryAfter = response.headers.get('retry-after') ?? ''
    const advertisedDelay = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()
    const wait = Number.isFinite(advertisedDelay) ? Math.max(250, advertisedDelay) : 250
    if (wait > remainingDelay) return response
    await response.body?.cancel()
    await delay(wait, undefined, { signal: init.signal ?? undefined })
    remainingDelay -= wait
  }
  throw new Error('Read request exhausted its rate-limit retries')
}
