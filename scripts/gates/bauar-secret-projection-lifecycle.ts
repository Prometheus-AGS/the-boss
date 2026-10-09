import { join } from 'node:path'

import type { ElectronApplication } from '@playwright/test'

/** Await real connection disposal so the next turn rehydrates persisted history. */
export async function closeProjectionHistorySession(app: ElectronApplication, sessionId: string): Promise<void> {
  await app.evaluate(async (_, input) => {
    const { createRequire } = process.getBuiltinModule('node:module')
    const { readdirSync } = process.getBuiltinModule('node:fs')
    const { join } = process.getBuiltinModule('node:path')
    const require = createRequire(join(input.mainDirectory, 'main.js'))
    const chunks = readdirSync(input.mainDirectory).filter((name) => /^Application-[^/]+\.js$/.test(name))
    if (chunks.length !== 1) throw new Error('Projection lifecycle Application chunk is ambiguous')
    const chunk = require.cache[require.resolve(join(input.mainDirectory, chunks[0]))]
    if (!chunk) throw new Error('Projection lifecycle Application chunk is not loaded')
    await chunk.exports.application.get('AgentSessionRuntimeService').closeSession(input.sessionId)
  }, { mainDirectory: join(process.cwd(), 'out/main'), sessionId })
}
