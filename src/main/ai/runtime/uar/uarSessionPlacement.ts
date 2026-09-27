import * as z from 'zod'

import { MANAGED_UAR_INSTANCE_ID, type UarSessionPlacement } from '@shared/types/uarServiceInstance'

const PREFIX = 'uarp1.'
const placementSchema = z
  .object({
    version: z.literal(1),
    instanceId: z.string().min(1).max(128),
    nativeSessionId: z.string().min(1).max(512),
    bindingId: z.string().min(1).max(256).optional(),
    bindingRevision: z.number().int().nonnegative().optional(),
    sourceRunId: z.string().min(1).max(256).optional()
  })
  .strict()

export function encodeUarSessionPlacement(placement: UarSessionPlacement): string {
  return `${PREFIX}${Buffer.from(JSON.stringify(placementSchema.parse(placement))).toString('base64url')}`
}

export function isStructuredUarSessionPlacement(token: string): boolean {
  return token.startsWith(PREFIX)
}

export function decodeUarSessionPlacement(
  token: string | undefined,
  fallbackNativeSessionId: string
): UarSessionPlacement {
  if (!token) return { version: 1, instanceId: '', nativeSessionId: fallbackNativeSessionId }
  if (!token.startsWith(PREFIX)) {
    return { version: 1, instanceId: MANAGED_UAR_INSTANCE_ID, nativeSessionId: token }
  }
  try {
    return placementSchema.parse(JSON.parse(Buffer.from(token.slice(PREFIX.length), 'base64url').toString('utf8')))
  } catch {
    throw new Error('The persisted UAR placement token is invalid; reattachment was refused')
  }
}
