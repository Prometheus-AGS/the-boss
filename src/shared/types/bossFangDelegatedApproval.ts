import * as z from 'zod'

import { uarApprovalHistorySchema } from './uarApprovalRecords'

export const bossFangDelegatedIdentitySchema = z.object({ id: z.string(), version: z.string(), digest: z.string() })
export const bossFangDelegatedBindingSchema = z.object({ id: z.string(), revision: z.number().int(), digest: z.string() })
export const bossFangDelegatedContextSchema = z.object({
  contextId: z.string(),
  workspaceId: z.string(),
  runtimeEpoch: z.string(),
  definition: bossFangDelegatedIdentitySchema,
  binding: bossFangDelegatedBindingSchema,
  expiresAt: z.string()
})
export type BossFangDelegatedContext = z.infer<typeof bossFangDelegatedContextSchema>

export const bossFangPreparedEffectSchema = z.object({
  version: z.literal(1),
  admissionId: z.string(),
  invocationId: z.string(),
  toolCallId: z.string(),
  callIndex: z.number().int(),
  rootRunId: z.string(),
  runId: z.string(),
  ownerId: z.string(),
  workspace: z.string(),
  toolName: z.string(),
  argumentsSha256: z.string(),
  actionDisplaySha256: z.string(),
  targetPath: z.string().optional(),
  write: z.object({ contentSha256: z.string() }).optional(),
  edit: z.object({
    oldStringSha256: z.string(), newStringSha256: z.string(),
    oldStringLength: z.number().int(), newStringLength: z.number().int(), replaceAll: z.boolean()
  }).optional()
})

export const bossFangDelegatedApprovalInspectionSchema = bossFangDelegatedContextSchema.extend({
  bossTaskId: z.string(),
  taskId: z.string(),
  runId: z.string(),
  history: uarApprovalHistorySchema,
  pending: z.object({
    approvalId: z.string(), issuerId: z.string(), challengeId: z.string(), admissionId: z.string(),
    toolCallId: z.string(), callIndex: z.number().int(), eventId: z.string(), cursor: z.number().nullable(), rootRunId: z.string()
  }).nullable(),
  preparedEffect: bossFangPreparedEffectSchema.nullable()
})
export type BossFangDelegatedApprovalInspection = z.infer<typeof bossFangDelegatedApprovalInspectionSchema>
