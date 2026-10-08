import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { operate as operateTeam } from './operate-reusable-team.mjs'
import { gatewayEnvironment, requireFact } from './reusable-team-operation/io.mjs'

export async function operate(args = process.argv.slice(2)) {
  const at = args.indexOf('--selection')
  requireFact(at >= 0 && args[at + 1] && !args[at + 1].startsWith('--'), 'C15_REVIEWED_SELECTION_REQUIRED')
  const selectionFile = path.resolve(args[at + 1])
  const remaining = [...args.slice(0, at), ...args.slice(at + 2)]
  const bossAt = remaining.indexOf('--boss')
  requireFact(bossAt >= 0 && remaining[bossAt + 1], 'C15_ARGUMENTS')
  requireFact(fs.statSync(selectionFile).size <= 8 * 1024 * 1024, 'C15_REVIEWED_SELECTION_SIZE')
  const reviewedSource = fs.readFileSync(selectionFile, 'utf8')
  const gateway = gatewayEnvironment()
  const helper = path.join(path.resolve(remaining[bossAt + 1]), 'resources/skills/agent-team-creator/scripts/models-http.mjs')
  const { assertNoCredentials } = await import(pathToFileURL(helper).href)
  assertNoCredentials(JSON.parse(reviewedSource))
  requireFact(!reviewedSource.includes(process.env[gateway.credentialEnv]), 'C15_REVIEWED_SELECTION_CREDENTIALS_FORBIDDEN')
  return operateTeam(remaining, new URL('./reusable-team-operation/model-policy-scenario.mjs', import.meta.url), { reviewedSource })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile, failureCode: result.failureCode }) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch {
    process.stderr.write('C15 reviewed model policy operation prerequisites unavailable; raw results and credentials are not printed.\n')
    process.exitCode = 1
  }
}
