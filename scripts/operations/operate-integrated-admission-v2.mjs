import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { gatewayEnvironment } from '../approval-lifecycle-operation/io.mjs'
import { provenance, previousReceipt } from '../bossfang-workflow-delegation-operation/provenance.mjs'
import { digest, requireFact, safeFailure, save } from './admission-v2-common.mjs'

const files = ['operate-integrated-admission-v2.mjs', 'admission-v2-common.mjs',
  'admission-v2-native.mjs', 'admission-v2-bossfang.mjs', 'admission-v2-older-instance.mjs']
const scopes = {
  bossfang: ['admission-v2-bossfang.mjs', 'real-packaged-embedded-ordinary-bossfang-workflow-delegation-v2'],
  'native-read': ['admission-v2-native.mjs', 'real-packaged-ordinary-uar-native-read-reconnect-cancel-recovery'],
  'older-instance': ['admission-v2-older-instance.mjs', 'real-packaged-actual-v1-instance-refusal']
}
export async function operate(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    const name = args[index]
    requireFact(['--boss', '--launcher', '--output', '--config', '--mode'].includes(name) &&
      args[index + 1] && !args[index + 1].startsWith('--'), 'ADMISSION_V2_ARGUMENTS')
    requireFact(options[name.slice(2)] === undefined, 'ADMISSION_V2_DUPLICATE_ARGUMENT')
    options[name.slice(2)] = name === '--mode' ? args[++index] : path.resolve(args[++index])
  }
  requireFact(options.boss && options.launcher && options.output && options.config && scopes[options.mode],
    'ADMISSION_V2_EXPLICIT_MODE_AND_CANDIDATE_REQUIRED')
  fs.mkdirSync(options.output, { recursive: true })
  const output = path.join(fs.realpathSync(options.output), `integrated-admission-v2-${options.mode}-${randomUUID()}`)
  fs.mkdirSync(output, { mode: 0o700 })
  const operation = { schemaVersion: 1, kind: 'completed-feature-operation', creationTaskRef: 'integrated-runtime-release-reconciliation',
    operationId: path.basename(output), status: 'blocked', startedAt: new Date().toISOString(),
    evidenceLevel: scopes[options.mode][1], selectedScope: options.mode,
    acceptanceScope: 'Only the explicitly selected operation and candidate; overall customer acceptance remains separate.',
    normalProfile: true, experimentalOptIn: false, externalGitHubWrites: false, credentialValueRecorded: false }
  let stage = 'candidate-and-gateway-prerequisites'
  const priorEnvironment = new Map()
  try {
    requireFact(process.platform === 'darwin' && process.arch === 'arm64', 'ADMISSION_V2_PACKAGED_MAC_ARM64_REQUIRED')
    requireFact(['UAR_TEAM_EXECUTION_PROFILE_STAGE', 'UAR_WORKFLOW_EXECUTION_PROFILE_STAGE',
      'BOSS_C094_PUBLIC_QUALIFICATION'].every(name => process.env[name] === undefined),
      'ADMISSION_V2_EXPERIMENTAL_PROFILE_FORBIDDEN')
    const configBytes = fs.readFileSync(options.config)
    const input = JSON.parse(configBytes)
    const candidate = input.candidate
    requireFact(input.schemaVersion === 1 && input.version === '2.2.31' && candidate &&
      ['boss', 'bossfang', 'uar'].every(key => /^[0-9a-f]{40}$/.test(candidate[key] ?? '')) &&
      ['appAsarSha256', 'uarSha256', 'bossfangSha256'].every(key => /^[0-9a-f]{64}$/.test(candidate[key] ?? '')),
      'ADMISSION_V2_FROZEN_SOURCE_AND_PACKAGE_DIGESTS_REQUIRED')
    requireFact(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.boss, encoding: 'utf8' }).trim() === candidate.boss,
      'ADMISSION_V2_DRIVER_CHECKOUT_SOURCE_MISMATCH')
    const actual = provenance({ ...options, 'bossfang-source': candidate.bossfang })
    requireFact(actual.sourceRefs.uar === candidate.uar &&
      ['appAsarSha256', 'uarSha256', 'bossfangSha256'].every(key => actual.sourceRefs[key] === candidate[key]),
      'ADMISSION_V2_ACTUAL_PACKAGE_IDENTITY_MISMATCH')
    const version = JSON.parse(fs.readFileSync(path.join(options.boss, 'package.json'), 'utf8')).version
    requireFact(version === input.version, 'ADMISSION_V2_CHECKOUT_RELEASE_VERSION_MISMATCH')
    const sourceRefs = { ...actual.sourceRefs, operationDriverFiles: Object.fromEntries(files.map(name =>
      [name, digest(fs.readFileSync(new URL(name, import.meta.url)))])), configurationSha256: digest(configBytes) }
    Object.assign(operation, { releaseVersion: input.version, sourceRefs, candidateId: input.candidateId ?? null })
    const gatewayFields = {
      BOSS_C142_GATEWAY_CREDENTIAL_ENV: input.gateway?.credentialEnv ?? 'LITER_LLM_MASTER_KEY',
      BOSS_C142_GATEWAY_ENDPOINT: input.gateway?.endpoint ?? 'http://localhost:4000',
      BOSS_C142_GATEWAY_ALIAS: input.gateway?.alias ?? 'gpt-6.1-sol',
      BOSS_C142_GATEWAY_PROVIDER_ID: input.gateway?.providerId ?? 'openai',
      BOSS_C142_GATEWAY_MODEL_ID: input.gateway?.modelId ?? 'gpt-6.1-sol',
      BOSS_C142_GATEWAY_PROVIDER_BASE_URL: input.gateway?.providerBaseUrl
    }
    for (const [key, value] of Object.entries(gatewayFields)) {
      priorEnvironment.set(key, process.env[key])
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    const gateway = options.mode === 'older-instance' ? undefined : gatewayEnvironment()
    if (gateway) requireFact(gateway.modelId === 'gpt-6.1-sol' && gateway.alias === 'gpt-6.1-sol' &&
      gateway.providerId === 'openai', 'ADMISSION_V2_OBSERVED_PROXY_MODEL_IDENTITY_REQUIRED')
    let modelContext, prior
    if (options.mode !== 'older-instance') {
      requireFact(input.modelContextPath, 'ADMISSION_V2_MODEL_CONTEXT_DECLARATION_REQUIRED')
      const bytes = fs.readFileSync(input.modelContextPath)
      const declaration = JSON.parse(bytes)
      requireFact(declaration.modelId === gateway.modelId && Number.isInteger(declaration.contextWindow) &&
        declaration.contextWindow > 0 && declaration.sourceRef, 'ADMISSION_V2_MODEL_CONTEXT_PROVENANCE_REQUIRED')
      modelContext = { ...declaration, declarationSha256: digest(bytes) }
    }
    if (options.mode === 'bossfang') {
      requireFact(input.priorReceiptPath, 'ADMISSION_V2_PRIOR_SCOPED_BOSSFANG_RECEIPT_REQUIRED')
      prior = previousReceipt(input.priorReceiptPath)
    }
    const workspaceDirectory = path.join(output, 'workspace')
    fs.mkdirSync(workspaceDirectory, { mode: 0o700 })
    const marker = 'INTEGRATED_V2_' + randomUUID().replaceAll('-', '')
    const readme = '# Disposable integrated admission operation\n\n' + marker + '\n'
    fs.writeFileSync(path.join(workspaceDirectory, 'README.md'), readme, { flag: 'wx', mode: 0o600 })
    execFileSync('git', ['init', '--quiet', workspaceDirectory], { stdio: 'ignore' })
    const evidenceFile = path.join(output, 'evidence.json')
    const configuration = { version: input.version, sourceRefs, gateway, modelContext, previousReceipt: prior,
      oldInstance: input.oldInstance, evidence: evidenceFile, workspaceDirectory, marker,
      workspaceSha256: digest(readme), repository: options.boss }
    const scenarioFile = path.join(output, 'packaged-scenario.mjs')
    fs.writeFileSync(scenarioFile, `import {scenario} from ${JSON.stringify(new URL(scopes[options.mode][0], import.meta.url).href)}\n` +
      `export default context => scenario(context,${JSON.stringify(configuration)})\n`, { flag: 'wx', mode: 0o600 })
    const { launchBoss } = await import(pathToFileURL(options.launcher).href)
    requireFact(typeof launchBoss === 'function', 'ADMISSION_V2_MAINTAINED_LAUNCHER_REQUIRED')
    stage = 'actual-packaged-scoped-operation'
    const launch = await launchBoss({ repository: options.boss, app: actual.app, scenario: scenarioFile,
      'require-scenario': true, 'timeout-ms': 1200000, receipt: path.join(output, 'launch.json') })
    const observed = fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile, 'utf8')) : null
    Object.assign(operation, { launchReceipt: launch.receiptFile, functionalAcceptance: launch.functionalAcceptance,
      checks: observed?.checks ?? [], limitations: observed?.limitations ?? [],
      ...(observed ? { evidence: evidenceFile, evidenceSha256: digest(fs.readFileSync(evidenceFile)) } : {}) })
    if (launch.status === 'success' && launch.functionalAcceptance === 'scenario-confirmed' && observed?.complete) operation.status = 'success'
    else operation.failure = observed?.failure ?? { stage, code: 'ADMISSION_V2_SCOPED_OPERATION_UNCONFIRMED' }
  } catch (error) { operation.failure = safeFailure(error, stage) }
  finally {
    for (const [key, value] of priorEnvironment) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  operation.finishedAt = new Date().toISOString()
  const receiptFile = path.join(output, 'operation.json')
  save(receiptFile, operation)
  return { ...operation, receiptFile }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await operate()
    process.stdout.write(JSON.stringify({ status: result.status, receiptFile: result.receiptFile, failure: result.failure }) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch (error) {
    process.stderr.write(JSON.stringify(safeFailure(error, 'operation-arguments-or-receipt-write')) + '\n')
    process.exitCode = 1
  }
}
