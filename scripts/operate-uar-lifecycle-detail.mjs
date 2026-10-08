import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { digest, write, requireFact, gatewayEnvironment } from './uar-lifecycle-detail-operation/io.mjs'

export async function operate(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    requireFact(
      ['--boss', '--launcher', '--output'].includes(args[index]) &&
        args[index + 1] &&
        !args[index + 1].startsWith('--'),
      'C14D_ARGUMENTS'
    )
    options[args[index].slice(2)] = path.resolve(args[++index])
  }
  requireFact(options.boss && options.launcher && options.output, 'C14D_ARGUMENTS')
  fs.mkdirSync(options.output, { recursive: true })
  const output = path.join(fs.realpathSync(options.output), 'c14-detail-' + randomUUID())
  fs.mkdirSync(output)
  const operation = {
    schemaVersion: 1,
    kind: 'completed-feature-operation',
    creationTaskRef: 'C14.1',
    status: 'blocked',
    startedAt: new Date().toISOString(),
    evidenceLevel: 'real-packaged-lifecycle-detail',
    acceptanceScope: 'lifecycle-detail consumer increment; no full C14.1 or Windows installed acceptance',
    normalProfile: true,
    experimentalOptIn: false
  }
  try {
    requireFact(process.platform === 'darwin', 'C14D_PACKAGED_PLATFORM_LAUNCHER_UNAVAILABLE')
    requireFact(
      [
        'UAR_TEAM_EXECUTION_PROFILE_STAGE',
        'UAR_WORKFLOW_EXECUTION_PROFILE_STAGE',
        'BOSS_C094_PUBLIC_QUALIFICATION'
      ].every((name) => process.env[name] === undefined),
      'C14D_EXPERIMENTAL_PROFILE_PRESENT'
    )
    const gateway = gatewayEnvironment()
    const app = path.join(options.boss, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app')
    const resources = path.join(app, 'Contents/Resources')
    const payload = path.join(resources, 'app.asar.unpacked/resources/binaries', 'darwin-' + process.arch)
    const pinFile = path.join(options.boss, 'build/local-uar-source.json')
    requireFact(
      fs.existsSync(path.join(resources, 'app.asar')) && fs.existsSync(path.join(payload, 'uar-sidecar')),
      'C14D_COMPLETE_PACKAGE_REQUIRED'
    )
    const pin = JSON.parse(fs.readFileSync(pinFile, 'utf8'))
    requireFact(
      JSON.parse(fs.readFileSync(path.join(payload, '.uar-local-payload.json'), 'utf8')).source === pin.revision,
      'C14D_SOURCE_PIN_MISMATCH'
    )
    const sourceRefs = {
      boss: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.boss, encoding: 'utf8' }).trim(),
      uar: pin.revision,
      bossDiffSha256: digest(execFileSync('git', ['diff', 'HEAD'], { cwd: options.boss })),
      sourcePinSha256: digest(fs.readFileSync(pinFile)),
      appAsarSha256: digest(fs.readFileSync(path.join(resources, 'app.asar'))),
      sidecarSha256: digest(fs.readFileSync(path.join(payload, 'uar-sidecar'))),
      launcherSha256: digest(fs.readFileSync(options.launcher)),
      scenarioFiles: Object.fromEntries(
        [
          'operate-uar-lifecycle-detail.mjs',
          'uar-lifecycle-detail-operation/scenario.mjs',
          'uar-lifecycle-detail-operation/io.mjs',
          'uar-lifecycle-detail-operation/records.mjs',
          'uar-lifecycle-detail-operation/workflow.mjs',
          'uar-lifecycle-detail-operation/assertions.mjs',
          'uar-administration-operation/clients.mjs',
          'uar-administration-operation/io.mjs',
          'approval-lifecycle-operation/setup.mjs',
          'approval-lifecycle-operation/io.mjs',
          'approval-lifecycle-operation/clients.mjs',
          'cadence/uar-team-cooperation-host.mjs',
          'cadence/uar-team-operation-tools.mjs'
        ].map((name) => [name, digest(fs.readFileSync(new URL(name, import.meta.url)))])
      )
    }
    const workspaceDirectory = path.join(output, 'workspace')
    fs.mkdirSync(workspaceDirectory)
    const marker = 'C14D-' + path.basename(output)
    const bytes =
      '# Isolated product brief\n\nDelivery marker: ' + marker + '\n\nUser need: a clear, accessible review workflow.\n'
    fs.writeFileSync(path.join(workspaceDirectory, 'README.md'), bytes, { flag: 'wx' })
    execFileSync('git', ['init', '--quiet', workspaceDirectory], { stdio: 'ignore' })
    const evidence = path.join(output, 'evidence.json')
    const configuration = {
      sourceRefs, gateway, evidence, workspaceDirectory, marker,
      workspaceSha256: digest(bytes), repository: options.boss
    }
    const scenarioFile = path.join(output, 'packaged-scenario.mjs')
    fs.writeFileSync(
      scenarioFile,
      `import {scenario} from ${JSON.stringify(new URL('./uar-lifecycle-detail-operation/scenario.mjs', import.meta.url).href)}\nexport default context=>scenario(context,${JSON.stringify(configuration)})\n`,
      { flag: 'wx', mode: 0o600 }
    )
    const { launchBoss } = await import(pathToFileURL(options.launcher).href)
    requireFact(typeof launchBoss === 'function', 'C14D_MAINTAINED_LAUNCHER_UNAVAILABLE')
    const launch = await launchBoss({
      repository: options.boss,
      app,
      scenario: scenarioFile,
      'require-scenario': true,
      'timeout-ms': 1200000,
      receipt: path.join(output, 'launch.json')
    })
    const observed = fs.existsSync(evidence) ? JSON.parse(fs.readFileSync(evidence, 'utf8')) : null
    Object.assign(operation, {
      sourceRefs,
      launchReceipt: launch.receiptFile,
      functionalAcceptance: launch.functionalAcceptance,
      checks: observed?.checks ?? [],
      ...(observed ? { evidence, evidenceSha256: digest(fs.readFileSync(evidence)) } : {})
    })
    if (launch.status === 'success' && launch.functionalAcceptance === 'scenario-confirmed' && observed?.complete)
      operation.status = 'success'
    else operation.failureCode = observed?.failureCode ?? 'C14D_PACKAGED_LAUNCH_OR_SCENARIO_UNAVAILABLE'
  } catch (error) {
    operation.failureCode = /^C14[12D]_[A-Z0-9_]+$/.test(error.code ?? '')
      ? error.code
      : 'C14D_PREREQUISITE_OR_LAUNCH_UNAVAILABLE'
  }
  operation.finishedAt = new Date().toISOString()
  const receiptFile = path.join(output, 'operation.json')
  write(receiptFile, operation)
  return { ...operation, receiptFile }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(
      JSON.stringify({ status: result.status, receiptFile: result.receiptFile, failureCode: result.failureCode }) + '\n'
    )
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch {
    process.stderr.write('C14D operation arguments unavailable; credentials and raw diagnostics are not printed.\n')
    process.exitCode = 1
  }
}
