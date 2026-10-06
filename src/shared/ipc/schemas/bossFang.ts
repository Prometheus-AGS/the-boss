import * as z from 'zod'

import { bossFangConfigSchema, bossFangDiagnosticSchema, bossFangStatusSchema } from '@shared/types/bossFang'

import { defineRoute } from '../define'

const result = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), url: z.string().url() }),
  z.object({
    success: z.literal(false),
    reason: z.enum(['not_installed', 'credentials_required', 'startup_failed', 'external_unavailable']),
    message: z.string()
  })
])
export const bossFangRequestSchemas = {
  'bossfang.start': defineRoute({ input: z.void(), output: result }),
  'bossfang.status': defineRoute({ input: z.void(), output: bossFangStatusSchema }),
  'bossfang.configure': defineRoute({ input: bossFangConfigSchema, output: bossFangStatusSchema }),
  'bossfang.configure_credentials': defineRoute({
    input: z.object({ username: z.string().trim().min(1).max(128), password: z.string().min(16).max(16384) }).strict(),
    output: z.object({ success: z.literal(true) })
  }),
  'bossfang.restart': defineRoute({ input: z.void(), output: result }),
  'bossfang.stop': defineRoute({
    input: z.void(),
    output: z.object({ success: z.boolean(), message: z.string().optional() })
  }),
  'bossfang.connect': defineRoute({ input: z.void(), output: bossFangStatusSchema }),
  'bossfang.disconnect': defineRoute({ input: z.void(), output: bossFangStatusSchema }),
  'bossfang.models': defineRoute({
    input: z.void(),
    output: z.array(z.object({ id: z.string(), name: z.string(), provider: z.string(), modelId: z.string() }))
  }),
  'bossfang.diagnostic.start': defineRoute({
    input: z.object({ model: z.string().trim().min(1).max(256) }).strict(),
    output: bossFangDiagnosticSchema
  }),
  'bossfang.diagnostic.status': defineRoute({ input: z.object({ id: z.string() }), output: bossFangDiagnosticSchema }),
  'bossfang.diagnostic.cancel': defineRoute({ input: z.object({ id: z.string() }), output: bossFangDiagnosticSchema }),
  'bossfang.diagnostic.export': defineRoute({
    input: z.object({ id: z.string().optional() }),
    output: z.object({ saved: z.boolean() })
  })
}

export type BossFangEventSchemas = {
  'bossfang.diagnostic.progress': import('@shared/types/bossFang').BossFangDiagnostic
}
