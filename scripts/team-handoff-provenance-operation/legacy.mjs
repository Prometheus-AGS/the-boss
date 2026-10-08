import fs from 'node:fs'
import path from 'node:path'

import { digest, requireFact } from '../reusable-team-operation/io.mjs'
import { addTask, command, create, creator, team } from './creator.mjs'
import { inspection, packetIdentity } from './receipts.mjs'

export function legacy(configuration, evidence) {
  const provenance = JSON.parse(fs.readFileSync(path.join(configuration.legacyCreator, 'operation-provenance.json'), 'utf8'))
  const oldCli = path.join(configuration.legacyCreator, 'scripts/cli.mjs')
  const oldHandoff = path.join(configuration.legacyCreator, 'scripts/handoff.mjs')
  requireFact(digest(fs.readFileSync(oldCli)) === provenance.cliSha256 &&
    digest(fs.readFileSync(oldHandoff)) === provenance.handoffSha256 &&
    provenance.cliSha256 === '7fd04d3d6c8caf00932e4d37a7b92fe1a007b3bf6599184f129f700aadae5a4d' &&
    provenance.handoffSha256 === '1510e7cbcac0e685dd155fca0369fd08d20163b0d8aa104dc846da8e836c14ae',
    'C15H_LEGACY_PRODUCER_IDENTITY_MISMATCH')
  const cwd = path.join(configuration.workspaceDirectory, 'legacy-workspace')
  fs.mkdirSync(cwd)
  requireFact(command('git', ['init', '--quiet', cwd], cwd).status === 0, 'C15H_GIT_WORKSPACE_UNAVAILABLE')
  const runtime = creator(oldCli, cwd, evidence)
  runtime.call('init', { team: team() })
  addTask(runtime, 'legacy-local-task')
  const packet = create(runtime, 'legacy-local-task', cwd)
  requireFact(packet.provenance === undefined, 'C15H_LEGACY_PRODUCER_NOT_LEGACY')
  const before = digest(fs.readFileSync(runtime.stateFile))
  const newRuntime = creator(configuration.creatorCli, cwd, evidence)
  const read = newRuntime.call('handoff-inspect', { id: packet.id, cwd })
  evidence.legacy = { origin: 'legacy packet generated at boundary by retained actual prior packaged producer',
    producer: { sourcePayloadRevision: provenance.sourcePayloadRevision, cliSha256: provenance.cliSha256,
      handoffSha256: provenance.handoffSha256, provenanceSha256: digest(fs.readFileSync(
        path.join(configuration.legacyCreator, 'operation-provenance.json'))) },
    packet: packetIdentity(packet), inspection: inspection(read), beforeStateSha256: before,
    afterStateSha256: digest(fs.readFileSync(runtime.stateFile)) }
  requireFact(read.legacy === true && read.captured === null && read.current === null &&
    evidence.legacy.afterStateSha256 === before, 'C15H_LEGACY_READ_MUTATED_OR_INVENTED_PROVENANCE')
}
