import * as z from 'zod'
import { uarWorkflowRunSchema, uarWorkflowStartSchema } from './uarWorkflows'

const selector = z.string().min(1).max(256)
const revision = z.number().int().nonnegative()
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const segment = '[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,119}'
export const uarFeedbackTargetSchema = z.string().regex(new RegExp(`^${segment}/${segment}$`))
export const uarFeedbackIssueSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(60_000)
}).strict()
export const uarFeedbackWorkspaceSchema = z.object({ workspaceId: selector }).strict()
export const uarFeedbackSelectorSchema = uarFeedbackWorkspaceSchema.extend({ intakeId: selector })
export const uarFeedbackStartSchema = uarWorkflowStartSchema.extend({
  sourceEventId: selector,
  target: uarFeedbackTargetSchema,
  input: z.object({ feedback: z.string().min(1).max(16_384)
    .refine((value) => new TextEncoder().encode(value).length <= 16_384) }).strict()
})
export const uarFeedbackApprovalSchema = uarFeedbackSelectorSchema.extend({
  commandId: z.uuid(),
  expectedRevision: revision,
  artifactId: selector,
  artifactDigest: digest,
  payloadDigest: digest,
  target: uarFeedbackTargetSchema
})
export const uarFeedbackControlSchema = uarFeedbackSelectorSchema.extend({ commandId: z.uuid(), expectedRevision: revision })
export const uarFeedbackCredentialSchema = uarFeedbackWorkspaceSchema.extend({
  target: uarFeedbackTargetSchema,
  credential: z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('set'), value: z.string().trim().min(1).max(4096) }).strict(),
    z.object({ operation: z.literal('clear') }).strict()
  ])
})
export const uarFeedbackDraftSchema = z.object({
  artifactId: selector,
  artifactDigest: digest,
  payloadDigest: digest,
  connectorBindingId: selector,
  connectorBindingRevision: revision,
  target: uarFeedbackTargetSchema,
  egressLabel: z.string(),
  sanitizedIssue: uarFeedbackIssueSchema,
  sanitizationRef: selector
})
const approval = z.object({
  id: selector,
  authority: z.string(),
  operatorId: z.string().nullable(),
  connectorBindingId: z.string().nullable(),
  connectorBindingRevision: revision.nullable(),
  target: z.string().nullable(),
  action: z.string().nullable(),
  artifactId: selector,
  artifactDigest: digest,
  sanitizedPayloadDigest: digest,
  sanitizationRef: selector,
  decidedAt: z.string()
})
export const uarFeedbackIntakeSchema = z.object({
  id: selector,
  ownerId: selector,
  workspaceId: selector,
  revision,
  source: z.enum(['direct', 'bossfang']),
  sourceEventId: selector,
  requestedTarget: uarFeedbackTargetSchema.nullable(),
  feedback: z.string(),
  status: z.string(),
  workflowRunId: z.string().nullable(),
  classification: z.string().nullable(),
  duplicateOf: z.string().nullable(),
  issueDraft: uarFeedbackDraftSchema.nullable(),
  issueApproval: approval.nullable(),
  connectorEffectId: z.string().nullable(),
  externalIssueId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const uarFeedbackEffectSchema = z.object({
  id: selector,
  bindingId: selector,
  bindingRevision: revision,
  provider: z.literal('github'),
  target: uarFeedbackTargetSchema,
  action: z.literal('publish'),
  decisionRef: z.string().nullable(),
  payloadDigest: digest,
  status: z.string(),
  dispatchId: z.string().nullable(),
  receipt: z.object({
    disposition: z.string(),
    externalId: z.string().nullable(),
    evidenceRef: z.string().nullable(),
    recordedAt: z.string()
  }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const uarFeedbackDetailSchema = z.object({
  intake: uarFeedbackIntakeSchema,
  effect: uarFeedbackEffectSchema.nullable(),
  workflow: uarWorkflowRunSchema.nullable(),
  issueUrl: z.string().nullable()
})
export const uarFeedbackPreviewSchema = uarFeedbackDetailSchema.extend({
  preview: z.object({
    target: uarFeedbackTargetSchema,
    artifactId: selector,
    artifactDigest: digest,
    payloadDigest: digest,
    title: z.string(),
    body: z.string(),
    action: z.literal('publish'),
    bindingId: selector,
    bindingRevision: revision
  }).nullable()
})
export const uarFeedbackSnapshotSchema = z.object({
  workspaceId: selector,
  intakes: z.array(uarFeedbackIntakeSchema),
  effects: z.array(uarFeedbackEffectSchema),
  bindings: z.array(z.object({ id: selector, revision, target: uarFeedbackTargetSchema, credentialConfigured: z.boolean() }))
})

export type UarFeedbackIntake = z.infer<typeof uarFeedbackIntakeSchema>
export type UarFeedbackEffect = z.infer<typeof uarFeedbackEffectSchema>
export type UarFeedbackDetail = z.infer<typeof uarFeedbackDetailSchema>
export type UarFeedbackSelector = z.infer<typeof uarFeedbackSelectorSchema>
export type UarFeedbackStartInput = z.infer<typeof uarFeedbackStartSchema>
export type UarFeedbackApprovalInput = z.infer<typeof uarFeedbackApprovalSchema>
export type UarFeedbackControlInput = z.infer<typeof uarFeedbackControlSchema>
export type UarFeedbackCredentialInput = z.infer<typeof uarFeedbackCredentialSchema>
