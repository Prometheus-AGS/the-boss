import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { ipc, openWork, setup } from '../reusable-team-operation/scenario.mjs'
import { digest, requireFact, route, write } from '../reusable-team-operation/io.mjs'
import { cases, readTools } from './contracts.mjs'
import { authorPreset, reopenPreset } from './authoring.mjs'
import { runPreset, reopenRun } from './work.mjs'

export async function scenario({ evaluate, signal, targets }, configuration) {
  const evidence = {
    schemaVersion: 1, kind: 'practical-team-presets-packaged-operation', creationTaskRef: 'C16.2',
    complete: false, startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs,
    operationDriverSources: configuration.operationDriverSources, checks: [], presets: [],
    teamMutationSurface: 'visible Settings authoring and Work controls',
    normalProfile: true, experimentalOptIn: false, modelChoice: 'explicit-manual-configured-gateway',
    requestedPolicyCompliance: 'unknown', credentialValueRecorded: false,
    restartScope: 'renderer reload; application process restart not claimed', nativeWindowsAcceptance: 'pending',
    connectorEffects: 'not-authorized-not-exercised', artifactQualityAcceptance: 'root-independent-review-required'
  }
  let stage = 'packaged-target'
  try {
    requireFact(targets.some((target) => target.type === 'page' &&
      target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)),
    'C16_PRACTICAL_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    await openWork(evaluate, signal)
    const selected = await setup(evaluate, configuration)
    const initial = await ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    requireFact(initial.executionProfileStage === 'qualified' && initial.capabilities.execution && initial.capabilities.coding,
      'C16_PRACTICAL_NORMAL_PROFILE_UNQUALIFIED')
    evidence.workspaceId = selected.workspaceId
    evidence.selectedModel = selected.model
    const catalog = await ipc(evaluate, route('skills'), {})
    const skill = catalog.entries.find((entry) => entry.skillRef?.id === 'builtin::better-writing' &&
      entry.availability === 'available' && entry.reviewedCoverage.status === 'reviewed' &&
      entry.skillRef.required && entry.skillRef.requiredTools.every((tool) => readTools.includes(tool)))
    evidence.reviewedSkillChoice = 'better-writing: independent clarity and supported-claims review of artifact text'
    requireFact(skill, 'C16_PRACTICAL_REVIEWED_WRITING_SKILL_UNAVAILABLE')
    const saved = []
    for (const preset of cases) {
      stage = 'author-' + preset.template
      const record = { template: preset.template, checks: [], runRequested: preset.run }
      evidence.presets.push(record)
      const authored = await authorPreset({ evaluate, signal, selected, configuration, preset, skill, evidence: record })
      record.checks.push('explicit-resources-and-bounded-delivery-saved-in-two-immutable-revisions')
      let run
      if (preset.run) {
        stage = 'run-' + preset.template
        run = await runPreset({ evaluate, signal, selected, configuration, preset,
          accepted: authored.accepted, evidence: record })
        record.checks.push('real-normal-profile-members-correlated-deliverables-and-independent-findings')
      }
      saved.push({ ...authored, run, record })
    }
    evidence.checks.push('five-practical-presets-authored-with-explicit-reviewed-skills-and-manual-models',
      'product-research-marketing-brand-and-logo-design-have-real-correlated-artifacts')
    stage = 'reopen-saved-identities-and-runs'
    await evaluate('setTimeout(()=>location.reload(),50);true')
    await delay(750, undefined, { signal })
    for (const item of saved) {
      await reopenPreset({ evaluate, signal, selected, revisions: [item.first, item.accepted] })
      if (item.run) await reopenRun({ evaluate, signal, selected, run: item.run, accepted: item.accepted })
      item.record.checks.push('renderer-reopen-retains-immutable-identities-resources-and-delivery-fields')
    }
    requireFact(digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'README.md'))) === configuration.workspaceSha256 &&
      fs.readdirSync(configuration.workspaceDirectory).every((name) => ['README.md', '.git'].includes(name)),
    'C16_PRACTICAL_READ_ONLY_SCOPE_EXCEEDED')
    evidence.checks.push('reopen-preserves-pinned-runs-and-artifacts-without-repeated-inference',
      'read-only-workspace-and-feedback-connector-boundaries-preserved')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted ? 'C16_PRACTICAL_OPERATION_CANCELLED_OR_TIMED_OUT' :
      /^C(?:15|16)_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C16_PRACTICAL_OPERATION_UNAVAILABLE'
    if (error.approvalIpcFailure) evidence.approvalIpcFailure = error.approvalIpcFailure
    if (error.approvalScopeFailure) evidence.approvalScopeFailure = error.approvalScopeFailure
  } finally {
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failureCode: evidence.failureCode, evidencePath: configuration.evidence,
    evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
