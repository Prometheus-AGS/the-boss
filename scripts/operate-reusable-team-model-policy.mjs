import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { operate as operateTeam } from './operate-reusable-team.mjs'
import { digest, gatewayEnvironment, requireFact } from './reusable-team-operation/io.mjs'

export async function operate(args = process.argv.slice(2)) {
  if (args.includes('--guide')) return operateGuidance(args)
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

async function operateGuidance(args) {
  const remaining = [...args]
  const take = (name) => {
    const at = remaining.indexOf(name)
    requireFact(at >= 0 && remaining[at + 1] && !remaining[at + 1].startsWith('--'), 'C15_GUIDANCE_ARGUMENTS_REQUIRED')
    const value = remaining[at + 1]
    remaining.splice(at, 2)
    return value
  }
  requireFact(!remaining.includes('--selection'), 'C15_GUIDANCE_MANUAL_PATH_REQUIRES_NO_REVIEWED_SELECTION')
  const guideFile = path.resolve(take('--guide'))
  const template = take('--template')
  requireFact(['coding', 'product-design'].includes(template), 'C15_GUIDANCE_TEMPLATE_REQUIRED')
  const guidanceMappings = take('--guide-map').split(',').map((pair) => {
    const [sourceRole, memberRole, extra] = pair.split(':')
    requireFact(!extra && /^[a-z][a-z0-9-]{0,63}$/.test(sourceRole ?? '') && /^[a-z][a-z0-9-]{0,63}$/.test(memberRole ?? '') && memberRole !== 'coordinator', 'C15_GUIDANCE_EXPLICIT_MAPPING_REQUIRED')
    return { sourceRole, memberRole }
  })
  requireFact(new Set(guidanceMappings.map((item) => item.sourceRole)).size === guidanceMappings.length && new Set(guidanceMappings.map((item) => item.memberRole)).size === guidanceMappings.length, 'C15_GUIDANCE_UNIQUE_MAPPING_REQUIRED')
  requireFact(fs.statSync(guideFile).size <= 8 * 1024 * 1024, 'C15_GUIDANCE_SOURCE_SIZE')
  const guidanceSource = fs.readFileSync(guideFile, 'utf8')
  const result = JSON.parse(guidanceSource)
  requireFact(result.operation === 'create' && result.ready === true && Array.isArray(result.team?.roles) && guidanceMappings.every((mapping) => result.team.roles.some((role) => role.id === mapping.sourceRole)), 'C15_GUIDANCE_READY_CREATOR_RESULT_REQUIRED')
  const bossAt = remaining.indexOf('--boss')
  requireFact(bossAt >= 0 && remaining[bossAt + 1], 'C15_ARGUMENTS')
  const gateway = gatewayEnvironment()
  const helper = path.join(path.resolve(remaining[bossAt + 1]), 'resources/skills/agent-team-creator/scripts/models-http.mjs')
  const { assertNoCredentials } = await import(pathToFileURL(helper).href)
  assertNoCredentials(result)
  requireFact(!guidanceSource.includes(process.env[gateway.credentialEnv]), 'C15_GUIDANCE_CREDENTIALS_FORBIDDEN')
  const scenarioUrl = new URL('./reusable-team-operation/role-guidance-scenario.mjs', import.meta.url)
  return operateTeam(remaining, scenarioUrl, {
    template, guidanceSource, guidanceMappings,
    operationDriverSources: [import.meta.url, scenarioUrl.href].map((url) => ({
      path: fileURLToPath(url),
      sha256: digest(fs.readFileSync(new URL(url)))
    }))
  })
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
