import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { operate as operateTeam } from './operate-reusable-team.mjs'
import { digest, requireFact } from './reusable-team-operation/io.mjs'

export function operate(args = process.argv.slice(2)) {
  const scenario = new URL('./team-guidance-operation/scenario.mjs', import.meta.url)
  return operateTeam(args, scenario, {
    creationTaskRef: 'C16.3',
    operationDriverSources: [import.meta.url, scenario.href,
      new URL('./practical-team-presets-operation/authoring.mjs', import.meta.url).href].map((url) => ({
      path: fileURLToPath(url), sha256: digest(fs.readFileSync(new URL(url)))
    })),
    async prepareLauncher({ resources, configuration }) {
      const runtime = path.join(resources, 'skills/agent-team-creator/scripts')
      const { guide } = await import(pathToFileURL(path.join(runtime, 'guidance.mjs')).href)
      const { selectModel } = await import(pathToFileURL(path.join(runtime, 'models.mjs')).href)
      const guidance = guide({ id: 'guidance-operation', outcome: 'Research the supplied project brief.',
        complexity: 'simple', areas: ['product'], deliverables: ['Evidence-backed research brief'],
        budget: 'balanced', review: true, harness: 'codex', scope: 'project',
        ownership: { implementer: ['notes/research.md'], reviewer: ['notes/review.md'] } })
      requireFact(guidance.ready && guidance.alternatives?.length && guidance.skillDiscovery,
        'C15_GUIDANCE_CREATOR_OUTPUT_UNAVAILABLE')
      const selectionTeam = { ...guidance.team,
        modelPolicy: { model: configuration.gateway.alias },
        roles: guidance.team.roles.map((role) => {
          const selectedRole = { ...role }
          delete selectedRole.modelPolicy
          return selectedRole
        }) }
      const policy = selectModel(selectionTeam, 'implementer', [], {}, {
        availableModels: [configuration.gateway.alias]
      })
      requireFact(policy.selected?.tier === null && policy.selected.pricing.inputPerMillion === null &&
        policy.selected.pricing.outputPerMillion === null, 'C15_GUIDANCE_UNKNOWN_METADATA_CHANGED')
      return { configuration: { guidanceSource: JSON.stringify(guidance),
        reviewedSource: JSON.stringify(policy),
        modelAvailabilityEvidence: 'operator-declared configured alias; no new inference claimed' } }
    }
  })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile,
      failureCode: result.failureCode }) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch {
    process.stderr.write('Team guidance operation prerequisites unavailable; private inputs are not printed.\n')
    process.exitCode = 1
  }
}
