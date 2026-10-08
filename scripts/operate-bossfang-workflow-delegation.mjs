import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { digest, write, gatewayEnvironment, requireFact, failure } from './bossfang-workflow-delegation-operation/io.mjs'
import { provenance, previousReceipt } from './bossfang-workflow-delegation-operation/provenance.mjs'

export async function operate(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    requireFact(['--boss','--launcher','--output','--bossfang-source','--prior-receipt','--model-context'].includes(args[index]) &&
      args[index+1] && !args[index+1].startsWith('--'), 'C14W_ARGUMENTS')
    const key = args[index].slice(2)
    options[key] = key === 'bossfang-source' ? args[++index] : path.resolve(args[++index])
  }
  requireFact(options.boss && options.launcher && options.output && options['bossfang-source'] &&
    options['prior-receipt'], 'C14W_ARGUMENTS')
  fs.mkdirSync(options.output, { recursive: true })
  const output = path.join(fs.realpathSync(options.output), 'c14-bossfang-workflow-' + randomUUID())
  fs.mkdirSync(output)
  const operation = { schemaVersion: 1, kind: 'completed-feature-operation', creationTaskRef: 'C14.4',
    status: 'blocked', startedAt: new Date().toISOString(),
    evidenceLevel: 'real-packaged-embedded-ordinary-bossfang-workflow-delegation',
    acceptanceScope: 'Ordinary bound workflow, native output/identities, authoritative approval/effect and cancellation; native Windows and publication separate.',
    normalProfile: true, experimentalOptIn: false }
  let stage = 'prerequisites'
  try {
    requireFact(process.platform === 'darwin', 'C14W_NATIVE_PLATFORM_LAUNCHER_UNAVAILABLE')
    requireFact(['UAR_TEAM_EXECUTION_PROFILE_STAGE','UAR_WORKFLOW_EXECUTION_PROFILE_STAGE',
      'BOSS_C094_PUBLIC_QUALIFICATION'].every(name=>process.env[name]===undefined), 'C14W_EXPERIMENTAL_PROFILE_PRESENT')
    const gateway = gatewayEnvironment()
    let modelContext
    if (options['model-context']) {
      const bytes = fs.readFileSync(options['model-context'])
      const declared = JSON.parse(bytes)
      requireFact(declared.modelId === gateway.modelId && Number.isInteger(declared.contextWindow) &&
        declared.contextWindow > 0 && declared.contextWindow <= 2000000 && declared.sourceRef,
      'C14W_MODEL_CONTEXT_PROVENANCE_REQUIRED')
      modelContext = { ...declared, declarationSha256: digest(bytes) }
    }
    const { app, sourceRefs } = provenance(options)
    const prior = previousReceipt(options['prior-receipt'])
    Object.assign(operation, { sourceRefs, previousReceipt: prior })
    const workspaceDirectory = path.join(output, 'workspace')
    fs.mkdirSync(workspaceDirectory)
    const marker = 'C14W-' + path.basename(output)
    const readme = '# Disposable ordinary BossFang workflow\n\n' + marker + '\n'
    fs.writeFileSync(path.join(workspaceDirectory, 'README.md'), readme, { flag: 'wx' })
    execFileSync('git', ['init','--quiet',workspaceDirectory], { stdio: 'ignore' })
    const evidence = path.join(output, 'evidence.json')
    const configuration = { sourceRefs, previousReceipt: prior, gateway, modelContext, evidence,
      workspaceDirectory, marker, workspaceSha256: digest(readme), repository: options.boss }
    const scenarioFile = path.join(output, 'packaged-scenario.mjs')
    fs.writeFileSync(scenarioFile,
      `import {scenario} from ${JSON.stringify(new URL('./bossfang-workflow-delegation-operation/scenario.mjs',import.meta.url).href)}\nexport default context=>scenario(context,${JSON.stringify(configuration)})\n`,
      { flag: 'wx', mode: 0o600 })
    const { launchBoss } = await import(pathToFileURL(options.launcher).href)
    requireFact(typeof launchBoss === 'function', 'C14W_MAINTAINED_LAUNCHER_UNAVAILABLE')
    stage = 'maintained-packaged-launch-and-workflow'
    const launch = await launchBoss({ repository: options.boss, app, scenario: scenarioFile,
      'require-scenario': true, 'timeout-ms': 1200000, receipt: path.join(output,'launch.json') })
    const observed = fs.existsSync(evidence) ? JSON.parse(fs.readFileSync(evidence,'utf8')) : null
    Object.assign(operation, { launchReceipt: launch.receiptFile, functionalAcceptance: launch.functionalAcceptance,
      checks: observed?.checks ?? [], ...(observed ? { evidence, evidenceSha256: digest(fs.readFileSync(evidence)),
        limitations: observed.limitations } : {}) })
    if (launch.status==='success' && launch.functionalAcceptance==='scenario-confirmed' && observed?.complete)
      operation.status='success'
    else operation.failure=observed?.failure ?? {stage,code:'C14W_PACKAGED_WORKFLOW_NOT_CONFIRMED'}
    if (observed?.cleanupFailures) operation.cleanupFailures=observed.cleanupFailures
  } catch (error) {
    operation.failure=failure(error,stage)
  }
  operation.finishedAt=new Date().toISOString()
  const receiptFile=path.join(output,'operation.json')
  write(receiptFile,operation)
  return {...operation,receiptFile}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {
    const result=await operate()
    process.stdout.write(JSON.stringify({status:result.status,receiptFile:result.receiptFile,failure:result.failure})+'\n')
    process.exitCode=result.status==='success'?0:1
  } catch (error) {
    process.stderr.write(JSON.stringify(failure(error,'operation-arguments-or-receipt-write'))+'\n')
    process.exitCode=1
  }
}
