import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { operate as operateTeam } from './operate-reusable-team.mjs'
import { digest, requireFact } from './reusable-team-operation/io.mjs'

export async function operate(args = process.argv.slice(2)) {
  const bossAt = args.indexOf('--boss')
  requireFact(bossAt >= 0 && args[bossAt + 1], 'C15_ARGUMENTS')
  const boss = path.resolve(args[bossAt + 1])
  const creatorScripts = path.join(boss, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac',
    'The Boss.app/Contents/Resources/app.asar.unpacked/resources/prometheus-skills-mini/skills/agent-team-creator/scripts')
  const scenarioUrl = new URL('./reusable-team-operation/model-issuance-scenario.mjs', import.meta.url)
  return operateTeam(args, scenarioUrl, {
    creatorScripts,
    bundledSelectorSources: Object.fromEntries(['cli.mjs', 'models.mjs', 'models-http.mjs', 'validation.mjs', 'types.mjs'].map(
      (name) => [name, digest(fs.readFileSync(path.join(creatorScripts, name)))]
    )),
    operationDriverSources: [import.meta.url, scenarioUrl.href].map((url) => ({
      path: fileURLToPath(url), sha256: digest(fs.readFileSync(new URL(url)))
    }))
  })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile, failureCode: result.failureCode }) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch {
    process.stderr.write('C15 model issuance prerequisites unavailable; credentials and raw selector diagnostics are not printed.\n')
    process.exitCode = 1
  }
}
