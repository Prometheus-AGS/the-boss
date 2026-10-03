import * as z from 'zod'

import { defineRoute } from '../define'

const status = z.enum(['stopped', 'starting', 'running', 'error'])

export const bossFangRequestSchemas = {
  'bossfang.start': defineRoute({
    input: z.void(),
    output: z.discriminatedUnion('success', [
      z.object({ success: z.literal(true), url: z.string().url() }),
      z.object({ success: z.literal(false), reason: z.enum(['not_installed', 'credentials_required', 'startup_failed']), message: z.string() })
    ])
  }),
  'bossfang.status': defineRoute({
    input: z.void(),
    output: z.object({ status, configured: z.boolean(), url: z.string().url().optional() })
  }),
  'bossfang.configure_credentials': defineRoute({
    input: z.object({ username: z.string().trim().min(1).max(128), password: z.string().min(16) }),
    output: z.object({ success: z.literal(true) })
  }),
  'bossfang.stop': defineRoute({
    input: z.void(),
    output: z.object({ success: z.boolean(), message: z.string().optional() })
  })
}
