import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { digest, requireFact, write } from './reusable-team-operation/io.mjs'

const initiative = '/Users/gqadonis/Projects/prometheus/worktrees/agent-fabric-c06/librefang/docs/plans/agent-fabric-convergence'
function inventory(root) {
  const result = {}
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile() && entry.name.endsWith('.mjs')) result[path.relative(root, file)] = digest(fs.readFileSync(file))
    }
  }
  walk(root)
  return result
}

export async function operate(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    requireFact(['--boss', '--launcher', '--output', '--legacy-creator'].includes(args[index]) &&
      args[index + 1] && !args[index + 1].startsWith('--'), 'C15H_ARGUMENTS')
    options[args[index].slice(2)] = path.resolve(args[++index])
  }
  requireFact(options.boss && options.launcher && options.output, 'C15H_ARGUMENTS')
  fs.mkdirSync(options.output, { recursive: true })
  const output = path.join(fs.realpathSync(options.output), 'c15-handoff-' + randomUUID())
  fs.mkdirSync(output, { mode: 0o700 })
  const evidence = path.join(output, 'evidence.json')
  const launchReceipt = path.join(output, 'launch.json')
  const operation = { schemaVersion: 1, kind: 'completed-feature-operation', creationTaskRef: 'C15.3',
    status: 'blocked', startedAt: new Date().toISOString(), evidenceLevel: 'real-packaged-application-and-bundled-creator-cli',
    normalProfile: true, experimentalOptIn: false, wholeC15_3Completion: 'pending', nativeWindowsAcceptance: 'pending' }
  let stage = 'packaged-prerequisites'
  try {
    requireFact(Number(process.versions.node.split('.')[0]) >= 22, 'C15H_NODE_22_REQUIRED')
    requireFact(process.platform === 'darwin', 'C15H_PACKAGED_PLATFORM_LAUNCHER_UNAVAILABLE')
    const app = path.join(options.boss, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app')
    const resources = path.join(app, 'Contents/Resources')
    const creatorScripts = path.join(resources, 'app.asar.unpacked/resources/prometheus-skills-mini/skills/agent-team-creator/scripts')
    requireFact(fs.existsSync(path.join(resources, 'app.asar')) &&
      fs.existsSync(path.join(creatorScripts, 'handoff-provenance.mjs')), 'C15H_COMPLETE_HANDOFF_PACKAGE_REQUIRED')
    const creatorCli = fs.realpathSync(path.join(creatorScripts, 'cli.mjs'))
    requireFact(creatorCli.startsWith(fs.realpathSync(resources) + path.sep), 'C15H_BUNDLED_CREATOR_REQUIRED')
    const kbdCli = process.env.BOSS_C15_KBD_CLI ?? '/Users/gqadonis/.local/bin/prometheus'
    requireFact(path.isAbsolute(kbdCli), 'C15H_EXPLICIT_CANONICAL_READER_REQUIRED')
    const karpathyFile = path.resolve(process.env.BOSS_C15_KARPATHY_FILE ??
      path.join(initiative, '.prometheus/cadence/artifacts/c09-1-karpathy-event.json'))
    const legacyCreator = options['legacy-creator'] ?? path.join(initiative,
      '.prometheus/cadence/artifacts/c15-legacy-creator-runtime-20261008')
    const scenarioUrl = new URL('./team-handoff-provenance-operation/scenario.mjs', import.meta.url)
    operation.sourceRefs = {
      boss: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.boss, encoding: 'utf8' }).trim(),
      bossDiffSha256: digest(execFileSync('git', ['diff', 'HEAD'], { cwd: options.boss })),
      appAsarSha256: digest(fs.readFileSync(path.join(resources, 'app.asar'))),
      launcherSha256: digest(fs.readFileSync(options.launcher)), nodeVersion: process.versions.node,
      canonicalReader: { path: kbdCli, sha256: digest(fs.readFileSync(kbdCli)) },
      bundledCreator: { cli: creatorCli, modules: inventory(creatorScripts) },
      selectedKarpathy: { path: karpathyFile, sha256: digest(fs.readFileSync(karpathyFile)),
        association: process.env.BOSS_C15_KARPATHY_FILE ? 'operator-selected-existing-reference' : 'existing-historical-C09.1-reference' },
      operationDriverSources: Object.fromEntries([fileURLToPath(import.meta.url),
        ...['scenario.mjs', 'creator.mjs', 'receipts.mjs', 'legacy.mjs'].map((name) =>
          fileURLToPath(new URL('./team-handoff-provenance-operation/' + name, import.meta.url))),
        fileURLToPath(new URL('./reusable-team-operation/io.mjs', import.meta.url))]
        .map((file) => [path.relative(options.boss, file), digest(fs.readFileSync(file))])) }
    const workspaceDirectory = path.join(output, 'workspace')
    fs.mkdirSync(workspaceDirectory, { mode: 0o700 })
    execFileSync('git', ['init', '--quiet', workspaceDirectory], { stdio: 'ignore' })
    const configuration = { sourceRefs: operation.sourceRefs, evidence, workspaceDirectory, creatorCli,
      kbdCli, kbdPath: initiative, karpathyFile, legacyCreator }
    const scenarioFile = path.join(output, 'packaged-scenario.mjs')
    fs.writeFileSync(scenarioFile, `import {scenario} from ${JSON.stringify(scenarioUrl.href)}\n` +
      `export default context=>scenario(context,${JSON.stringify(configuration)})\n`, { flag: 'wx', mode: 0o600 })
    stage = 'launch-and-operate-complete-package'
    const { launchBoss } = await import(pathToFileURL(options.launcher).href)
    requireFact(typeof launchBoss === 'function', 'C15H_MAINTAINED_LAUNCHER_UNAVAILABLE')
    const launch = await launchBoss({ repository: options.boss, app, scenario: scenarioFile,
      'require-scenario': true, 'timeout-ms': 600000, receipt: launchReceipt })
    operation.launchReceipt = launch.receiptFile
    operation.functionalAcceptance = launch.functionalAcceptance
    if (launch.status === 'success' && launch.functionalAcceptance === 'scenario-confirmed') operation.status = 'success'
    else operation.failureCode = 'C15H_PACKAGED_LAUNCH_OR_SCENARIO_UNAVAILABLE'
  } catch (error) {
    operation.failureStage = stage
    operation.failureCode = /^C15H_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C15H_PREREQUISITE_OR_LAUNCH_UNAVAILABLE'
  }
  if (fs.existsSync(launchReceipt)) Object.assign(operation, { launchReceipt,
    launchReceiptSha256: digest(fs.readFileSync(launchReceipt)) })
  if (fs.existsSync(evidence)) {
    const observed = JSON.parse(fs.readFileSync(evidence, 'utf8'))
    Object.assign(operation, { evidence, evidenceSha256: digest(fs.readFileSync(evidence)), checks: observed.checks,
      ...(observed.failureCode ? { failureCode: observed.failureCode, failureStage: observed.failureStage } : {}) })
    if (!observed.complete) operation.status = 'blocked'
  } else operation.status = 'blocked'
  operation.finishedAt = new Date().toISOString()
  const receiptFile = path.join(output, 'operation.json')
  write(receiptFile, operation)
  return { ...operation, receiptFile }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile, failureCode: result.failureCode }) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch {
    process.stderr.write('C15 handoff operation prerequisites unavailable; private content and raw diagnostics are not printed.\n')
    process.exitCode = 1
  }
}
