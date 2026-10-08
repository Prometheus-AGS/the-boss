import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { operate as operateTeam } from './operate-reusable-team.mjs'
import { digest } from './reusable-team-operation/io.mjs'

export function operate(args = process.argv.slice(2)) {
  const scenario = new URL('./practical-team-presets-operation/scenario.mjs', import.meta.url)
  return operateTeam(args, scenario, {
    creationTaskRef: 'C16.2',
    operationDriverSources: [import.meta.url, scenario.href,
      new URL('./practical-team-presets-operation/contracts.mjs', import.meta.url).href,
      new URL('./practical-team-presets-operation/authoring.mjs', import.meta.url).href,
      new URL('./practical-team-presets-operation/work.mjs', import.meta.url).href]
      .map((url) => ({ path: fileURLToPath(url), sha256: digest(fs.readFileSync(new URL(url))) })),
    prepareLauncher({ configuration }) {
      const bytes = '# Isolated practical-team brief\n\nDelivery marker: ' + configuration.marker +
        '\n\nThis is supplied fixture evidence, not a customer interview or live market research.\n' +
        'Product: a review workspace for small design teams. Need: clear acceptance criteria and readable feedback.\n' +
        'Brand: calm, precise and utilitarian. Audience: small product/design teams. Claims must use supplied evidence.\n' +
        'Campaign: prepare a draft onboarding message only; no distribution, publication or paid campaign.\n' +
        'Logo: propose a monochrome mark readable at small sizes; return concepts and production handoff, not rendered assets.\n' +
        'Mobile: Android with Kotlin/Compose; SDK version and physical device checks are unresolved.\n' +
        'Feedback fixture: text clips on a narrow review screen. No live repository or GitHub connector is selected.\n' +
        'Authority: read only this README and return team artifacts. No filesystem writes or external actions.\n'
      fs.writeFileSync(path.join(configuration.workspaceDirectory, 'README.md'), bytes)
      return { configuration: { workspaceSha256: digest(bytes) } }
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
    process.stderr.write('C16 practical preset operation prerequisites unavailable; private content is not printed.\n')
    process.exitCode = 1
  }
}
