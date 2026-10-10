import * as z from 'zod'

export const uarTeamRunEventsSchema = z.object({
  version: z.literal(1),
  runId: z.string().min(1),
  after: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  retention: z.literal('process-local-bounded'),
  firstAvailableEventId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  gapReason: z.enum(['retention-gap', 'cursor-ahead']).nullable(),
  events: z.array(
    z.object({
      eventId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      eventName: z.string().min(1),
      data: z.unknown()
    })
  )
})

export type UarTeamRunEventsSnapshot = z.infer<typeof uarTeamRunEventsSchema> & {
  teamInstanceId: string
  attemptId: string
}
