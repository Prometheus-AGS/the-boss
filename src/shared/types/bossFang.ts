import * as z from 'zod'

export const bossFangConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownership: z.enum(['managed', 'external']),
    host: z.literal('127.0.0.1'),
    port: z.number().int().min(1).max(65535),
    portPolicy: z.enum(['automatic', 'fixed']),
    externalEndpoint: z.string().max(2048),
    uarInstanceId: z.string().min(1).max(128),
    diagnosticModelId: z.string().max(256),
    workspaceId: z.string().max(256)
  })
  .strict()
export type BossFangConfig = z.infer<typeof bossFangConfigSchema>

export const bossFangLogSchema = z.object({
  sequence: z.number().int().nonnegative(),
  occurredAt: z.string(),
  level: z.enum(['info', 'warning', 'error']),
  message: z.string()
})
export const bossFangStatusSchema = z.object({
  status: z.enum(['stopped', 'starting', 'running', 'error']),
  ownership: z.enum(['managed', 'external']),
  configured: z.boolean(),
  requested: bossFangConfigSchema,
  effective: z
    .object({
      origin: z.string(),
      port: z.number().int(),
      uarInstanceId: z.string().nullable(),
      uarGeneration: z.number().int().nullable(),
      grantExpiresAt: z.string().nullable()
    })
    .nullable(),
  restartRequired: z.boolean(),
  url: z.string().optional(),
  error: z.string().nullable(),
  connection: z.enum(['disconnected', 'connecting', 'connected', 'error']),
  connectionError: z.string().nullable(),
  lastDiagnosticId: z.string().nullable(),
  logs: z.array(bossFangLogSchema)
})
export type BossFangStatus = z.infer<typeof bossFangStatusSchema>

export const bossFangDiagnosticChecksSchema = z.object({
  listening: z.enum(['unknown', 'pending', 'running', 'succeeded', 'failed']),
  authenticated: z.enum(['unknown', 'pending', 'running', 'succeeded', 'failed']),
  compatible: z.enum(['unknown', 'pending', 'running', 'succeeded', 'failed']),
  delegationOperational: z.enum(['unknown', 'pending', 'running', 'succeeded', 'failed'])
})
export const bossFangDiagnosticSchema = z.object({
  id: z.string(),
  status: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  instanceId: z.string(),
  workspaceId: z.string(),
  model: z.string(),
  taskId: z.string().nullable(),
  cancellation: z
    .object({ requested: z.boolean(), acknowledged: z.boolean(), terminal: z.boolean(), cleanupUncertain: z.boolean() })
    .nullable(),
  checks: bossFangDiagnosticChecksSchema.default(
    () =>
      ({
        listening: 'unknown',
        authenticated: 'unknown',
        compatible: 'unknown',
        delegationOperational: 'unknown'
      }) as const
  ),
  stages: z.array(
    z.object({
      stage: z.enum(['connection', 'models', 'admission', 'delegation', 'completion']),
      status: z.enum(['pending', 'running', 'succeeded', 'failed']),
      detail: z.string()
    })
  ),
  events: z.array(
    z.object({ cursor: z.number(), type: z.string(), occurredAt: z.string().optional(), detail: z.string() })
  ),
  usage: z.object({ inputTokens: z.number().nullable(), outputTokens: z.number().nullable() }).nullable(),
  error: z.string().nullable(),
  action: z
    .enum(['configure_credentials', 'select_uar', 'select_workspace', 'select_model', 'retry', 'open_dashboard'])
    .nullable()
})
export type BossFangDiagnostic = z.infer<typeof bossFangDiagnosticSchema>
