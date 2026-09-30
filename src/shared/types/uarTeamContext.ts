import * as z from 'zod'

const counter = z.number().int().nonnegative()
const revision = z.number().int().positive()
const ref = z.object({ id: z.string(), revision }).strict()
const reservation = z.object({ tokens: counter, costMicrounits: counter, elapsedSeconds: counter }).strict()
const fence = z
  .object({ catalogId: z.string(), serviceInstanceId: z.string(), incarnationId: z.string(), epoch: revision })
  .strict()

export const uarTeamAuthoritySchema = z
  .object({
    ownerId: z.string(),
    workspaceId: z.string(),
    teamId: z.string(),
    taskId: z.string(),
    memberId: z.string(),
    attemptId: z.string(),
    runId: z.string(),
    taskOwnershipEpoch: revision,
    memberRevision: revision,
    binding: ref,
    executionFence: fence
  })
  .strict()

export const uarTeamInstructionsSchema = z
  .object({
    revision,
    digest: z.string(),
    text: z.string()
  })
  .strict()

export const uarRosterMemberSchema = z
  .object({
    memberId: z.string(),
    role: z.string(),
    label: z.string(),
    safeCapabilities: z.array(z.string()).max(32)
  })
  .strict()

export const uarTargetOutcomeSchema = z
  .object({
    taskId: z.string(),
    memberId: z.string(),
    attemptId: z.string(),
    executionOutcome: z.enum(['succeeded', 'failed', 'cancelled']),
    effectDisposition: z.literal('confirmed'),
    artifactIds: z.array(z.string())
  })
  .strict()

export const uarTeamContextSchema = z
  .object({
    authority: uarTeamAuthoritySchema,
    rootId: z.string(),
    approvalScopeId: z.string(),
    teamInstructions: uarTeamInstructionsSchema.optional(),
    instructionOrder: z.tuple([
      z.literal('host-policy'),
      z.literal('team-instructions'),
      z.literal('member-instructions'),
      z.literal('task-instructions')
    ]),
    self: uarRosterMemberSchema,
    coordinatorMemberId: z.string(),
    roster: z.array(uarRosterMemberSchema).max(16),
    authorizationRevision: revision,
    selections: z
      .array(
        z
          .object({
            sourceId: z.string(),
            sourceKind: z.enum(['team-input', 'task-input', 'artifact', 'message', 'skill']),
            disposition: z.enum(['selected', 'excluded']),
            reasonCode: z.string().optional(),
            originalBytes: counter,
            selectedBytes: counter,
            truncated: z.boolean()
          })
          .strict()
      )
      .max(128),
    targetOutcomes: z.array(uarTargetOutcomeSchema).max(16),
    targetOutcomeDataTrust: z.literal('untrusted-attributed-data'),
    contextBudgetTokens: counter,
    countQuality: z.enum(['exact', 'conservative', 'unknown'])
  })
  .strict()

export const uarTeamWaitSchema = z
  .object({
    waitId: z.string(),
    authority: uarTeamAuthoritySchema,
    targetTaskIds: z.array(z.string()).min(1).max(16),
    predicate: z.literal('all-terminal'),
    continuationInput: z.object({ text: z.string(), artifactIds: z.array(z.string()) }).strict(),
    continuationReservation: reservation,
    state: z.enum(['yield_requested', 'waiting', 'blocked', 'resumed', 'invalidated']),
    continuationAttemptId: z.string().optional(),
    wakeOutcomes: z.array(uarTargetOutcomeSchema).max(16),
    reasonCode: z.string().optional()
  })
  .strict()

export const uarTeamContinuationSchema = z
  .object({
    waitId: z.string(),
    uniquenessKey: z.string(),
    previousAttemptId: z.string(),
    authority: uarTeamAuthoritySchema,
    rootId: z.string(),
    approvalScopeId: z.string(),
    authorizationRevision: revision,
    taskId: z.string(),
    continuationAttemptId: z.string(),
    runId: z.string(),
    executionFence: fence,
    reservation,
    selectedArtifactIds: z.array(z.string()),
    targetOutcomes: z.array(uarTargetOutcomeSchema).min(1).max(16),
    committedAt: z.string()
  })
  .strict()

export type UarTeamInstructions = z.infer<typeof uarTeamInstructionsSchema>
export type UarTeamContextReceipt = z.infer<typeof uarTeamContextSchema>
export type UarTeamWait = z.infer<typeof uarTeamWaitSchema>
export type UarTeamContinuationReceipt = z.infer<typeof uarTeamContinuationSchema>
export type UarTargetOutcome = z.infer<typeof uarTargetOutcomeSchema>

export const uarTeamCommandReceiptSchema = z
  .object({
    commandId: z.string(),
    requestDigest: z.string(),
    scope: z.object({ ownerId: z.string(), workspaceId: z.string(), teamId: z.string() }).strict(),
    operation: z.enum(['team_send', 'team_delegate', 'team_wait']),
    senderMemberId: z.string(),
    senderAttemptId: z.string(),
    acceptedAt: z.string(),
    messageId: z.string().optional(),
    taskId: z.string().optional(),
    attemptId: z.string().optional(),
    waitId: z.string().optional()
  })
  .strict()
export type UarTeamCommandReceipt = z.infer<typeof uarTeamCommandReceiptSchema>

export const uarTeamPeerMessagesSchema = z
  .object({
    messages: z.array(
      z
        .object({
          message: z
            .object({
              messageId: z.string(),
              ownerId: z.string(),
              workspaceId: z.string(),
              teamId: z.string(),
              senderMemberId: z.string(),
              senderAttemptId: z.string(),
              recipientMemberId: z.string(),
              recipientTaskId: z.string().nullish(),
              mode: z.enum(['queue-only', 'trigger-turn']),
              payload: z.object({ text: z.string(), artifactIds: z.array(z.string()) }).strict(),
              acceptedAt: z.string()
            })
            .strict(),
          delivery: z
            .object({
              messageId: z.string(),
              recipientMemberId: z.string(),
              recipientTaskId: z.string().optional(),
              status: z.enum(['accepted', 'delivered', 'consumed', 'rejected']),
              selectedAttemptId: z.string().optional(),
              selectedAt: z.string().optional(),
              consumedAt: z.string().optional(),
              rejectionCode: z.string().optional()
            })
            .strict()
        })
        .strict()
    )
  })
  .strict()

export type UarTeamPeerMessages = z.infer<typeof uarTeamPeerMessagesSchema>

export const UAR_TEAM_EXECUTION_PROFILE = 'urn:prometheus:uar:team-execution:0.1.0'
export const UAR_TEAM_COOPERATION_CAPABILITIES = [
  'team_execution_peer_tools_v1',
  'team_execution_shared_instructions_v1',
  'team_execution_continuations_v1'
] as const
