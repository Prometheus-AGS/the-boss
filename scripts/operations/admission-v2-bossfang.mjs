import fs from 'node:fs'
import path from 'node:path'
import { scenario as ordinaryWorkflow } from '../bossfang-workflow-delegation-operation/scenario.mjs'
import { admissions, digest, ipc, profile, requireFact, safeFailure, save } from './admission-v2-common.mjs'

export async function scenario(context, configuration) {
  const evidence = { schemaVersion: 1, kind: 'integrated-admission-v2-bossfang-operation', complete: false,
    startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs, checks: [], credentialValueRecorded: false,
    limitations: ['Host MCP approval, denial and pending cancellation only; native reads and semantic stream cancellation have separate adapters.',
      'Original retained receipts apply only at their original source and package boundaries.'] }
  let stage = 'actual-packaged-profile'
  try {
    const ownedProfile = await profile(context.evaluate, configuration)
    const underlying = path.join(path.dirname(configuration.evidence), 'ordinary-workflow-evidence.json')
    stage = 'ordinary-shared-uar-workflow-approval-denial-cancellation'
    const result = await ordinaryWorkflow(context, { ...configuration, evidence: underlying })
    const workflow = JSON.parse(fs.readFileSync(underlying, 'utf8'))
    evidence.ordinaryWorkflow = { path: underlying, sha256: digest(fs.readFileSync(underlying)), complete: workflow.complete }
    requireFact(result.passed && workflow.complete, 'ADMISSION_V2_REAL_BOSSFANG_WORKFLOW_UNCONFIRMED')
    const inventory = await ipc(context.evaluate, 'prometheus.uar.instances.read')
    const selected = inventory.instances.find(row => row.id === inventory.selectedInstanceId)
    requireFact(selected?.observed?.capabilities.includes('tool_admission_v2'), 'ADMISSION_V2_CAPABILITY_NOT_OBSERVED')
    evidence.capability = { instanceId: selected.id, version: selected.observed.version,
      capabilities: selected.observed.capabilities }
    stage = 'persisted-original-host-mcp-execution-kind'
    evidence.admissions = []
    for (const [key, state] of [['approvedPending', 'succeeded'], ['deniedPending', 'denied'], ['cancelPending', 'cancelled']]) {
      const pending = workflow[key]
      const rows = admissions(ownedProfile, row => row.admissionId === pending.preparedEffect.admissionId)
      requireFact(rows.length === 1 && rows[0].executionKind === 'host_mcp' && rows[0].state === state &&
        rows[0].rootRunId === pending.rootRunId && rows[0].executingRunId === pending.runId &&
        rows[0].invocationId === pending.preparedEffect.invocationId && rows[0].toolName === 'filesystem__write',
        'ADMISSION_V2_ORIGINAL_HOST_EXECUTION_KIND_NOT_CORRELATED')
      evidence.admissions.push({ scenario: key, approvalId: pending.pending.approvalId, admission: rows[0] })
    }
    evidence.checks = [...workflow.checks, 'actual-persisted-host-mcp-kind-exact-admission-and-original-run-correlation']
    evidence.complete = true
  } catch (error) { evidence.failure = safeFailure(error, stage) }
  evidence.finishedAt = new Date().toISOString()
  save(configuration.evidence, evidence)
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failure: evidence.failure, evidence: configuration.evidence }) }
}
