import type { UarTeamApprovalHistory } from './uarApprovalRecords'
import type { UarTeamApproval } from './uarTeams'
import type { uarTeamRunEventsSchema } from './uarTeamRunEvents'
import type * as z from 'zod'

export interface UarDurableRunSnapshot {
  instanceId: string
  events: z.infer<typeof uarTeamRunEventsSchema>
  approval: UarTeamApproval | null
  effects: Array<{ toolName: string; state: string; admissionId: string | null; invocationId: string }>
  history: UarTeamApprovalHistory[]
}

export interface UarDurableApprovalDecision {
  workspaceId: string
  instanceId: string
  runId: string
  approvalId: string
  issuerId: string
  challengeId: string
  eventId: string
  cursor: number
  approved: boolean
}

export type UarInstanceProfile = 'request' | 'on_demand' | 'resident'
export type UarInstanceAction = 'activate' | 'passivate' | 'drain' | 'disable' | 'restart' | 'cancel'
export type UarObserverAction = 'pause' | 'resume'

export interface UarDurableCommand {
  commandId: string
  kind: 'turn' | UarInstanceAction
  status: 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'uncertain'
  attemptId: string | null
  rootRunId: string | null
  acceptedAt: string
  updatedAt: string
}

export interface UarDurableBinding {
  id: string
  revision: number
  activationSupported: boolean
  workspaceId?: string
  package?: { id: string; version: string; digest: string }
  posture?: UarBindingPosture | null
  preflightDiagnostics?: UarBindingPreflightDiagnostic[]
}

export interface UarDurableInstance {
  instanceId: string
  workspaceId: string
  definitionId: string
  definitionVersion: string
  definitionDigest?: string
  bindingId: string
  bindingRevision: number
  bindingDigest?: string
  representationRevision?: number
  representationGrantRefs?: Array<{ grantId: string; revision: number; constraintDigest: string }>
  sessionId?: string
  limits?: {
    maxInbox: number
    retainedCommands: number
    retainedEvents: number
    maxRestartAttempts: number
    idleTimeoutSecs: number
  }
  profile: UarInstanceProfile
  lifecycle: 'dormant' | 'active' | 'draining' | 'disabled' | 'failed'
  recovery: 'ready' | 'pending_reconciliation' | 'effect_uncertain'
  revision: number
  epoch: number
  queueDepth: number
  activeRunId: string | null
  activeAttemptId?: string | null
  activeCommandId: string | null
  restartAttempts: number
  lastErrorCode: string | null
  reconciliationReceipt?: string | null
  nextEventSequence: number
  commands: Array<{
    commandId: string
    kind: 'turn' | UarInstanceAction
    status: 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'uncertain'
    attemptId?: string | null
    rootRunId?: string | null
    acceptedAt?: string
    updatedAt?: string
  }>
  events?: Array<{
    sequence: number
    kind: string
    commandId: string | null
    attemptId: string | null
    rootRunId: string | null
    epoch: number
    committedAt: string
  }>
}

export interface UarDurableObserver {
  subscriptionId: string
  workspaceId: string
  observerInstanceId: string
  sourceInstanceIds: string[]
  conversationIds: string[] | null
  revision: number
  paused: boolean
  revoked: boolean
  gaps: Array<{
    sourceInstanceId: string
    missingFrom: number
    missingThrough: number
    detectedAt: string
    acknowledgedAt: string | null
  }>
  sources: Array<{
    sourceInstanceId: string
    cursor: number | null
    retainedLow: number | null
    sourceHigh: number | null
    /** Captured source sequence distance; not elapsed lag or exact filtered deliveries. */
    sequenceDistance: number | null
    retentionGap: boolean
  }>
  backlogDepth: number
  deadLetterCount: number
  recoveryActions: string[]
  limits?: { maxInbox: number; maxRetries: number; retainedAcknowledged: number }
  createdAt?: string
  updatedAt?: string
  deliveries?: {
    /** Acknowledged means the observer command was admitted, not that its effect completed. */
    records: Array<{
      occurrenceId: string
      sourceInstanceId: string
      sourceSequence: number
      observerCommandId: string
      status: 'admitted' | 'acknowledged' | 'retry' | 'dead_letter'
      attempts: number
      lastErrorCode: string | null
      admittedAt: string
      updatedAt: string
    }>
    totalRetained: number
    limit: 128
    truncated: boolean
  }
}

export type UarDurableOperation =
  | 'starter.setup'
  | 'collaboration.capabilities'
  | 'collaboration.packages.list'
  | 'collaboration.packages.preflight'
  | 'collaboration.packages.install'
  | 'collaboration.deployment_bindings.preflight'
  | 'collaboration.deployment_bindings.install'
  | 'collaboration.deployment_bindings.list'
  | 'agent-instances.list'
  | 'agent-instances.read'
  | 'agent-instances.create'
  | 'agent-instances.turn'
  | `agent-instances.${UarInstanceAction}`
  | 'observers.list'
  | 'observers.read'
  | 'observers.create'
  | `observers.${UarObserverAction}`
  | 'observers.gap.acknowledge'

export interface UarDurableWorkspaceSnapshot {
  schemaVersion: 1
  workspaceId: string
  generation: number
  capabilities: { instances: boolean; observers: boolean }
  operations: Record<UarDurableOperation, { available: boolean; reason?: string }>
  bindings: UarDurableBinding[]
  instances: UarDurableInstance[]
  observers: UarDurableObserver[]
}
import type { UarBindingPosture, UarBindingPreflightDiagnostic } from './uarBindingPosture'
