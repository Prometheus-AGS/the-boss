import * as z from 'zod'
import { uarFeedbackControlSchema, uarFeedbackSelectorSchema, uarFeedbackWorkspaceSchema } from './uarFeedback'

const selector = z.string().min(1).max(256)
const revision = z.number().int().nonnegative()
export const uarFeedbackPolicySchema = z.object({
  id: selector, ownerId: selector, workspaceId: selector, revision, source: z.enum(['direct', 'bossfang']),
  connectorBindingId: selector, egressLabel: selector, enabled: z.boolean(), updatedAt: z.string()
})
export const uarFeedbackPolicySaveSchema = uarFeedbackWorkspaceSchema.extend({
  id: selector.optional(), expectedRevision: revision.optional(), source: z.enum(['direct', 'bossfang']),
  connectorBindingId: selector, egressLabel: selector, enabled: z.boolean()
})
export const uarFeedbackPolicyAuthorizeSchema = uarFeedbackSelectorSchema.extend({
  policyId: selector, expectedPolicyRevision: revision
})
export const uarFeedbackReviewSchema = uarFeedbackControlSchema.extend({
  role: z.enum(['product', 'design', 'reviewer']), artifactId: selector
})
export const uarFeedbackImplementationSchema = uarFeedbackControlSchema.extend({
  artifactIds: z.array(selector).min(1), decision: z.enum(['admit', 'reject'])
})
export type UarFeedbackPolicy = z.infer<typeof uarFeedbackPolicySchema>
export type UarFeedbackPolicySaveInput = z.infer<typeof uarFeedbackPolicySaveSchema>
export type UarFeedbackPolicyAuthorizeInput = z.infer<typeof uarFeedbackPolicyAuthorizeSchema>
export type UarFeedbackReviewInput = z.infer<typeof uarFeedbackReviewSchema>
export type UarFeedbackImplementationInput = z.infer<typeof uarFeedbackImplementationSchema>
