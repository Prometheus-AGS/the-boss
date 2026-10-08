import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { click, fill, choose, ipc, openAuthoring, openWork, setup, selectTeam } from './scenario.mjs'
import { digest, requireFact, route, same, waitFor, write } from './io.mjs'
import { attemptFailureEvidence } from './attempt-diagnostics.mjs'
import { mixedTeamApprovalOperator } from './approvals.mjs'

export async function scenario({ evaluate, signal, targets }, configuration) {
  const evidence = {
    schemaVersion: 1,
    kind: 'reviewed-team-model-policy-packaged-operation',
    creationTaskRef: 'C15.1',
    complete: false,
    startedAt: new Date().toISOString(),
    sourceRefs: configuration.sourceRefs,
    reviewedSourceDigest: 'sha256:' + digest(configuration.reviewedSource),
    checks: [],
    teamMutationSurface: 'visible existing Teams editor and Work controls',
    restartScope: 'renderer reload; application process restart not claimed',
    credentialValueRecorded: false
  }
  let stage = 'packaged-target'
  try {
    requireFact(targets.some((target) => target.type === 'page' && target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)), 'C15_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    stage = 'configured-recommendation'
    const selected = await setup(evaluate, configuration)
    const authoring = () => ipc(evaluate, route('authoring'), {})
    const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    const result = JSON.parse(configuration.reviewedSource)
    requireFact(result.selected?.id === configuration.gateway.alias && (result.selected.provider === null || result.selected.provider === configuration.gateway.providerId) && (result.selected.catalogId === null || result.selected.catalogId === configuration.gateway.modelId), 'C15_REVIEWED_EXACT_CONFIGURED_IDENTITY_REQUIRED')
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await click(evaluate, signal, '[data-ui~="team-authoring-new-product-design"]')
    await fill(evaluate, signal, '[data-ui~="team-authoring-name"]', configuration.marker)
    await fill(evaluate, signal, '[data-ui~="team-authoring-purpose"]', 'Apply the reviewed role model policy to a bounded product brief.')
    await fill(evaluate, signal, '[data-ui~="team-authoring-shared"]', 'Read only README.md. Return its exact delivery marker. Never write files or perform external effects.')
    const roles = ['coordinator', 'product', 'designer', 'reviewer']
    for (const role of roles) {
      const member = '[data-ui~="team-authoring-member"][data-role="' + role + '"]'
      await fill(evaluate, signal, member + ' [data-ui~="team-authoring-model-policy-source"]', configuration.reviewedSource)
      await click(evaluate, signal, member + ' [data-ui~="team-authoring-model-policy-import"]')
      await waitFor(signal, () => evaluate(
        'document.querySelector(' + JSON.stringify(member + ' [data-ui~="team-authoring-model-policy-receipt"]') + ')?.getAttribute("data-policy-mode")==="pending" && document.querySelector(' + JSON.stringify(member + ' [data-ui~="uar-team-model-picker"]') + ')?.getAttribute("data-selected-model")===null'
      ), 'C15_RECOMMENDATION_NOT_DISTINCT_FROM_SELECTION')
      await click(evaluate, signal, member + ' [data-ui~="team-authoring-model-policy-accept"]')
    }
    stage = 'persist-reviewed-choice'
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const first = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.title === configuration.marker), 'C15_REVIEWED_POLICY_SAVE_UNAVAILABLE')
    requireFact(first.team.members.every((member) => member.modelPolicyMode === 'reviewed' && same(member.model, selected.model) && member.reviewedModelPolicy?.sourceDigest === evidence.reviewedSourceDigest && same(member.reviewedModelPolicy.result, first.team.members[0].reviewedModelPolicy.result)), 'C15_REVIEWED_POLICY_NOT_PERSISTED')
    requireFact(first.team.members[0].reviewedModelPolicy.sourceJson === configuration.reviewedSource && first.team.members[0].reviewedModelPolicy.result.explanation === result.explanation, 'C15_REVIEWED_POLICY_RESULT_CHANGED')
    requireFact(first.team.members.every((member) => member.reviewedModelPolicy.bindingTarget?.source === 'enabled-configured-gateway-alias' && member.reviewedModelPolicy.bindingTarget.providerId === configuration.gateway.providerId && member.reviewedModelPolicy.bindingTarget.modelId === configuration.gateway.modelId), 'C15_REVIEWED_BINDING_TARGET_NOT_RETAINED')
    const bindingTarget = first.team.members[0].reviewedModelPolicy.bindingTarget
    evidence.reviewedBindingTarget = bindingTarget
    evidence.policyDigest = first.team.members[0].reviewedModelPolicy.digest
    evidence.checks.push('existing-editor-distinguishes-import-from-exact-accepted-model')
    stage = 'explicit-manual-override'
    const reviewer = '[data-ui~="team-authoring-member"][data-role="reviewer"]'
    await choose(evaluate, signal, reviewer + ' [data-ui~="teams-model"]', '[role="option"][data-ui~="teams-model-planning"]')
    await choose(evaluate, signal, reviewer + ' [data-ui~="teams-model"]', '[role="option"][data-model-source="gateway"][data-provider-id="' + selected.model.providerId + '"][data-model-id="' + selected.model.modelId + '"]')
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const manual = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.id === first.team.id && item.revision === first.revision + 1), 'C15_MANUAL_OVERRIDE_SAVE_UNAVAILABLE')
    const manualMember = manual.team.members.find((member) => member.role === 'reviewer')
    requireFact(manualMember.modelPolicyMode === 'manual' && same(manualMember.reviewedModelPolicy, first.team.members.find((member) => member.role === 'reviewer').reviewedModelPolicy) && same(manualMember.model, selected.model), 'C15_MANUAL_OVERRIDE_LOST_RECOMMENDATION')
    requireFact(manual.definition.digest !== first.definition.digest && manual.package.digest !== first.package.digest, 'C15_POLICY_CHOICE_IDENTITY_UNCHANGED')
    evidence.checks.push('manual-choice-preserves-reviewed-policy-and-creates-immutable-revision')
    await click(evaluate, signal, reviewer + ' [data-ui~="team-authoring-model-policy-accept"]')
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const accepted = await waitFor(signal, async () => (await authoring()).revisions.find((item) => item.team.id === first.team.id && item.revision === manual.revision + 1), 'C15_REACCEPTED_POLICY_SAVE_UNAVAILABLE')
    stage = 'deploy-and-run-exact-reviewed-model'
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const binding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) => item.activationSupported && same(item.package, accepted.package)), 'C15_REVIEWED_MODEL_DEPLOYMENT_UNAVAILABLE', 60000)
    await click(evaluate, signal, '[data-ui~="team-authoring-work"]')
    await openWork(evaluate, signal)
    await choose(evaluate, signal, '[data-ui~="teams-workspace"]', '[data-option-id="' + selected.workspaceId + '"]')
    await selectTeam(evaluate, signal, accepted, binding)
    const before = new Set((await snapshot()).instances.map((item) => item.id))
    await fill(evaluate, signal, '[data-ui~="teams-prompt"]', 'Read README.md directly with filesystem__read. Give every role this same direct-read instruction. Product defines acceptance, designer proposes interaction, reviewer assesses their outputs. Each role returns the exact marker ' + configuration.marker + '. Do not write, commit, publish, install or run tests.')
    await click(evaluate, signal, '[data-ui~="teams-start"]')
    const instance = await waitFor(signal, async () => (await snapshot()).instances.find((item) => !before.has(item.id) && same(item.definition, accepted.definition)), 'C15_REVIEWED_MODEL_RUN_UNAVAILABLE', 60000)
    const selector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
    const execution = () => ipc(evaluate, route('execution'), selector)
    const memberRoles = Object.fromEntries(instance.members.map((member) => [member.id, member.role]))
    const approvals = mixedTeamApprovalOperator({ evaluate, signal, selector, instance, instructions: accepted.team.instructions, workspaceDirectory: configuration.workspaceDirectory })
    evidence.approvals = approvals.evidence
    const completed = await waitFor(signal, async () => {
      const value = await execution()
      if (value.attempts.some((item) => ['failed', 'cancelled', 'uncertain'].includes(item.status))) {
        evidence.failedExecution = value.attempts.map(attemptFailureEvidence)
        requireFact(false, 'C15_REVIEWED_MODEL_ATTEMPT_FAILED')
      }
      await approvals.handle()
      const current = (await snapshot()).instances.find((item) => item.id === instance.id)
      const finished = value.attempts.filter((item) => item.status === 'succeeded' || item.executionOutcome === 'succeeded')
      return current?.tasks.some((item) => item.role === 'coordinator' && item.status === 'succeeded') && !value.attempts.some((item) => ['queued', 'running', 'cancellation_requested'].includes(item.status)) && roles.slice(1).every((role) => finished.some((item) => memberRoles[item.memberId] === role)) ? value : false
    }, 'C15_REAL_REVIEWED_MODEL_RUN_UNAVAILABLE', 900000, 3000)
    const attempts = completed.attempts.filter(
      (item) => roles.slice(1).includes(memberRoles[item.memberId]) && (item.status === 'succeeded' || item.executionOutcome === 'succeeded')
    )
    requireFact(
      roles.slice(1).every((role) => attempts.some((item) => memberRoles[item.memberId] === role)) &&
      attempts.every((attempt) => attempt.effectiveModels?.length && attempt.effectiveModels.every(
        (model) => model.support === 'validated' && model.supportEvidenceRef && model.wireModelAlias === result.selected.id &&
          model.pricingIdentity?.providerId === bindingTarget.providerId && model.pricingIdentity?.modelId === bindingTarget.modelId && model.pricingIdentity.catalogRevision
      )),
      'C15_EFFECTIVE_MODEL_DIFFERS_FROM_REVIEWED_IDENTITY'
    )
    evidence.attempts = attempts.map((item) => ({ id: item.id, memberId: item.memberId, effectiveModels: item.effectiveModels }))
    evidence.accepted = { definition: accepted.definition, package: accepted.package, binding, teamInstanceId: instance.id }
    evidence.checks.push('reviewed-choice-deploys-and-runs-exact-effective-model')
    stage = 'reopen-retained-policy'
    await evaluate('setTimeout(()=>location.reload(),50);true')
    await delay(750, undefined, { signal })
    await openAuthoring(evaluate, signal, selected.workspaceId)
    const reopened = await authoring()
    requireFact([first, manual, accepted].every((revision) => reopened.revisions.some((item) => same(item, revision))), 'C15_REOPEN_CHANGED_REVIEWED_POLICY_OR_OLDER_REVISION')
    await choose(evaluate, signal, '[data-ui~="team-authoring-select"]', '[role="option"][data-authored-team-id="' + accepted.team.id + '"][data-authored-revision="' + accepted.revision + '"]')
    const visiblePolicies = await evaluate('(()=>{const nodes=[...document.querySelectorAll("[data-ui~=team-authoring-model-policy-receipt]")].filter(node=>node.getClientRects().length);return nodes.map(node=>({digest:node.getAttribute("data-policy-digest"),mode:node.getAttribute("data-policy-mode")}));})()')
    requireFact(visiblePolicies.length === 4 && visiblePolicies.every((policy) => policy.digest === evidence.policyDigest && policy.mode === 'reviewed'), 'C15_REOPEN_POLICY_IDENTITY_NOT_VISIBLE')
    requireFact(same((await execution()).attempts.map((item) => item.id), completed.attempts.map((item) => item.id)), 'C15_REOPEN_REPEATED_REVIEWED_MODEL_WORK')
    requireFact(digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'README.md'))) === configuration.workspaceSha256, 'C15_REVIEWED_MODEL_EXCEEDED_READ_ONLY_SCOPE')
    evidence.checks.push('reopen-retains-reviewed-policy-and-immutable-manual-history')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted ? 'C15_OPERATION_CANCELLED_OR_TIMED_OUT' : /^C15_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C15_REVIEWED_MODEL_POLICY_OPERATION_UNAVAILABLE'
  } finally {
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete, checks: evidence.checks, failureCode: evidence.failureCode, evidencePath: configuration.evidence, evidenceSha256: digest(fs.readFileSync(configuration.evidence)) }) }
}
