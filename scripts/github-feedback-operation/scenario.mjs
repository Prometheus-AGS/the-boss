import fs from 'node:fs'

import { digest, requireFact, write } from '../reusable-team-operation/io.mjs'
import { prepare } from './prepare.mjs'
import { resume } from './resume.mjs'

export async function scenario(context, configuration) {
  const evidence = { schemaVersion: 1, kind: 'customer-github-feedback-packaged-operation',
    creationTaskRef: 'C10.2/C10.3-customer-GitHub', mode: configuration.mode, status: 'blocked',
    sourceRefs: configuration.sourceRefs, startedAt: new Date().toISOString(), checks: [],
    normalProfile: true, experimentalOptIn: false, credentialValueRecorded: false,
    publication: 'not-performed', publishedFeatureComplete: false,
    restartScope: 'renderer reload and retained isolated application; process restart not claimed' }
  try {
    requireFact(context.targets.some((target) => target.type === 'page' &&
      target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)),
    'C10_REAL_PACKAGED_APPLICATION_REQUIRED')
    if (configuration.mode === 'prepare') await prepare(context, configuration, evidence)
    else await resume(context, configuration, evidence)
    evidence.publication = evidence.publishedFeatureComplete ? 'confirmed-real-github' :
      evidence.status === 'pending-reconciliation' ? 'unknown-outcome' : 'not-performed'
  } catch (error) {
    evidence.failureStage = evidence.stage
    if (error.failureSelector) evidence.failureSelector = error.failureSelector
    evidence.failureCode = context.signal.aborted ? 'C10_OPERATION_CANCELLED_OR_TIMED_OUT' :
      /^C(?:10|15|16)_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C10_APPLICATION_OPERATION_UNAVAILABLE'
  } finally {
    evidence.finishedAt = new Date().toISOString()
    const credentialNames = [configuration.gateway?.credentialEnv, process.env.BOSS_C15_GATEWAY_CREDENTIAL_ENV,
      process.env.BOSS_C10_GITHUB_CREDENTIAL_ENV].filter(Boolean)
    if (credentialNames.some((name) => process.env[name] && JSON.stringify(evidence).includes(process.env[name]))) {
      for (const key of Object.keys(evidence)) delete evidence[key]
      Object.assign(evidence, { schemaVersion: 1, kind: 'customer-github-feedback-packaged-operation',
        mode: configuration.mode, status: 'blocked', checks: [], publishedFeatureComplete: false,
        failureCode: 'C10_EVIDENCE_CONTAINS_CREDENTIAL', credentialValueRecorded: false,
        finishedAt: new Date().toISOString() })
    }
    write(configuration.evidence, evidence)
  }
  return { passed: !evidence.failureCode,
    observedBehavior: JSON.stringify({ status: evidence.status, failureCode: evidence.failureCode,
      publishedFeatureComplete: evidence.publishedFeatureComplete, evidencePath: configuration.evidence,
      evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
