import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { operate as operateTeam } from './operate-reusable-team.mjs'
import { digest, requireFact } from './reusable-team-operation/io.mjs'
import { createAndExerciseDisposableFullGeneration } from './team-reviewed-skills-operation/full-generation.mjs'

export async function operate(args = process.argv.slice(2)) {
  const values = [...args]
  const source = process.env.BOSS_C15_FULL_SOURCE ??
    '/Users/gqadonis/Projects/prometheus/worktrees/cadence-nested-source-full'
  if (!values.includes('--launcher')) values.push('--launcher', path.join(source,
    'skills/process/delivery-cadence/scripts/boss-launch.mjs'))
  const driver = new URL('./team-reviewed-skills-operation/scenario.mjs', import.meta.url)
  requireFact(fs.existsSync(driver), 'C15_REVIEWED_SKILL_OPERATION_UNAVAILABLE')
  const bossAt = values.indexOf('--boss')
  requireFact(bossAt >= 0 && values[bossAt + 1], 'C15_ARGUMENTS')
  const appResources = path.join(path.resolve(values[bossAt + 1]), 'dist',
    process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app', 'Contents/Resources')
  return operateTeam(values, driver, {
    creationTaskRef: 'C15.3',
    fullSourceRoot: source,
    appResources,
    prepareLauncher: async ({ output, resources }) => {
      const fullGenerationRoot = path.join(output, 'c15-full-generation')
      const fullHome = path.join(fullGenerationRoot, 'home')
      const preparation = {}
      const preparedFullGeneration = await createAndExerciseDisposableFullGeneration({
        executable: process.execPath,
        fullSourceRoot: source,
        outputRoot: fullGenerationRoot,
        isolatedUserData: output,
        verifierScript: path.join(resources, 'app.asar.unpacked', 'resources', 'prometheus-skills-mini',
          'reviewed-verifier', 'scripts', 'verify-reviewed-skill-coverage.js'),
        signal: new AbortController().signal,
        evidence: preparation
      })
      requireFact(preparedFullGeneration.complete === true, 'C15_PRELAUNCH_FULL_GENERATION_INCOMPLETE')
      return {
        environment: { HOME: fullHome },
        configuration: { fullHome, preparedFullGeneration }
      }
    },
    operationDriverSources: [import.meta.url, driver.href,
      new URL('./team-reviewed-skills-operation/runtime-scenarios.mjs', import.meta.url).href,
      new URL('./team-reviewed-skills-operation/full-generation.mjs', import.meta.url).href]
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
    process.stderr.write('C15 reviewed skill operation prerequisites unavailable; private content is not printed.\n')
    process.exitCode = 1
  }
}
