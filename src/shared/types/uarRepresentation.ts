import * as z from 'zod'
import type { UarDurableInstance } from './uarDurableAdministration'

const id = z.string().min(1).max(256)
const values = z.array(id).max(128)
export const uarRepresentationWorkspaceSchema = z.object({ workspaceId: id }).strict()
export const uarRepresentationGrantSchema = z.object({
  profile: z.literal('urn:prometheus:uar:collaboration:0.1.0-draft.2'),
  kind: z.literal('RepresentationGrant'), exportClass: z.literal('private-authority-state'),
  grantId: id, issuerPrincipalId: id, subjectPrincipalId: id, granteeAgentInstanceId: id,
  organizationId: id, office: id, purpose: z.string().min(1).max(2048),
  audienceScopes: values, actionScopes: values.min(1), resourceScopes: values.min(1), dataScopes: values,
  approvalRequirements: values, disclosureRequirements: values,
  consentEvidenceRef: z.string().startsWith('protected-evidence://').max(512),
  organizationalAuthorityEvidenceRef: z.string().startsWith('protected-evidence://').max(512),
  revision: z.number().int().positive(), status: z.enum(['pending', 'active', 'suspended', 'revoked', 'expired']),
  notBefore: z.iso.datetime(), expiresAt: z.iso.datetime(),
  constraintDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  revocation: z.object({ revision: z.number().int().positive(), revokedAt: z.iso.datetime(), reason: id }).nullable(),
  retention: z.object({ policy: id, deleteAfter: z.iso.datetime().nullable() }),
  offboarding: z.object({ mode: id, requiredActions: values }),
  restrictions: z.object({ forbiddenClaims: values, notes: values })
}).strict()
export const uarRepresentationSaveSchema = uarRepresentationWorkspaceSchema.extend({
  commandId: z.uuid(), expectedRevision: z.number().int().nonnegative().optional(),
  grant: uarRepresentationGrantSchema.omit({ issuerPrincipalId: true, constraintDigest: true })
})
export const uarRepresentationHistorySchema = uarRepresentationWorkspaceSchema.extend({ grantId: id })
export const uarRepresentationRevokeSchema = uarRepresentationHistorySchema.extend({
  expectedRevision: z.number().int().positive(), reason: id
})
export const uarRepresentationInstallSchema = z.object({ grant: uarRepresentationGrantSchema, receipt: z.unknown() })
export const uarRepresentationSnapshotSchema = z.object({ workspaceId: id, issuerPrincipalId: id,
  grants: z.array(uarRepresentationGrantSchema), instances: z.array(z.custom<UarDurableInstance>()) })
export type UarRepresentationGrant = z.infer<typeof uarRepresentationGrantSchema>
export type UarRepresentationSaveInput = z.infer<typeof uarRepresentationSaveSchema>
export type UarRepresentationRevokeInput = z.infer<typeof uarRepresentationRevokeSchema>
