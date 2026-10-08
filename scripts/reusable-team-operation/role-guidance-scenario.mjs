import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

import { click, fill, choose, ipc, openAuthoring, openWork, setup, selectTeam } from './scenario.mjs'
import { digest, requireFact, route, same, waitFor, write } from './io.mjs'
import { attemptFailureEvidence } from './attempt-diagnostics.mjs'
import { mixedTeamApprovalOperator } from './approvals.mjs'

const memberSelector = (role) => '[data-ui~="team-authoring-member"][data-role="' + role + '"]'
const guideReceipt = '[data-ui~="team-authoring-guidance-receipt"]'

async function readOnlyTools(evaluate, signal, role) {
  for (const tool of ['filesystem__edit', 'filesystem__write']) {
    const selector = memberSelector(role) + ' [data-ui~="team-authoring-tool"][data-tool-name="' + tool + '"]'
    const checked = await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector(' + JSON.stringify(selector) + ');return n?{checked:n.getAttribute("aria-checked")}:false})()'), 'C15_GUIDANCE_TOOL_CONTROL_UNAVAILABLE')
    if (checked.checked === 'true') await click(evaluate, signal, selector)
    await waitFor(signal, () => evaluate('document.querySelector(' + JSON.stringify(selector) + ')?.getAttribute("aria-checked")==="false"'), 'C15_GUIDANCE_READ_ONLY_TOOLS_REQUIRED')
  }
}

export async function scenario({ evaluate, signal, targets }, configuration) {
  const result = JSON.parse(configuration.guidanceSource)
  const mappings = configuration.guidanceMappings
  const roles = configuration.template === 'coding' ? ['coordinator', 'worker', 'reviewer'] : ['coordinator', 'product', 'designer', 'reviewer']
  const evidence = {
    schemaVersion: 1, kind: 'creator-guidance-manual-model-packaged-operation', creationTaskRef: 'C15.1',
    complete: false, startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs,
    operationDriverSources: configuration.operationDriverSources,
    guidanceSourceDigest: 'sha256:' + digest(configuration.guidanceSource), template: configuration.template,
    mappings, checks: [], modelChoice: 'explicit-manual-configured-gateway',
    requestedPolicyCompliance: 'unknown', reviewedModelPolicyAcceptance: 'not-exercised',
    fullC15_1CompletionClaimed: false, authority: 'existing template/compiler and read-only host binding',
    restartScope: 'renderer reload; application process restart not claimed', credentialValueRecorded: false
  }
  let stage = 'packaged-target'
  try {
    requireFact(targets.some((target) => target.type === 'page' && target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)), 'C15_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    requireFact(mappings.every((mapping) => roles.includes(mapping.memberRole)), 'C15_GUIDANCE_EXISTING_TEMPLATE_MAPPING_REQUIRED')
    stage = 'fresh-profile-onboarding'
    await openWork(evaluate, signal)
    stage = 'configured-manual-model'
    const selected = await setup(evaluate, configuration)
    const authoring = () => ipc(evaluate, route('authoring'), {})
    const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    const initialRuntime = await snapshot()
    requireFact(initialRuntime.executionProfileStage === 'qualified' && initialRuntime.capabilities.execution && initialRuntime.capabilities.coding, 'C15_GUIDANCE_QUALIFIED_EXECUTION_REQUIRED')
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await click(evaluate, signal, '[data-ui~="team-authoring-new-' + configuration.template + '"]')
    await fill(evaluate, signal, '[data-ui~="team-authoring-name"]', configuration.marker)
    await fill(evaluate, signal, '[data-ui~="team-authoring-purpose"]', 'Read a disposable delivery marker with the named ' + configuration.template + ' team.')
    await fill(evaluate, signal, '[data-ui~="team-authoring-shared"]', 'Read only README.md. Return its exact delivery marker. Never write files or perform external effects.')
    for (const role of roles) {
      await choose(evaluate, signal, memberSelector(role) + ' [data-ui~="teams-model"]', '[role="option"][data-model-source="gateway"][data-provider-id="' + selected.model.providerId + '"][data-model-id="' + selected.model.modelId + '"]')
      if (role !== 'coordinator') await readOnlyTools(evaluate, signal, role)
    }
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const first = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.title === configuration.marker), 'C15_GUIDANCE_BASE_SAVE_UNAVAILABLE')
    requireFact(first.team.template === configuration.template && first.team.members.every((member) => same(member.model, selected.model) && member.tools.every((tool) => !['filesystem__write', 'filesystem__edit'].includes(tool))), 'C15_GUIDANCE_MANUAL_READ_ONLY_BASE_REQUIRED')
    stage = 'visible-guide-preview-and-explicit-mapping'
    await fill(evaluate, signal, '[data-ui~="team-authoring-guidance-source"]', configuration.guidanceSource)
    await click(evaluate, signal, '[data-ui~="team-authoring-guidance-import"]')
    const imported = await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector(' + JSON.stringify(guideReceipt) + ');return n?{ready:n.getAttribute("data-guidance-ready"),sourceDigest:n.getAttribute("data-guidance-source-digest"),digest:n.getAttribute("data-guidance-digest")}:false})()'), 'C15_GUIDANCE_IMPORT_UNAVAILABLE')
    requireFact(imported.ready === 'true' && imported.sourceDigest === evidence.guidanceSourceDigest, 'C15_GUIDANCE_IMPORT_IDENTITY_MISMATCH')
    evidence.guidanceDigest = imported.digest
    const choices = await evaluate('[...document.querySelectorAll("[data-ui~=team-authoring-guidance-select]")].map(n=>n.getAttribute("aria-checked"))')
    requireFact(choices.length === result.team.roles.length && choices.every((value) => value === 'false'), 'C15_GUIDANCE_IMPORT_SELECTED_ROLES_AUTOMATICALLY')
    for (const member of first.team.members) {
      const instructions = await evaluate('document.querySelector(' + JSON.stringify(memberSelector(member.role) + ' [data-ui~="team-authoring-instructions"]') + ')?.value')
      requireFact(instructions === member.instructions, 'C15_GUIDANCE_IMPORT_APPLIED_ROLE_AUTOMATICALLY')
    }
    for (const mapping of mappings) {
      const row = '[data-ui~="team-authoring-guidance-role"][data-source-role="' + mapping.sourceRole + '"]'
      await click(evaluate, signal, row + ' [data-ui~="team-authoring-guidance-select"]')
      await fill(evaluate, signal, row + ' [data-ui~="team-authoring-guidance-target"]', mapping.memberRole)
    }
    const preview = await waitFor(signal, () => evaluate('document.querySelector("[data-ui~=team-authoring-guidance-preview]")?.textContent'), 'C15_GUIDANCE_MAPPING_PREVIEW_UNAVAILABLE')
    requireFact(same(JSON.parse(preview), mappings), 'C15_GUIDANCE_MAPPING_PREVIEW_MISMATCH')
    requireFact(same((await authoring()).revisions.find((item) => item.team.id === first.team.id), first), 'C15_GUIDANCE_IMPORT_MUTATED_SAVED_TEAM')
    await click(evaluate, signal, '[data-ui~="team-authoring-guidance-apply"]')
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const guided = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.id === first.team.id && item.revision === first.revision + 1), 'C15_GUIDANCE_APPLIED_SAVE_UNAVAILABLE')
    requireFact(guided.team.reviewedGuidance?.source === 'agent-team-creator/guide' && guided.team.reviewedGuidance.sourceJson === configuration.guidanceSource && guided.team.reviewedGuidance.sourceDigest === evidence.guidanceSourceDigest && guided.team.reviewedGuidance.digest === imported.digest && isDeepStrictEqual(guided.team.reviewedGuidance.result, result) && same(guided.team.guidanceMappings, mappings), 'C15_GUIDANCE_PROVENANCE_NOT_PERSISTED')
    for (const member of guided.team.members) {
      const prior = first.team.members.find((item) => item.role === member.role)
      const mapping = mappings.find((item) => item.memberRole === member.role)
      if (!mapping) requireFact(same(member, prior), 'C15_GUIDANCE_CHANGED_UNSELECTED_ROLE')
      else {
        const proposal = result.team.roles.find((item) => item.id === mapping.sourceRole)
        requireFact(member.responsibility === proposal.description && member.instructions === proposal.prompt && member.modelPolicyMode === 'manual' && same(member.model, prior.model) && same(member.tools, prior.tools) && same(member.skills, prior.skills) && same(member.knowledge, prior.knowledge), 'C15_GUIDANCE_APPLY_CHANGED_AUTHORITY_OR_MAPPING')
      }
    }
    evidence.requestedRolePolicies = mappings.map((mapping) => {
      const policy = result.team.roles.find((role) => role.id === mapping.sourceRole).modelPolicy
      return { ...mapping, requestedTier: ['low', 'medium', 'hard'].includes(policy?.tier) ? policy.tier : null, policyDigest: policy ? 'sha256:' + digest(JSON.stringify(policy)) : null, compliance: 'unknown' }
    })
    evidence.checks.push('visible-creator-import-and-explicit-mapping-preserve-native-authority')
    stage = 'immutable-guided-revision'
    await fill(evaluate, signal, '[data-ui~="team-authoring-purpose"]', guided.team.purpose + ' Preserve reviewed creator provenance on revision.')
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const revised = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.id === first.team.id && item.revision === guided.revision + 1), 'C15_GUIDANCE_REVISION_UNAVAILABLE')
    requireFact(same(revised.team.reviewedGuidance, guided.team.reviewedGuidance) && same(revised.team.guidanceMappings, mappings) && same(revised.team.members, guided.team.members) && revised.definition.digest !== guided.definition.digest && revised.package.digest !== guided.package.digest, 'C15_GUIDANCE_REVISION_IDENTITY_OR_PROVENANCE_CHANGED')
    stage = 'deploy-and-run-guided-manual-model'
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const binding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) => item.activationSupported && same(item.package, revised.package)), 'C15_GUIDANCE_DEPLOYMENT_UNAVAILABLE', 60000)
    await click(evaluate, signal, '[data-ui~="team-authoring-work"]')
    await openWork(evaluate, signal)
    await choose(evaluate, signal, '[data-ui~="teams-workspace"]', '[data-option-id="' + selected.workspaceId + '"]')
    await selectTeam(evaluate, signal, revised, binding)
    const before = new Set((await snapshot()).instances.map((item) => item.id))
    await fill(evaluate, signal, '[data-ui~="teams-prompt"]', 'Read README.md directly with filesystem__read. Give every member this same direct-read instruction. Delegate to every defined member role and use their actual artifacts. Each member returns the exact marker ' + configuration.marker + '. Do not write any planning outputs, commit, publish, install or run tests. Guide output paths are planning metadata only.')
    await click(evaluate, signal, '[data-ui~="teams-start"]')
    const instance = await waitFor(signal, async () => (await snapshot()).instances.find((item) => !before.has(item.id) && same(item.definition, revised.definition)), 'C15_GUIDANCE_TEAM_RUN_UNAVAILABLE', 60000)
    const selector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
    const execution = () => ipc(evaluate, route('execution'), selector)
    const memberRoles = Object.fromEntries(instance.members.map((member) => [member.id, member.role]))
    const approvals = mixedTeamApprovalOperator({ evaluate, signal, selector, instance, instructions: revised.team.instructions, workspaceDirectory: configuration.workspaceDirectory, template: configuration.template })
    evidence.approvals = approvals.evidence
    const completed = await waitFor(signal, async () => {
      const value = await execution()
      if (value.attempts.some((item) => ['failed', 'cancelled', 'uncertain'].includes(item.status))) {
        evidence.failedExecution = value.attempts.map(attemptFailureEvidence)
        requireFact(false, 'C15_GUIDANCE_REAL_ATTEMPT_FAILED')
      }
      await approvals.handle()
      const current = (await snapshot()).instances.find((item) => item.id === instance.id)
      const finished = value.attempts.filter((item) => item.status === 'succeeded' || item.executionOutcome === 'succeeded')
      return current?.tasks.some((item) => item.role === 'coordinator' && item.status === 'succeeded') && !value.attempts.some((item) => ['queued', 'running', 'cancellation_requested'].includes(item.status)) && roles.slice(1).every((role) => finished.some((item) => memberRoles[item.memberId] === role)) ? value : false
    }, 'C15_GUIDANCE_REAL_RUN_UNAVAILABLE', 900000, 3000)
    const attempts = completed.attempts.filter((item) => roles.slice(1).includes(memberRoles[item.memberId]) && (item.status === 'succeeded' || item.executionOutcome === 'succeeded'))
    requireFact(attempts.every((attempt) => attempt.effectiveModels?.length && attempt.effectiveModels.every((model) => model.support === 'validated' && model.supportEvidenceRef && model.wireModelAlias === configuration.gateway.alias)), 'C15_GUIDANCE_EFFECTIVE_MANUAL_MODEL_MISMATCH')
    evidence.attempts = attempts.map((item) => ({ id: item.id, memberId: item.memberId, effectiveModels: item.effectiveModels, outputSha256: digest(JSON.stringify(item.output)), deliveryMarkerReturned: JSON.stringify(item.output).includes(configuration.marker) }))
    evidence.accepted = { definition: revised.definition, package: revised.package, binding, teamInstanceId: instance.id }
    evidence.checks.push('real-guided-team-runs-manually-selected-exact-model-with-read-only-approvals')
    stage = 'reopen-named-guided-team'
    await evaluate('setTimeout(()=>location.reload(),50);true')
    await delay(750, undefined, { signal })
    await openAuthoring(evaluate, signal, selected.workspaceId)
    const reopened = await authoring()
    requireFact([first, guided, revised].every((revision) => reopened.revisions.some((item) => same(item, revision))), 'C15_GUIDANCE_REOPEN_CHANGED_IMMUTABLE_REVISION')
    await choose(evaluate, signal, '[data-ui~="team-authoring-select"]', '[role="option"][data-authored-team-id="' + revised.team.id + '"][data-authored-revision="' + revised.revision + '"]')
    const visible = await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector(' + JSON.stringify(guideReceipt) + ');return n?.getClientRects().length?{digest:n.getAttribute("data-guidance-digest"),sourceDigest:n.getAttribute("data-guidance-source-digest"),maps:document.querySelector("[data-ui~=team-authoring-guidance-mappings]")?.textContent}:false})()'), 'C15_GUIDANCE_REOPEN_NOT_VISIBLE')
    requireFact(visible.digest === imported.digest && visible.sourceDigest === evidence.guidanceSourceDigest && same(JSON.parse(visible.maps), mappings), 'C15_GUIDANCE_REOPEN_IDENTITY_MISMATCH')
    for (const mapping of mappings) {
      const selector = memberSelector(mapping.memberRole) + ' [data-ui~="team-authoring-requested-role-policy"][data-source-role="' + mapping.sourceRole + '"]'
      const displayed = await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector(' + JSON.stringify(selector) + ');return n?.getClientRects().length?n.querySelector("pre")?.textContent:false})()'), 'C15_GUIDANCE_REQUESTED_POLICY_NOT_VISIBLE')
      requireFact(same(JSON.parse(displayed), result.team.roles.find((role) => role.id === mapping.sourceRole).modelPolicy ?? null), 'C15_GUIDANCE_VISIBLE_REQUESTED_POLICY_CHANGED')
    }
    requireFact(same((await execution()).attempts.map((item) => item.id), completed.attempts.map((item) => item.id)), 'C15_GUIDANCE_REOPEN_REPEATED_WORK')
    requireFact(digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'README.md'))) === configuration.workspaceSha256, 'C15_GUIDANCE_EXCEEDED_READ_ONLY_SCOPE')
    evidence.revisions = [first, guided, revised].map((item) => ({ revision: item.revision, definition: item.definition, package: item.package }))
    evidence.checks.push('named-team-reopen-retains-full-guide-source-and-all-immutable-definitions')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted ? 'C15_OPERATION_CANCELLED_OR_TIMED_OUT' : /^C15_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C15_GUIDANCE_OPERATION_UNAVAILABLE'
    if (error.approvalIpcFailure) evidence.approvalIpcFailure = error.approvalIpcFailure
    if (error.approvalScopeFailure) evidence.approvalScopeFailure = error.approvalScopeFailure
  } finally {
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete, checks: evidence.checks, failureCode: evidence.failureCode, requestedPolicyCompliance: evidence.requestedPolicyCompliance, reviewedModelPolicyAcceptance: evidence.reviewedModelPolicyAcceptance, fullC15_1CompletionClaimed: false, evidencePath: configuration.evidence, evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
