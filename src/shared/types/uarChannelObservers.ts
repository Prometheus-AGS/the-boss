import * as z from 'zod'

export const uarChannelObserverActionSchema = z.enum(['pause', 'resume', 'revoke'])
export const uarChannelSubscriptionSchema = z.object({
  profile: z.literal('uar.channel-source/1'),
  subscriptionId: z.string(),
  workspaceId: z.string(),
  observerInstanceId: z.string(),
  source: z.object({
    provider: z.string(),
    account: z.string(),
    workspace: z.string(),
    room: z.string(),
    thread: z.string().nullable(),
    sender: z.string()
  }),
  revision: z.number().int().nonnegative(),
  cursor: z.string().nullable(),
  paused: z.boolean(),
  revoked: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const uarChannelDeliveriesSchema = z.object({
  subscriptionId: z.string(),
  cursor: z.string().nullable(),
  deliveries: z.array(
    z.object({
      deliveryId: z.string(),
      occurrenceId: z.string(),
      subscriberCursorId: z.string(),
      status: z.enum(['pending_authority', 'admitted', 'withheld', 'uncertain', 'acknowledged']),
      admittedAt: z.string(),
      updatedAt: z.string()
    })
  )
})

export const uarChannelObserversSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string(),
  generation: z.number().int().nonnegative(),
  supported: z.boolean(),
  unavailableReason: z.enum(['methodUnavailable', 'storageUnavailable', 'gateMissing']).optional(),
  operations: z.object({ pause: z.boolean(), resume: z.boolean(), revoke: z.boolean(), deliveries: z.boolean() }),
  subscriptions: z.array(uarChannelSubscriptionSchema)
})

export type UarChannelObserverAction = z.infer<typeof uarChannelObserverActionSchema>
export type UarChannelSubscription = z.infer<typeof uarChannelSubscriptionSchema>
export type UarChannelDeliveries = z.infer<typeof uarChannelDeliveriesSchema>
export type UarChannelObserversSnapshot = z.infer<typeof uarChannelObserversSnapshotSchema>
