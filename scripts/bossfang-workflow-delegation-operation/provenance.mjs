import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { digest, requireFact } from './io.mjs'

export function provenance(options) {
  const platform = 'darwin-' + process.arch
  const app = path.join(options.boss, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app')
  const resources = path.join(app, 'Contents/Resources')
  const payload = path.join(resources, 'app.asar.unpacked/resources/binaries', platform)
  const fileHash = file=>digest(fs.readFileSync(file))
  const pinsFile = path.join(options.boss, 'build/integration-sources.json')
  const artifactsFile = path.join(options.boss, 'build/integration-artifacts.json')
  const pins = JSON.parse(fs.readFileSync(pinsFile, 'utf8'))
  const artifacts = JSON.parse(fs.readFileSync(artifactsFile, 'utf8'))
  const bossfang = artifacts.tools.find(tool=>tool.name==='bossfang')?.packages[platform]
  requireFact(/^[0-9a-f]{40}$/.test(options['bossfang-source']) &&
    pins.sources.bossfang.revision === options['bossfang-source'] && bossfang?.source === options['bossfang-source'],
  'C14W_NEW_NATIVE_SOURCE_RECORD_REQUIRED')
  requireFact(bossfang.dashboard?.embedded && bossfang.dashboard.basePath === '/dashboard/' &&
    bossfang.dashboard.configurationAssets?.some(asset=>/WorkflowsPage/.test(asset.path)&&asset.size>0),
  'C14W_COMPILED_WORKFLOW_DASHBOARD_MANIFEST_REQUIRED')
  requireFact(fileHash(path.join(payload, 'bossfang')) === bossfang.sha256,
    'C14W_PACKAGED_BOSSFANG_DIGEST_MISMATCH')
  const localPinFile = path.join(options.boss, 'build/local-uar-source.json')
  const pin = JSON.parse(fs.readFileSync(localPinFile, 'utf8'))
  const markerFile = path.join(payload, '.uar-local-payload.json')
  requireFact(JSON.parse(fs.readFileSync(markerFile, 'utf8')).source === pin.revision,
    'C14W_UAR_SOURCE_PIN_MISMATCH')
  const files = ['operate-bossfang-workflow-delegation.mjs',
    'bossfang-workflow-delegation-operation/io.mjs', 'bossfang-workflow-delegation-operation/provenance.mjs',
    'bossfang-workflow-delegation-operation/setup.mjs', 'bossfang-workflow-delegation-operation/dashboard.mjs',
    'bossfang-workflow-delegation-operation/workflow.mjs', 'bossfang-workflow-delegation-operation/scenario.mjs',
    'bossfang-workflow-delegation-operation/effects.mjs',
    'approval-lifecycle-operation/setup.mjs', 'approval-lifecycle-operation/io.mjs',
    'approval-lifecycle-operation/clients.mjs']
  return { app, sourceRefs: {
    boss: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.boss, encoding: 'utf8' }).trim(),
    bossDiffSha256: digest(execFileSync('git', ['diff', 'HEAD'], { cwd: options.boss })),
    bossfang: options['bossfang-source'], uar: pin.revision,
    sourcePinsSha256: fileHash(pinsFile), artifactManifestSha256: fileHash(artifactsFile),
    localUarPinSha256: fileHash(localPinFile), uarPayloadMarkerSha256: fileHash(markerFile),
    uarPayloadManifestSha256: fileHash(path.join(payload, 'payload-manifest.json')),
    appAsarSha256: fileHash(path.join(resources, 'app.asar')),
    bossfangSha256: fileHash(path.join(payload, 'bossfang')), uarSha256: fileHash(path.join(payload, 'uar-sidecar')),
    bossfangPayload: { source: bossfang.source, url: bossfang.url, sha256: bossfang.sha256,
      uarLifecycle: bossfang.uarLifecycle, dashboard: bossfang.dashboard },
    launcher: options.launcher, launcherSha256: fileHash(options.launcher),
    scenarioFiles: Object.fromEntries(files.map(name=>[name,fileHash(path.join(options.boss,'scripts',name))]))
  } }
}

export function previousReceipt(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  requireFact(value.kind === 'c14-redacted-composite-failed-boundary-recovery',
    'C14W_PRIOR_COMPOSITE_RECEIPT_REQUIRED')
  const referenced = [value.originalFullOperation.bossFangEvidence,
    value.alternateRecovery.operation, value.remainingRecovery.operation]
  for (const receipt of referenced) requireFact(digest(fs.readFileSync(receipt.path)) === receipt.sha256,
    'C14W_PRIOR_RECEIPT_DIGEST_MISMATCH')
  return { file, sha256: digest(fs.readFileSync(file)), rerun: false,
    wholeC14CompleteAtOriginalBoundary: value.wholeC14Complete,
    application: value.application,
    retainedOriginalChecks: value.originalFullOperation.retainedBossFangChecks,
    originalFailure: value.originalFullOperation.failedCheckPreserved,
    alternateRecovery: { operation: value.alternateRecovery.operation,
      wholeRunComplete: value.alternateRecovery.wholeRunComplete,
      completedCheckStatus: value.alternateRecovery.completedCheck.status },
    remainingRecovery: { operation: value.remainingRecovery.operation,
      complete: value.remainingRecovery.complete,
      checks: Object.fromEntries(Object.entries(value.remainingRecovery.checks).map(([name,record])=>[name,record.status])) },
    referencedReceipts: referenced,
    scope: 'Retained dashboard/authentication, ownership, ports, supervision, grant/connection and recovery checks at their original source and package only.' }
}
