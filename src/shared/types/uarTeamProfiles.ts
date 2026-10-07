import * as z from 'zod'

export const uarReasoningSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('off') }).strict(),
  z.object({ mode: z.literal('explicit'), effort: z.enum(['none', 'low', 'medium', 'high', 'max']) }).strict()
])
export const uarExecutionProfileSchema = z
  .object({
    profile: z
      .object({ id: z.string().min(1).max(128), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
      .strict(),
    settingsRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    reasoning: uarReasoningSchema
  })
  .strict()
export type UarExecutionProfile = z.infer<typeof uarExecutionProfileSchema>
export interface UarExecutionFence {
  catalogId: string
  serviceInstanceId: string
  incarnationId: string
  epoch: number
}
export interface UarExecutionOwnerSnapshot {
  claim:
    | (UarExecutionFence & {
        state: 'held' | 'draining' | 'released'
        acquiredAt: string
        auditReceiptId: string
        releasedAt?: string
      })
    | null
  currentFence: UarExecutionFence
  ownsExecution: boolean
}
export interface UarExecutionReclaimInput {
  commandId: string
  catalogId: string
  expectedEpoch: number
  replacementServiceInstanceId: string
  reason: string
  fencingEvidenceRef: string
}
export interface UarExecutionReclaimReceipt {
  commandId: string
  requestDigest: string
  authenticatedActorId: string
  reason: string
  previousFence: UarExecutionFence
  replacementFence: UarExecutionFence
  authorizationDecisionRef: string
  fencingEvidenceRef: string
  transferredQueuedAttemptIds: string[]
  uncertainAttemptIds: string[]
  committedAt: string
}
export interface UarEffectiveModelReceipt {
  route: { providerId: string; modelId: string }
  wireModelAlias: string
  pricingIdentity?: { providerId: string; modelId: string; catalogRevision: string }
  endpointKind: string
  profile: { id: string; revision: number }
  settingsRevision: number
  requestedReasoning: z.infer<typeof uarReasoningSchema>
  effectiveReasoning: z.infer<typeof uarReasoningSchema>
  support: 'validated'
  supportEvidenceRef: string
  limits: { contextTokens?: number; outputTokens?: number; source: string; sourceRevision?: string }
  fit: { mode: 'settings-only'; guaranteedFit: false; reason: string }
}
export const uarTeamDiagnosticDetailsSchema = z.object({
  sourceStage: z
    .enum(['request-preparation', 'handoff-validation', 'provider-opening', 'handoff-recording', 'provider-stream'])
    .optional(),
  category: z
    .enum([
      'provider_authentication_failed',
      'provider_invalid_request',
      'provider_rate_limited',
      'provider_overloaded',
      'provider_timeout',
      'provider_transport_failed',
      'provider_stream_failed',
      'provider_budget_exceeded',
      'budget_admission_failed',
      'budget_root_cancelled',
      'budget_root_deadline_exceeded',
      'budget_usage_accounting_failed',
      'provider_external_error',
      'provider_internal_error',
      'collaboration_invalid',
      'collaboration_not_found',
      'collaboration_conflict',
      'collaboration_storage',
      'request_preparation_failed',
      'unclassified'
    ])
    .optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  collaborationCode: z
    .enum([
      'TEAM_SCOPE_DENIED',
      'TEAM_EDGE_DENIED',
      'TEAM_CONTEXT_REQUIRED_UNSUPPORTED',
      'TEAM_CONTEXT_REQUIRED_TOO_LARGE',
      'TEAM_REVISION_CONFLICT',
      'TEAM_EXECUTION_EPOCH_STALE',
      'TEAM_EXECUTION_OWNER_CONFLICT',
      'TEAM_COMMAND_CONFLICT',
      'TEAM_BUDGET_EXHAUSTED',
      'TEAM_PROFILE_UNSUPPORTED',
      'TEAM_ROUTE_PROFILE_MISMATCH'
    ])
    .optional()
})
export interface UarTeamDiagnostic extends z.infer<typeof uarTeamDiagnosticDetailsSchema> {
  code: string
  field?: string
  retryable: boolean
  action: 'rebind' | 'change-settings' | 'reconcile' | 'contact-operator' | 'none'
  protectedDiagnosticRef?: string
}
