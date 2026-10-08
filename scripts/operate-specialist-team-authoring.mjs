import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { operate as operateTeam } from './operate-reusable-team.mjs'
import { digest } from './reusable-team-operation/io.mjs'

export function operate(args = process.argv.slice(2)) {
  const scenario = new URL('./specialist-team-operation/scenario.mjs', import.meta.url)
  return operateTeam(args, scenario, {
    creationTaskRef: 'C16.1',
    operationDriverSources: [import.meta.url, scenario.href,
      new URL('./specialist-team-operation/contracts.mjs', import.meta.url).href]
      .map((url) => ({ path: fileURLToPath(url), sha256: digest(fs.readFileSync(new URL(url))) }))
  })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile,
      failureCode: result.failureCode }) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch {
    process.stderr.write('C16 specialist operation prerequisites unavailable; private content is not printed.\n')
    process.exitCode = 1
  }
}
