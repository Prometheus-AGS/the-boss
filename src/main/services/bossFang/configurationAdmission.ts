import * as z from 'zod'

import { t } from '@main/i18n'

/** Applying settings must not terminate an execution carrying its original authority. */
export async function requireIdleBossFang(request: (path: string) => Promise<Response>) {
  const read = async (path: string) => {
    const response = await request(path)
    if (!response.ok) throw new Error(t('bossfang.configurationBusy'))
    return response.json()
  }
  const { connections } = z
    .object({
      connections: z.array(
        z.object({
          executionState: z.string(),
          cancellation: z.object({ requested: z.boolean(), terminal: z.boolean(), cleanupUncertain: z.boolean() })
        })
      )
    })
    .parse(await read('/api/uar/connections'))
  if (
    connections.some(
      (run) =>
        !['completed', 'failed', 'cancelled'].includes(run.executionState) ||
        (run.cancellation.requested && (!run.cancellation.terminal || run.cancellation.cleanupUncertain))
    )
  )
    throw new Error(t('bossfang.configurationBusy'))
  let offset = 0
  for (;;) {
    const page = z
      .object({ items: z.array(z.object({ id: z.string().uuid() })), total: z.number() })
      .parse(await read('/api/agents?include_hands=true&limit=100&offset=' + offset))
    for (const agent of page.items) {
      const running = z.array(z.unknown()).parse(await read('/api/agents/' + agent.id + '/runtime'))
      if (running.length) throw new Error(t('bossfang.configurationBusy'))
    }
    offset += page.items.length
    if (offset >= page.total) return
    if (!page.items.length) throw new Error(t('bossfang.configurationBusy'))
  }
}
