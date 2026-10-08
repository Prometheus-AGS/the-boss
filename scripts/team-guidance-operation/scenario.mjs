import fs from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

import { click, fill, ipc, openAuthoring, openWork, setup } from '../reusable-team-operation/scenario.mjs'
import { digest, requireFact, route, same, waitFor, write } from '../reusable-team-operation/io.mjs'
import { authorPreset, reopenPreset } from '../practical-team-presets-operation/authoring.mjs'
import { cases, readTools } from '../practical-team-presets-operation/contracts.mjs'

export async function scenario({ evaluate, signal, targets }, configuration) {
  const evidence = {
    schemaVersion: 1, kind: 'team-guidance-packaged-operation', creationTaskRef: 'C16.3',
    complete: false, startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs,
    operationDriverSources: configuration.operationDriverSources, checks: [],
    modelAvailabilityEvidence: configuration.modelAvailabilityEvidence,
    measuredCostComparison: 'not-claimed', regulatedCertification: 'not-claimed',
    inference: 'existing operation evidence; no new inference in this authoring increment',
    restartScope: 'renderer reload; process restart not claimed', nativeWindowsAcceptance: 'pending',
    credentialValueRecorded: false
  }
  let stage = 'packaged-target'
  try {
    requireFact(targets.some((target) => target.type === 'page' &&
      target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)),
    'C16_GUIDANCE_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    await openWork(evaluate, signal)
    const selected = await setup(evaluate, configuration)
    const authoring = () => ipc(evaluate, route('authoring'), {})
    const catalog = await ipc(evaluate, route('skills'), {})
    const skill = catalog.entries.find((entry) => entry.skillRef?.id === 'builtin::better-writing' &&
      entry.availability === 'available' && entry.reviewedCoverage.status === 'reviewed' &&
      entry.skillRef.required && entry.skillRef.requiredTools.every((tool) => readTools.includes(tool)))
    requireFact(skill, 'C16_GUIDANCE_REVIEWED_SKILL_UNAVAILABLE')
    stage = 'visible-workflow-and-preset-help'
    await openAuthoring(evaluate, signal, selected.workspaceId)
    requireFact(await evaluate('document.querySelectorAll("[data-ui^=team-authoring-step-]").length===5'),
      'C16_GUIDANCE_WORKFLOW_UNAVAILABLE')
    const templates = (await authoring()).templates
    for (const template of templates) {
      await click(evaluate, signal, '[data-ui~="team-authoring-new-' + template.template + '"]')
      requireFact(await evaluate('Boolean(document.querySelector("[data-ui~=team-authoring-preset-help]")?.textContent.trim())'),
        'C16_GUIDANCE_PRESET_HELP_UNAVAILABLE')
    }
    const record = { checks: [] }
    const authored = await authorPreset({ evaluate, signal, selected, configuration,
      preset: cases[0], skill, evidence: record })
    evidence.baseline = record
    stage = 'readable-creator-guidance'
    await fill(evaluate, signal, '[data-ui~="team-authoring-guidance-source"]', configuration.guidanceSource)
    await click(evaluate, signal, '[data-ui~="team-authoring-guidance-import"]')
    const guide = JSON.parse(configuration.guidanceSource)
    await waitFor(signal, () => evaluate('document.querySelector("[data-ui~=team-authoring-guidance-receipt]")?.getAttribute("data-guidance-ready")==="true"'),
      'C16_GUIDANCE_IMPORT_UNAVAILABLE')
    const visible = await evaluate('({alternatives:document.querySelector("[data-ui~=team-authoring-guidance-alternatives]")?.textContent,discovery:document.querySelector("[data-ui~=team-authoring-guidance-discovery]")?.textContent})')
    requireFact(guide.alternatives.every((item) => visible.alternatives.includes(item)) &&
      visible.discovery.includes(guide.skillDiscovery), 'C16_GUIDANCE_READABLE_PROPOSALS_UNAVAILABLE')
    const mappings = [{ sourceRole: 'implementer', memberRole: 'researcher' },
      { sourceRole: 'reviewer', memberRole: 'reviewer' }]
    for (const mapping of mappings) {
      const row = '[data-ui~="team-authoring-guidance-role"][data-source-role="' + mapping.sourceRole + '"]'
      await click(evaluate, signal, row + ' [data-ui~="team-authoring-guidance-select"]')
      await fill(evaluate, signal, row + ' [data-ui~="team-authoring-guidance-target"]', mapping.memberRole)
    }
    await click(evaluate, signal, '[data-ui~="team-authoring-guidance-apply"]')
    stage = 'honest-model-pricing'
    const researcher = '[data-ui~="team-authoring-member"][data-role="researcher"]'
    await fill(evaluate, signal, researcher + ' [data-ui~="team-authoring-model-policy-source"]', configuration.reviewedSource)
    await click(evaluate, signal, researcher + ' [data-ui~="team-authoring-model-policy-import"]')
    await waitFor(signal, () => evaluate('document.querySelector(' + JSON.stringify(researcher +
      ' [data-ui~="team-authoring-model-cost"]') + ')?.getAttribute("data-input-price-known")==="false"'),
    'C16_GUIDANCE_UNKNOWN_COST_UNAVAILABLE')
    requireFact(await evaluate('document.querySelector(' + JSON.stringify(researcher +
      ' [data-ui~="team-authoring-model-cost"]') + ')?.getAttribute("data-output-price-known")==="false"'),
    'C16_GUIDANCE_UNKNOWN_OUTPUT_COST_CHANGED')
    await click(evaluate, signal, researcher + ' [data-ui~="team-authoring-model-policy-accept"]')
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const saved = await waitFor(signal, async () => (await authoring()).revisions.find((item) =>
      item.team.id === authored.accepted.team.id && item.revision === authored.accepted.revision + 1),
    'C16_GUIDANCE_SAVE_UNAVAILABLE')
    const member = saved.team.members.find((item) => item.role === 'researcher')
    requireFact(saved.team.reviewedGuidance.sourceJson === configuration.guidanceSource &&
      same(saved.team.guidanceMappings, mappings) && member.modelPolicyMode === 'reviewed' &&
      member.reviewedModelPolicy.sourceJson === configuration.reviewedSource &&
      member.reviewedModelPolicy.result.selected.pricing.inputPerMillion === null &&
      same(member.tools, authored.accepted.team.members.find((item) => item.role === 'researcher').tools),
    'C16_GUIDANCE_PERSISTED_IDENTITY_CHANGED')
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const deployed = await waitFor(signal, () => evaluate('document.querySelector("[data-ui~=team-authoring-deployed]")?.getAttribute("data-binding-id")'),
      'C16_GUIDANCE_DEPLOYMENT_UNAVAILABLE', 60000)
    evidence.definition = saved.definition
    evidence.package = saved.package
    evidence.bindingId = deployed
    evidence.guidanceSourceSha256 = digest(configuration.guidanceSource)
    evidence.modelPolicySourceSha256 = digest(configuration.reviewedSource)
    stage = 'reopen-immutable-guidance'
    await evaluate('setTimeout(()=>location.reload(),50);true')
    await delay(750, undefined, { signal })
    await reopenPreset({ evaluate, signal, selected, revisions: [authored.first, authored.accepted, saved] })
    requireFact(await evaluate('Boolean(document.querySelector("[data-ui~=team-authoring-guidance-alternatives]")?.textContent.trim())'),
      'C16_GUIDANCE_REOPEN_PROPOSALS_UNAVAILABLE')
    requireFact(same((await authoring()).revisions.find((item) => item.team.id === saved.team.id &&
      item.revision === saved.revision), saved), 'C16_GUIDANCE_REOPEN_CHANGED_REVISION')
    stage = 'single-agent-work-navigation'
    await click(evaluate, signal, '[data-ui~="team-authoring-single-agent"]')
    await waitFor(signal, () => evaluate('document.querySelector("[data-ui~=work-mode-agent]")?.getAttribute("aria-pressed")==="true"'),
      'C16_GUIDANCE_SINGLE_AGENT_NAVIGATION_UNAVAILABLE')
    evidence.checks.push('five-step-workflow-and-all-eight-preset-guides',
      'actual-packaged-creator-proposals-visible-with-explicit-role-mapping',
      'unknown-model-prices-remain-unknown-and-source-provenance-retained',
      'saved-and-deployed-immutable-guidance-reopens-with-resource-selections',
      'visible-single-agent-alternative-opens-ordinary-work')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted ? 'C16_GUIDANCE_CANCELLED_OR_TIMED_OUT' :
      /^C(?:15|16)_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C16_GUIDANCE_OPERATION_UNAVAILABLE'
  } finally {
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failureCode: evidence.failureCode, evidencePath: configuration.evidence,
    evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
