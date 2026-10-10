import * as z from 'zod'

const selector = z.string().min(1).max(256)
const revision = z.number().int().nonnegative()
export const uarConnectorProviderSchema = z.enum(['github', 'notion', 'slack', 'jira'])
export const uarConnectorActionSchema = z.enum(['read', 'draft', 'write', 'send', 'publish'])
export const uarConnectorWorkspaceSchema = z.object({ workspaceId: selector }).strict()
export const uarConnectorSelectorSchema = uarConnectorWorkspaceSchema.extend({ effectId: selector })
export const uarConnectorReconcileSchema = uarConnectorSelectorSchema.extend({
  expectedPayloadDigest: selector,
  disposition: z.enum(['confirmed', 'not_applied']),
  externalId: selector.optional(), evidenceRef: selector,
  independentlyChecked: z.literal(true)
}).refine((value) => value.disposition !== 'confirmed' || Boolean(value.externalId))
export const uarConnectorSaveSchema = uarConnectorWorkspaceSchema.extend({
  id: selector.optional(), expectedRevision: revision.optional(), provider: uarConnectorProviderSchema,
  target: selector, site: z.string().url().optional(),
  allowedActions: z.array(uarConnectorActionSchema).min(1),
  credential: z.string().min(1).max(4096).optional(), revoked: z.boolean().optional(),
  approvalMode: z.enum(['explicit_customer', 'standing_policy']).optional()
})
export const uarConnectorPrepareSchema = uarConnectorWorkspaceSchema.extend({
  bindingId: selector, expectedBindingRevision: revision, action: uarConnectorActionSchema,
  egressLabels: z.array(selector).min(1), decisionRef: selector.optional(),
  payload: z.record(z.string(), z.unknown()).refine((value) => new TextEncoder().encode(JSON.stringify(value)).length <= 65_536)
})
export const uarConnectorBindingSchema = z.object({
  id: selector, ownerId: selector, workspaceId: selector, revision, provider: uarConnectorProviderSchema,
  approvalMode: z.enum(['explicit_customer', 'standing_policy']).default('explicit_customer'),
  target: selector, site: z.string().nullable().optional(), credentialRef: selector, revoked: z.boolean(),
  allowedActions: z.array(uarConnectorActionSchema), allowedEgressLabels: z.array(selector)
})
export const uarConnectorPublicBindingSchema = uarConnectorBindingSchema.omit({ credentialRef: true }).extend({
  credentialConfigured: z.boolean(), managedByHost: z.boolean()
})
export const uarConnectorEffectSchema = z.object({
  id: selector, ownerId: selector, workspaceId: selector, bindingId: selector, bindingRevision: revision,
  provider: uarConnectorProviderSchema, target: selector, action: uarConnectorActionSchema,
  egressLabels: z.array(selector), decisionRef: z.string().nullable(), payloadDigest: selector,
  status: z.enum(['draft', 'prepared', 'dispatched', 'confirmed', 'rejected', 'uncertain', 'cancelled', 'not_applied']),
  dispatchId: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
  receipt: z.object({ disposition: z.string(), externalId: z.string().nullable(), evidenceRef: z.string().nullable(),
    result: z.unknown().nullable(), recordedAt: z.string() }).nullable()
})
export const uarConnectorSnapshotSchema = z.object({
  workspaceId: selector, bindings: z.array(uarConnectorPublicBindingSchema), effects: z.array(uarConnectorEffectSchema)
})
export type UarConnectorBinding = z.infer<typeof uarConnectorBindingSchema>
export type UarConnectorEffect = z.infer<typeof uarConnectorEffectSchema>
export type UarConnectorSaveInput = z.infer<typeof uarConnectorSaveSchema>
export type UarConnectorPrepareInput = z.infer<typeof uarConnectorPrepareSchema>
export type UarConnectorSelector = z.infer<typeof uarConnectorSelectorSchema>
export type UarConnectorReconcileInput = z.infer<typeof uarConnectorReconcileSchema>
