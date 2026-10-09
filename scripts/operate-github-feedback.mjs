import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { digest, gatewayEnvironment, requireFact, write } from './reusable-team-operation/io.mjs'
import { attach } from './github-feedback-operation/client.mjs'
import { scenario } from './github-feedback-operation/scenario.mjs'

const maintainedLauncher = '/Users/gqadonis/Projects/prometheus/worktrees/cadence-nested-source-full/skills/process/delivery-cadence/scripts/boss-launch.mjs'
const paths = ['boss', 'launcher', 'output', 'feedback', 'resume']
const modes = ['prepare', 'publish', 'cancel', 'reconcile', 'reopen']

function argumentsOf(args) {
  const options = {
    boss: process.cwd(), launcher: maintainedLauncher, mode: process.env.BOSS_C10_OPERATION_MODE ?? 'prepare',
    target: process.env.BOSS_C10_GITHUB_TARGET, feedback: process.env.BOSS_C10_FEEDBACK_FILE,
    output: process.env.BOSS_C10_OUTPUT_DIR, resume: process.env.BOSS_C10_RESUME_RECEIPT,
    artifactDigest: process.env.BOSS_C10_APPROVED_ARTIFACT_DIGEST,
    payloadDigest: process.env.BOSS_C10_APPROVED_PAYLOAD_DIGEST
  }
  const names = { '--boss': 'boss', '--launcher': 'launcher', '--output': 'output', '--mode': 'mode',
    '--target': 'target', '--feedback': 'feedback', '--resume': 'resume',
    '--artifact-digest': 'artifactDigest', '--payload-digest': 'payloadDigest' }
  for (let index = 0; index < args.length; index++) {
    const name = names[args[index]]
    requireFact(name && args[index + 1] && !args[index + 1].startsWith('--'), 'C10_ARGUMENTS_REQUIRED')
    options[name] = args[++index]
  }
  for (const name of paths) if (options[name]) options[name] = path.resolve(options[name])
  requireFact(options.output, 'C10_OUTPUT_DIRECTORY_REQUIRED')
  requireFact(modes.includes(options.mode), 'C10_OPERATION_MODE_REQUIRED')
  return options
}

function sourceRefs(options) {
  const app = path.join(options.boss, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app')
  const resources = path.join(app, 'Contents/Resources')
  const payload = path.join(resources, 'app.asar.unpacked/resources/binaries', 'darwin-' + process.arch)
  const pinFile = path.join(options.boss, 'build/local-uar-source.json')
  requireFact(fs.existsSync(path.join(resources, 'app.asar')) && fs.existsSync(path.join(payload, 'uar-sidecar')) &&
    fs.existsSync(pinFile), 'C10_COMPLETE_NATIVE_PACKAGE_REQUIRED')
  const pin = JSON.parse(fs.readFileSync(pinFile, 'utf8'))
  requireFact(JSON.parse(fs.readFileSync(path.join(payload, '.uar-local-payload.json'), 'utf8')).source === pin.revision,
    'C10_PACKAGED_NATIVE_SOURCE_PIN_MISMATCH')
  const files = ['operate-github-feedback.mjs', ...fs.readdirSync(new URL('./github-feedback-operation/', import.meta.url))
    .filter((name) => name.endsWith('.mjs')).map((name) => 'github-feedback-operation/' + name),
    'operate-reusable-team.mjs', 'reusable-team-operation/io.mjs', 'reusable-team-operation/scenario.mjs',
    'reusable-team-operation/approvals.mjs', 'practical-team-presets-operation/contracts.mjs']
  return { app, refs: {
    boss: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.boss, encoding: 'utf8' }).trim(),
    uar: pin.revision, bossDiffSha256: digest(execFileSync('git', ['diff', 'HEAD'], { cwd: options.boss })),
    appAsarSha256: digest(fs.readFileSync(path.join(resources, 'app.asar'))),
    sidecarSha256: digest(fs.readFileSync(path.join(payload, 'uar-sidecar'))),
    sourcePinSha256: digest(fs.readFileSync(pinFile)), launcherSha256: digest(fs.readFileSync(options.launcher)),
    operationSources: Object.fromEntries(files.map((name) => [name, digest(fs.readFileSync(new URL(name, import.meta.url)))]))
  } }
}

export async function operate(args = process.argv.slice(2)) {
  const options = argumentsOf(args)
  fs.mkdirSync(options.output, { recursive: true })
  const output = path.join(fs.realpathSync(options.output), 'c10-' + randomUUID())
  fs.mkdirSync(output)
  const operation = { schemaVersion: 1, kind: 'customer-github-feedback-operation',
    creationTaskRef: 'C10.2/C10.3-customer-GitHub', mode: options.mode, status: 'blocked',
    startedAt: new Date().toISOString(), normalProfile: true, experimentalOptIn: false,
    publishedFeatureComplete: false, credentialValueRecorded: false }
  let connection
  let timeout
  const controller = new AbortController()
  const abort = () => controller.abort('operator cancellation')
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)
  try {
    requireFact(process.platform === 'darwin', 'C10_PACKAGED_MAC_APPLICATION_REQUIRED')
    requireFact(['UAR_TEAM_EXECUTION_PROFILE_STAGE', 'UAR_WORKFLOW_EXECUTION_PROFILE_STAGE', 'BOSS_C094_PUBLIC_QUALIFICATION']
      .every((name) => process.env[name] === undefined), 'C10_NORMAL_PROFILE_REQUIRED')
    requireFact(typeof options.target === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(options.target),
      'C10_EXPLICIT_OPERATOR_REPOSITORY_REQUIRED')
    const source = sourceRefs(options)
    operation.sourceRefs = source.refs
    const evidence = path.join(output, 'evidence.json')
    const configuration = { mode: options.mode, target: options.target, evidence, sourceRefs: source.refs,
      artifactDigest: options.artifactDigest, payloadDigest: options.payloadDigest }
    if (options.mode === 'prepare') {
      requireFact(options.feedback && fs.existsSync(options.feedback), 'C10_ACTUAL_FEEDBACK_FILE_REQUIRED')
      const gateway = gatewayEnvironment()
      const workspaceDirectory = path.join(output, 'workspace')
      fs.mkdirSync(workspaceDirectory)
      const marker = 'C10-' + path.basename(output)
      fs.writeFileSync(path.join(workspaceDirectory, 'README.md'), '# Customer feedback operation\n\n' + marker + '\n', { flag: 'wx' })
      execFileSync('git', ['init', '--quiet', workspaceDirectory], { stdio: 'ignore' })
      Object.assign(configuration, { gateway, workspaceDirectory, marker, feedbackFile: options.feedback })
      const scenarioFile = path.join(output, 'packaged-scenario.mjs')
      fs.writeFileSync(scenarioFile, `import {scenario} from ${JSON.stringify(new URL('./github-feedback-operation/scenario.mjs', import.meta.url).href)}\nexport default context=>scenario(context,${JSON.stringify(configuration)})\n`,
        { flag: 'wx', mode: 0o600 })
      const { launchBoss } = await import(pathToFileURL(options.launcher).href)
      requireFact(typeof launchBoss === 'function', 'C10_MAINTAINED_LAUNCHER_REQUIRED')
      const launch = await launchBoss({ repository: options.boss, app: source.app, scenario: scenarioFile,
        'require-scenario': true, 'keep-open': true, 'timeout-ms': 1200000, receipt: path.join(output, 'launch.json') })
      operation.launchReceipt = launch.receiptFile
      operation.launchStatus = launch.status
      operation.functionalAcceptance = launch.functionalAcceptance
    } else {
      requireFact(options.resume && fs.existsSync(options.resume), 'C10_PERSISTED_PREVIEW_RECEIPT_REQUIRED')
      const priorBytes = fs.readFileSync(options.resume)
      const prior = JSON.parse(priorBytes)
      requireFact(prior.kind === operation.kind && prior.evidence && prior.launchReceipt &&
        digest(fs.readFileSync(prior.evidence)) === prior.evidenceSha256, 'C10_PREVIEW_EVIDENCE_IDENTITY_REQUIRED')
      requireFact(['appAsarSha256', 'sidecarSha256'].every((name) => prior.sourceRefs[name] === source.refs[name]),
        'C10_PREVIEWED_PACKAGE_CHANGED')
      const previous = JSON.parse(fs.readFileSync(prior.evidence, 'utf8'))
      const original = previous.mode === 'prepare' ? previous : JSON.parse(fs.readFileSync(prior.previewEvidence, 'utf8'))
      Object.assign(configuration, { previous: original, priorPreviewEvidenceSha256: digest(priorBytes) })
      operation.continuationOf = options.resume
      operation.previewEvidence = previous.mode === 'prepare' ? prior.evidence : prior.previewEvidence
      operation.launchReceipt = prior.launchReceipt
      timeout = setTimeout(() => controller.abort('timeout'), 180000)
      connection = await attach(JSON.parse(fs.readFileSync(prior.launchReceipt, 'utf8')), controller.signal)
      await scenario({ ...connection, signal: controller.signal }, configuration)
    }
    requireFact(fs.existsSync(evidence), 'C10_ACTUAL_OPERATION_EVIDENCE_REQUIRED')
    const observed = JSON.parse(fs.readFileSync(evidence, 'utf8'))
    Object.assign(operation, { evidence, evidenceSha256: digest(fs.readFileSync(evidence)),
      checks: observed.checks, status: observed.status, publishedFeatureComplete: observed.publishedFeatureComplete,
      ...(observed.failureCode ? { failureCode: observed.failureCode } : {}),
      ...(observed.requiredAction ? { requiredAction: observed.requiredAction } : {}) })
    if (options.mode === 'prepare' && operation.launchStatus !== 'success') operation.status = 'blocked'
  } catch (error) {
    operation.failureCode = /^C(?:10|15|16)_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C10_PREREQUISITE_OR_OPERATION_UNAVAILABLE'
    operation.requiredAction = { code: operation.failureCode,
      action: 'Supply the actual repository, feedback file, packaged native inputs and protected credential environment; preserve the exact preview receipt for confirmed publication.' }
  } finally {
    connection?.close()
    if (timeout) clearTimeout(timeout)
    process.removeListener('SIGINT', abort)
    process.removeListener('SIGTERM', abort)
  }
  operation.finishedAt = new Date().toISOString()
  const receiptFile = path.join(output, 'operation.json')
  write(receiptFile, operation)
  return { ...operation, receiptFile }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile,
      publishedFeatureComplete: result.publishedFeatureComplete, failureCode: result.failureCode,
      requiredAction: result.requiredAction }) + '\n')
    process.exitCode = result.failureCode || result.status === 'blocked' ? 1 : result.publishedFeatureComplete || result.status === 'cancelled' ? 0 : 2
  } catch {
    process.stderr.write('C10 operation prerequisites unavailable. Set BOSS_C10_OUTPUT_DIR, BOSS_C10_GITHUB_TARGET and BOSS_C10_FEEDBACK_FILE; private inputs are not printed.\n')
    process.exitCode = 1
  }
}
