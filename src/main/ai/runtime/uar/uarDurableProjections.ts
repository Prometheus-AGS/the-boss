import * as z from 'zod'

import type { UarDurableInstance, UarDurableObserver } from '@shared/types/uarDurableAdministration'

const count = z.number().int().nonnegative()
const nullableId = z.string().nullable()
const rawInstance = z.object({
  instanceId: z.string(),
  workspaceId: z.string(),
  definitionId: z.string(),
  definitionVersion: z.string(),
  definitionDigest: z.string().optional(),
  bindingId: z.string(),
  bindingRevision: count,
  bindingDigest: z.string().optional(),
  sessionId: z.string().optional(),
  limits: z
    .object({
      max_inbox: count,
      retained_commands: count,
      retained_events: count,
      max_restart_attempts: count,
      idle_timeout_secs: count
    })
    .transform((limits) => ({
      maxInbox: limits.max_inbox,
      retainedCommands: limits.retained_commands,
      retainedEvents: limits.retained_events,
      maxRestartAttempts: limits.max_restart_attempts,
      idleTimeoutSecs: limits.idle_timeout_secs
    }))
    .optional(),
  profile: z.enum(['request', 'on_demand', 'resident']),
  lifecycle: z.enum(['dormant', 'active', 'draining', 'disabled', 'failed']),
  recovery: z.enum(['ready', 'pending_reconciliation', 'effect_uncertain']),
  revision: count,
  epoch: count,
  queueDepth: count,
  activeRunId: nullableId,
  activeAttemptId: nullableId.optional(),
  activeCommandId: nullableId,
  restartAttempts: count,
  lastErrorCode: nullableId,
  reconciliationReceipt: nullableId.optional(),
  nextEventSequence: count,
  commands: z.array(
    z.object({
      commandId: z.string(),
      kind: z.enum(['turn', 'activate', 'passivate', 'drain', 'disable', 'restart', 'cancel']),
      status: z.enum(['accepted', 'running', 'completed', 'failed', 'cancelled', 'uncertain']),
      attemptId: nullableId.optional(),
      rootRunId: nullableId.optional(),
      acceptedAt: z.string().optional(),
      updatedAt: z.string().optional()
    })
  ),
  events: z
    .array(
      z.object({
        sequence: count,
        kind: z.string(),
        commandId: nullableId,
        attemptId: nullableId,
        rootRunId: nullableId,
        epoch: count,
        committedAt: z.string()
      })
    )
    .optional()
})

const rawObserver = z.object({
  subscription: z.object({
    subscription_id: z.string(),
    workspace_id: z.string(),
    observer_instance_id: z.string(),
    source_instance_ids: z.array(z.string()),
    conversation_ids: z.array(z.string()).nullable(),
    revision: count,
    paused: z.boolean(),
    revoked: z.boolean(),
    limits: z.object({ max_inbox: count, max_retries: count, retained_acknowledged: count }).optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    inbox: z
      .array(
        z.object({
          occurrence_id: z.string(),
          source_instance_id: z.string(),
          source_sequence: count,
          observer_command_id: z.string(),
          status: z.enum(['admitted', 'acknowledged', 'retry', 'dead_letter']),
          attempts: count,
          last_error_code: nullableId,
          admitted_at: z.string(),
          updated_at: z.string()
        })
      )
      .optional(),
    gaps: z.array(
      z.object({
        source_instance_id: z.string(),
        missing_from: count,
        missing_through: count,
        detected_at: z.string(),
        acknowledged_at: z.string().nullable()
      })
    )
  }),
  sources: z.array(
    z.object({
      sourceInstanceId: z.string(),
      cursor: count.nullable(),
      retainedLow: count.nullable(),
      sourceHigh: count.nullable()
    })
  ),
  backlogDepth: count,
  deadLetterCount: count,
  recoveryActions: z.array(z.string())
})

export function projectInstance(value: unknown, workspaceId: string): UarDurableInstance {
  // Native views already exclude private command prompts, outcomes and grants.
  // Parsing also strips any extra fields at the main-to-renderer boundary.
  const instance = rawInstance.parse(value)
  if (instance.workspaceId !== workspaceId) throw new Error('UAR instance workspace scope mismatch')
  return instance
}

export function projectObserver(value: unknown, workspaceId: string): UarDurableObserver {
  const status = rawObserver.parse(value)
  const subscription = status.subscription
  if (subscription.workspace_id !== workspaceId) throw new Error('UAR observer workspace scope mismatch')
  const gaps = subscription.gaps.map((gap) => ({
    sourceInstanceId: gap.source_instance_id,
    missingFrom: gap.missing_from,
    missingThrough: gap.missing_through,
    detectedAt: gap.detected_at,
    acknowledgedAt: gap.acknowledged_at
  }))
  const inbox = subscription.inbox
  return {
    subscriptionId: subscription.subscription_id,
    workspaceId: subscription.workspace_id,
    observerInstanceId: subscription.observer_instance_id,
    sourceInstanceIds: subscription.source_instance_ids,
    conversationIds: subscription.conversation_ids,
    revision: subscription.revision,
    paused: subscription.paused,
    revoked: subscription.revoked,
    gaps,
    sources: status.sources.map((source) => ({
      ...source,
      // Matches the native source-distance term. Filters may skip sequences;
      // unavailable bounds remain unknown, and retention loss is reported separately.
      sequenceDistance: source.sourceHigh === null ? null : Math.max(0, source.sourceHigh - (source.cursor ?? -1)),
      retentionGap:
        gaps.some((gap) => gap.sourceInstanceId === source.sourceInstanceId && gap.acknowledgedAt === null) ||
        (source.retainedLow !== null && source.retainedLow > (source.cursor ?? -1) + 1)
    })),
    backlogDepth: status.backlogDepth,
    deadLetterCount: status.deadLetterCount,
    recoveryActions: status.recoveryActions,
    ...(subscription.limits
      ? {
          limits: {
            maxInbox: subscription.limits.max_inbox,
            maxRetries: subscription.limits.max_retries,
            retainedAcknowledged: subscription.limits.retained_acknowledged
          }
        }
      : {}),
    ...(subscription.created_at === undefined ? {} : { createdAt: subscription.created_at }),
    ...(subscription.updated_at === undefined ? {} : { updatedAt: subscription.updated_at }),
    ...(inbox === undefined
      ? {}
      : {
          deliveries: {
            records: [...inbox]
              .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
              .slice(0, 128)
              .map((entry) => ({
                occurrenceId: entry.occurrence_id,
                sourceInstanceId: entry.source_instance_id,
                sourceSequence: entry.source_sequence,
                observerCommandId: entry.observer_command_id,
                status: entry.status,
                attempts: entry.attempts,
                lastErrorCode: entry.last_error_code,
                admittedAt: entry.admitted_at,
                updatedAt: entry.updated_at
              })),
            totalRetained: inbox.length,
            limit: 128,
            truncated: inbox.length > 128
          }
        })
  }
}
