import * as z from 'zod'

import type { UarBindingPosture, UarBindingPreflightDiagnostic } from './uarBindingPosture'
import { uarGuidanceMappingSchema, uarGuidanceRoles, uarReviewedGuidanceSchema } from './uarTeamGuidance'
import { uarReviewedModelPolicySchema } from './uarTeamModelPolicy'
import type {
  UarTeamCommandReceipt,
  UarTeamContextReceipt,
  UarTeamInstructions,
  UarTeamContinuationReceipt,
  UarTeamWait
} from './uarTeamContext'
import type { UarEffectiveModelReceipt, UarExecutionFence, UarTeamDiagnostic } from './uarTeamProfiles'
export interface UarTeamIdentity {
  id: string
  version: string
  digest: string
}

export interface UarTeamDefinition extends UarTeamIdentity {
  title: string
  purpose: string
  instructions?: UarTeamInstructions
  package: UarTeamIdentity
  budget?: UarTeamBudget
  members: Array<{
    role: string
    kind: 'agent' | 'team'
    min: number
    max: number
    definition: UarTeamIdentity
  }>
}

export interface UarTeamBinding {
  id: string
  workspaceId: string
  revision: number
  activationSupported: boolean
  package: UarTeamIdentity
  posture?: UarBindingPosture | null
  preflightDiagnostics?: UarBindingPreflightDiagnostic[]
}

export interface UarTeamTask {
  id: string
  title: string
  role: string
  input: unknown
  outputContract: unknown
  output: unknown | null
  dependsOn: string[]
  status: 'queued' | 'ready' | 'running' | 'waiting' | 'blocked' | 'succeeded' | 'failed' | 'cancelled'
  revision: number
  assigneeMemberId: string | null
  ownershipEpoch: number
  assignmentAuthority: {
    bindingId: string
    bindingRevision: number
    workspaceId: string
    role: string
    memberId: string
    ownershipEpoch: number
    canExecute: false
    canUseTools: false
  } | null
  reviewerMemberId: string | null
  reviewerEpoch: number
  stateReason: string | null
  createdAt: string
  updatedAt: string
}

export interface UarTeamInstance {
  id: string
  ownerId: string
  workspaceId: string
  revision: number
  status: 'inactive' | 'running' | 'revoked' | 'stopped' | 'cancelled'
  definition: UarTeamIdentity
  package: UarTeamIdentity
  binding: { id: string; revision: number }
  input: unknown
  members: Array<{
    id: string
    role: string
    ordinal: number
    definition: UarTeamIdentity
    revision: number
    status: 'inactive' | 'running' | 'revoked' | 'stopped' | 'cancelled'
  }>
  tasks: UarTeamTask[]
  createdAt: string
  updatedAt: string
}

export interface UarTeamsSnapshot {
  schemaVersion: 1
  workspaceId: string
  generation: number
  capabilities: {
    planning: boolean
    ownership: boolean
    mailbox: boolean
    execution: boolean
    cooperation?: boolean
    coding: boolean
    approvals: boolean
  }
  executionProfileStage?: 'unqualified' | 'operation' | 'qualified'
  executionProfile?: string
  executionCapabilities?: string[]
  unavailableReason?: string
  definitions: UarTeamDefinition[]
  bindings: UarTeamBinding[]
  instances: UarTeamInstance[]
}

export interface UarCreateTeamInput {
  workspaceId: string
  commandId: string
  deploymentBindingId: string
  teamDefinition: UarTeamIdentity
  input: unknown
  memberSlots?: Array<{ role: string; count: number }>
}

export interface UarAddTeamTaskInput {
  workspaceId: string
  teamInstanceId: string
  commandId: string
  taskId: string
  expectedTeamRevision: number
  title: string
  role: string
  input: unknown
  outputContract: unknown
  dependsOn: string[]
}

export interface UarTeamTaskCommandInput {
  workspaceId: string
  teamInstanceId: string
  taskId: string
  commandId: string
  expectedTeamRevision: number
  expectedTaskRevision: number
  memberId: string
}

export interface UarTeamTaskStateInput extends Omit<UarTeamTaskCommandInput, 'memberId'> {
  status: 'ready'
  reason: string
}

export interface UarTeamMailboxMessage {
  messageId: string
  ownerId: string
  workspaceId: string
  teamId: string
  senderOwnerId: string
  recipientMemberId: string
  recipientMemberRevision: number
  taskId?: string | null
  taskEpoch?: number | null
  mode: 'queue-only' | 'trigger-turn'
  content: string
  status: 'accepted' | 'delivered' | 'processed' | 'consumed' | 'rejected'
  senderMemberId?: string | null
  senderAttemptId?: string | null
  senderTaskId?: string | null
  consumedAt?: string | null
  selectedAttemptId?: string | null
  rejectionCode?: string | null
  acceptedAt: string
  deliveredAt?: string | null
  processedAt?: string | null
  processedTurnId?: string | null
}

export interface UarTeamMailboxPage {
  messages: UarTeamMailboxMessage[]
}

export interface UarTeamMailboxSendInput {
  workspaceId: string
  teamInstanceId: string
  commandId: string
  recipientMemberId: string
  mode: 'queue-only' | 'trigger-turn'
  content: string
}

export interface UarTeamBudget {
  maxTokens: number
  maxCostMicrounits: number
  currency: string
  maxElapsedSeconds: number
}

export interface UarTeamReservation {
  tokens: number
  costMicrounits: number
  elapsedSeconds: number
}

export interface UarTeamExecutionAttempt {
  id: string
  runId: string
  ownerId: string
  workspaceId: string
  teamId: string
  taskId: string
  memberId: string
  memberRevision: number
  ownershipEpoch: number
  bindingRevision: number
  executionEpoch: number
  status:
    | 'queued'
    | 'running'
    | 'cancellation_requested'
    | 'uncertain'
    | 'yielded'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
  executionFence?: UarExecutionFence | null
  effectiveModels?: UarEffectiveModelReceipt[]
  effectDisposition?: 'confirmed' | 'uncertain'
  accountingState?: 'settled' | 'reserved-unknown'
  diagnostic?: UarTeamDiagnostic | null
  rootId?: string
  approvalScopeId?: string
  queueSequence?: number
  continuationOfWaitId?: string | null
  executionOutcome?: 'yielded' | 'succeeded' | 'failed' | 'cancelled' | 'uncertain' | null
  reservation: UarTeamReservation
  contextArtifactIds: string[]
  usage: UarTeamReservation | null
  usageRevision: number
  output: unknown | null
  stateReason: string | null
  createdAt: string
  updatedAt: string
}

export interface UarTeamArtifact {
  id: string
  ownerId: string
  workspaceId: string
  teamId: string
  taskId: string
  memberId: string
  attemptId: string
  content: unknown
  createdAt: string
}

export interface UarTeamExecutionSummary {
  attempts: UarTeamExecutionAttempt[]
  commandReceipts?: UarTeamCommandReceipt[]
  waits?: UarTeamWait[]
  continuations?: UarTeamContinuationReceipt[]
  contextReceipts?: UarTeamContextReceipt[]
  committed: UarTeamReservation
  reserved: UarTeamReservation
  uncertainAttempts: string[]
  budget: UarTeamBudget
  limits: { concurrentTurns: number; maxMembers: number; maxDepth: number; maxPendingTasks: number }
}

export interface UarTeamExecutionSelector {
  workspaceId: string
  teamInstanceId: string
}

export interface UarAdmitTeamTaskInput extends UarTeamTaskCommandInput {
  reservation: UarTeamReservation
  contextArtifactIds: string[]
}

export interface UarTeamControlInput extends UarTeamExecutionSelector {
  commandId: string
  expectedTeamRevision: number
  reason: string
}

export interface UarTeamModelSelection {
  source: 'uar' | 'gateway'
  providerId: string
  modelId: string
}

export interface UarSubmitTeamTaskInput extends UarTeamExecutionSelector {
  commandId: string
  prompt: string
}

export interface UarTeamPreparedEffect {
  version: 1
  admissionId: string
  invocationId: string
  toolCallId: string
  callIndex: number
  rootRunId: string
  runId: string
  ownerId: string
  workspace: string
  toolName: string
  argumentsSha256: string
  actionDisplaySha256: string
  targetPath?: string
  write?: { contentSha256: string }
  edit?: {
    oldStringSha256: string
    newStringSha256: string
    oldStringLength: number
    newStringLength: number
    replaceAll: boolean
  }
}

export interface UarTeamApproval {
  issuerId: string
  challengeId: string
  admissionOwner: 'uar-runtime' | 'paired-host'
  attemptId: string
  runId: string
  approvalId: string
  admissionId?: string
  rootRunId?: string
  toolCallId?: string
  callIndex?: number
  eventId: string
  cursor: number
  toolName: string
  argumentsJson: string
  riskReason: string
  preparedEffect?: UarTeamPreparedEffect
}

export interface UarTeamApprovalDecision extends UarTeamExecutionSelector {
  issuerId?: string
  challengeId?: string
  attemptId: string
  approvalId: string
  eventId: string
  cursor: number
  approved: boolean
}

export const uarTeamSkillRefSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    required: z.boolean(),
    config: z.record(z.string(), z.json()),
    entrypoint: z.string().min(1).nullable(),
    requiredTools: z.array(z.string().min(1))
  })
  .strict()

export const uarAuthoredTeamSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(128),
    template: z.enum(['coding', 'product-design']),
    purpose: z.string().trim().min(1).max(4096),
    instructions: z.string().max(16384),
    reviewedGuidance: uarReviewedGuidanceSchema.optional(),
    guidanceMappings: z.array(uarGuidanceMappingSchema).optional(),
    members: z
      .array(
        z
          .object({
            role: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
            responsibility: z.string().trim().min(1).max(4096),
            instructions: z.string().trim().min(1).max(16384),
            model: z
              .object({
                source: z.enum(['uar', 'gateway']),
                providerId: z.string().min(1).max(128),
                modelId: z.string().min(1).max(256)
              })
              .strict()
              .optional(),
            reviewedModelPolicy: uarReviewedModelPolicySchema.optional(),
            modelPolicyMode: z.enum(['reviewed', 'manual']).optional(),
            tools: z.array(
              z.enum([
                'filesystem__glob',
                'filesystem__ls',
                'filesystem__grep',
                'filesystem__read',
                'filesystem__edit',
                'filesystem__write'
              ])
            ),
            skills: z.array(uarTeamSkillRefSchema),
            knowledge: z.array(z.object({ path: z.string().min(1).max(1024), required: z.boolean() }).strict())
          })
          .strict()
      )
      .min(2)
      .max(6)
  })
  .strict()
  .superRefine((value, context) => {
    const mappings = value.guidanceMappings ?? []
    const proposals = value.reviewedGuidance ? uarGuidanceRoles(value.reviewedGuidance) : []
    if (
      mappings.length &&
      (
        !value.reviewedGuidance?.result.ready ||
        new Set(mappings.map((mapping) => mapping.sourceRole)).size !== mappings.length ||
        new Set(mappings.map((mapping) => mapping.memberRole)).size !== mappings.length ||
        mappings.some(
          (mapping) =>
            mapping.memberRole === 'coordinator' ||
            !proposals.some((proposal) => proposal.id === mapping.sourceRole) ||
            !value.members.some((member) => member.role === mapping.memberRole)
        )
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['guidanceMappings'],
        message: 'Guidance requires unique explicit non-coordinator mappings from a ready result'
      })
    if (
      value.members.filter((member) => member.role === 'coordinator').length !== 1 ||
      new Set(value.members.map((member) => member.role)).size !== value.members.length
    )
      context.addIssue({
        code: 'custom',
        path: ['members'],
        message: 'Exactly one coordinator and unique member roles are required'
      })
    value.members.forEach((member, index) => {
      if (
        member.modelPolicyMode === 'reviewed' &&
        (!member.reviewedModelPolicy ||
          member.model?.source !== member.reviewedModelPolicy.selection.source ||
          member.model?.providerId !== member.reviewedModelPolicy.selection.providerId ||
          member.model?.modelId !== member.reviewedModelPolicy.selection.modelId)
      )
        context.addIssue({
          code: 'custom',
          path: ['members', index, 'model'],
          message: 'Reviewed model selection must match its exact recommendation'
        })
    })
    if (value.members.some((member) => member.role === 'coordinator' && member.tools.length))
      context.addIssue({
        code: 'custom',
        path: ['members'],
        message: 'The coordinator delegates workspace work to members'
      })
  })

export type UarAuthoredTeam = z.infer<typeof uarAuthoredTeamSchema>
export type UarTeamSkillRef = z.infer<typeof uarTeamSkillRefSchema>
export interface UarAuthoredTeamRevision {
  schemaVersion: 1
  revision: number
  savedAt: string
  team: UarAuthoredTeam
  package: UarTeamIdentity
  definition: UarTeamIdentity
}
export interface UarTeamAuthoringSnapshot {
  schemaVersion: 1
  revisions: UarAuthoredTeamRevision[]
  templates: UarAuthoredTeam[]
}
export interface UarTeamSkillCatalog {
  schemaVersion: 1
  entries: Array<{
    skillId: string
    title: string
    description: string
    availability: 'available' | 'unavailable'
    reasons: string[]
    skillRef: UarTeamSkillRef | null
  }>
}
