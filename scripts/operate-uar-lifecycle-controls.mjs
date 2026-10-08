import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { digest, write, requireFact, gatewayEnvironment, failure } from './uar-lifecycle-controls-operation/io.mjs'

const inheritedReceipts = (repository) => {
  const directory = path.join(repository, 'openspec/changes/afc-c14-approval-lifecycle/evidence')
  const inventoryFile = path.join(directory, 'receipt-inventory.json')
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'))
  return {
    inventoryFile, inventorySha256: digest(fs.readFileSync(inventoryFile)), rerun: false,
    receipts: ['first-packaged-operation.json', 'corrective-cancellation-operation.json'].map((name) => {
      const file = path.join(directory, name)
      const sha256 = digest(fs.readFileSync(file))
      requireFact(inventory.receipts.some((item) => item.file === name && item.sha256 === sha256),
        'C14C_PRESERVED_RECEIPT_HASH_MISMATCH')
      const previous = JSON.parse(fs.readFileSync(file, 'utf8'))
      return { file, sha256, sourceRefs: previous.sourceRefs, completeAtOriginalBoundary: previous.complete,
        recordedPassingChecks: previous.checks, scope: name.startsWith('first-')
          ? 'Canonical two-client challenge/decision, stale opposing decision, detach/reattach and actual approved effect; original cancellation clause failed.'
          : 'Visible Stop, durable cancellation without human decision, restart/recovery and no added attempt or repeated effect.' }
    })
  }
}

export async function operate(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    requireFact(['--boss', '--launcher', '--output'].includes(args[index]) && args[index + 1] &&
      !args[index + 1].startsWith('--'), 'C14C_ARGUMENTS')
    options[args[index].slice(2)] = path.resolve(args[++index])
  }
  requireFact(options.boss && options.launcher && options.output, 'C14C_ARGUMENTS')
  fs.mkdirSync(options.output, { recursive: true })
  const output = path.join(fs.realpathSync(options.output), 'c14-controls-' + randomUUID())
  fs.mkdirSync(output)
  const operation = { schemaVersion: 1, kind: 'completed-feature-operation', creationTaskRef: 'C14.2',
    status: 'blocked', startedAt: new Date().toISOString(), evidenceLevel: 'real-packaged-lifecycle-controls',
    acceptanceScope: 'distinct Drain and supported-control/profile/selected-administration increment; no native Windows acceptance',
    normalProfile: true, experimentalOptIn: false }
  let stage = 'prerequisites'
  try {
    requireFact(process.platform === 'darwin', 'C14C_PACKAGED_PLATFORM_LAUNCHER_UNAVAILABLE')
    requireFact(['UAR_TEAM_EXECUTION_PROFILE_STAGE', 'UAR_WORKFLOW_EXECUTION_PROFILE_STAGE',
      'BOSS_C094_PUBLIC_QUALIFICATION'].every((name) => process.env[name] === undefined), 'C14C_EXPERIMENTAL_PROFILE_PRESENT')
    const gateway = gatewayEnvironment()
    const app = path.join(options.boss, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app')
    const resources = path.join(app, 'Contents/Resources')
    const payload = path.join(resources, 'app.asar.unpacked/resources/binaries', 'darwin-' + process.arch)
    const pinFile = path.join(options.boss, 'build/local-uar-source.json')
    requireFact(fs.existsSync(path.join(resources, 'app.asar')) && fs.existsSync(path.join(payload, 'uar-sidecar')),
      'C14C_COMPLETE_PACKAGE_REQUIRED')
    const pin = JSON.parse(fs.readFileSync(pinFile, 'utf8'))
    const markerFile = path.join(payload, '.uar-local-payload.json')
    requireFact(JSON.parse(fs.readFileSync(markerFile, 'utf8')).source === pin.revision, 'C14C_SOURCE_PIN_MISMATCH')
    const surrealBinary = process.env.BOSS_CADENCE_SURREAL_BINARY ?? path.join(os.homedir(), '.prometheus/bin/surreal-3.3.0')
    const helperFiles = ['operate-uar-lifecycle-controls.mjs', 'uar-lifecycle-controls-operation/io.mjs',
      'uar-lifecycle-controls-operation/clients.mjs', 'uar-lifecycle-controls-operation/scenario.mjs',
      'uar-administration-operation/clients.mjs', 'uar-administration-operation/io.mjs',
      'approval-lifecycle-operation/setup.mjs', 'approval-lifecycle-operation/io.mjs', 'approval-lifecycle-operation/clients.mjs',
      'cadence/uar-team-cooperation-host.mjs', 'cadence/uar-team-operation-tools.mjs', 'uar-payload-integrity.cjs']
    const sourceRefs = {
      boss: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.boss, encoding: 'utf8' }).trim(), uar: pin.revision,
      bossDiffSha256: digest(execFileSync('git', ['diff', 'HEAD'], { cwd: options.boss })),
      sourcePinSha256: digest(fs.readFileSync(pinFile)), payloadMarkerSha256: digest(fs.readFileSync(markerFile)),
      payloadManifestSha256: digest(fs.readFileSync(path.join(payload, 'payload-manifest.json'))),
      appAsarSha256: digest(fs.readFileSync(path.join(resources, 'app.asar'))), sidecarSha256: digest(fs.readFileSync(path.join(payload, 'uar-sidecar'))),
      surrealBinary, surrealSha256: digest(fs.readFileSync(surrealBinary)),
      launcher: options.launcher, launcherSha256: digest(fs.readFileSync(options.launcher)),
      scenarioFiles: Object.fromEntries(helperFiles.map((name) => [name, digest(fs.readFileSync(new URL(name, import.meta.url)))]))
    }
    const previousReceipts = inheritedReceipts(options.boss)
    Object.assign(operation, { sourceRefs, previousReceipts })
    const workspaceDirectory = path.join(output, 'workspace')
    fs.mkdirSync(workspaceDirectory)
    const marker = 'C14C-' + path.basename(output)
    const bytes = '# Isolated lifecycle controls operation\n\nDelivery marker: ' + marker + '\n'
    fs.writeFileSync(path.join(workspaceDirectory, 'README.md'), bytes, { flag: 'wx' })
    execFileSync('git', ['init', '--quiet', workspaceDirectory], { stdio: 'ignore' })
    const evidence = path.join(output, 'evidence.json')
    const configuration = { sourceRefs, previousReceipts, gateway, evidence, workspaceDirectory, marker,
      workspaceSha256: digest(bytes), repository: options.boss }
    const scenarioFile = path.join(output, 'packaged-scenario.mjs')
    fs.writeFileSync(scenarioFile,
      `import {scenario} from ${JSON.stringify(new URL('./uar-lifecycle-controls-operation/scenario.mjs', import.meta.url).href)}\nexport default context=>scenario(context,${JSON.stringify(configuration)})\n`,
      { flag: 'wx', mode: 0o600 })
    const { launchBoss } = await import(pathToFileURL(options.launcher).href)
    requireFact(typeof launchBoss === 'function', 'C14C_MAINTAINED_LAUNCHER_UNAVAILABLE')
    stage = 'maintained-packaged-launch-and-scenario'
    const launch = await launchBoss({ repository: options.boss, app, scenario: scenarioFile,
      'require-scenario': true, 'timeout-ms': 1200000, receipt: path.join(output, 'launch.json') })
    const observed = fs.existsSync(evidence) ? JSON.parse(fs.readFileSync(evidence, 'utf8')) : null
    Object.assign(operation, { launchReceipt: launch.receiptFile, functionalAcceptance: launch.functionalAcceptance,
      checks: observed?.checks ?? [], ...(observed ? { evidence, evidenceSha256: digest(fs.readFileSync(evidence)),
        limitations: observed.limitations } : {}) })
    if (launch.status === 'success' && launch.functionalAcceptance === 'scenario-confirmed' && observed?.complete)
      operation.status = 'success'
    else operation.failure = observed?.failure ?? { stage, code: 'C14C_PACKAGED_LAUNCH_OR_SCENARIO_UNAVAILABLE' }
    if (observed?.actionFailure) operation.actionFailure = observed.actionFailure
    if (observed?.cleanupFailure) operation.cleanupFailure = observed.cleanupFailure
    if (observed?.hostCleanupFailure) operation.hostCleanupFailure = observed.hostCleanupFailure
  } catch (error) {
    operation.failure = failure(error, stage)
  }
  operation.finishedAt = new Date().toISOString()
  const receiptFile = path.join(output, 'operation.json')
  write(receiptFile, operation)
  return { ...operation, receiptFile }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile, failure: result.failure }) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch (error) {
    process.stderr.write(JSON.stringify(failure(error, 'operation-arguments-or-receipt-write')) + '\n')
    process.exitCode = 1
  }
}
