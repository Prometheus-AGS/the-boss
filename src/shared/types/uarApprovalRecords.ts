import * as z from 'zod'

export const uarApprovalRecordSchema = z.object({
  version: z.literal(1),
  issuerId: z.string().min(1),
  challengeId: z.string().min(1),
  resolvable: z.boolean(),
  ownerKey: z.string().min(1),
  workspaceId: z.string().nullable(),
  rootRunId: z.string().min(1),
  admissionId: z.string().nullable(),
  admissionOwner: z.enum(['uar-runtime', 'paired-host']),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  createdAt: z.string(),
  expiresAt: z.string(),
  state: z.enum(['pending', 'approved', 'denied', 'cancelled', 'expired', 'interrupted']),
  decision: z
    .object({
      decisionId: z.string().min(1),
      actor: z.string().min(1),
      approved: z.boolean(),
      decidedAt: z.string()
    })
    .nullable(),
  updatedAt: z.string()
})

export const uarApprovalHistorySchema = z.object({
  version: z.literal(1),
  runId: z.string().min(1),
  durable: z.boolean(),
  records: z.array(uarApprovalRecordSchema)
})

export type UarApprovalRecord = z.infer<typeof uarApprovalRecordSchema>
export type UarTeamApprovalHistory = UarApprovalRecord & {
  attemptId: string
  runId: string
  durable: boolean
  effectState?: string
}
