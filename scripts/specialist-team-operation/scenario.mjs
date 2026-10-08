import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { click, fill, choose, ipc, openAuthoring, openWork, setup, selectTeam } from '../reusable-team-operation/scenario.mjs'
import { digest, requireFact, route, same, waitFor, write } from '../reusable-team-operation/io.mjs'
import { attemptFailureEvidence } from '../reusable-team-operation/attempt-diagnostics.mjs'
import { mixedTeamApprovalOperator } from '../reusable-team-operation/approvals.mjs'
import { roles, fields, readOnlyInstructions, memberSelector, fieldSelector, delivery } from './contracts.mjs'

export async function scenario({ evaluate, signal, targets }, configuration) {
  const evidence = {
    schemaVersion: 1, kind: 'specialist-team-packaged-operation', creationTaskRef: 'C16.1',
    complete: false, startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs,
    operationDriverSources: configuration.operationDriverSources, checks: [],
    teamMutationSurface: 'visible Settings authoring and Work controls',
    normalProfile: true, experimentalOptIn: false, modelChoice: 'explicit-manual-configured-gateway',
    requestedPolicyCompliance: 'unknown', credentialValueRecorded: false,
    restartScope: 'renderer reload; application process restart not claimed', nativeWindowsAcceptance: 'pending'
  }
  let stage = 'packaged-target'
  try {
    requireFact(targets.some((target) => target.type === 'page' &&
      target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)),
    'C16_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    await openWork(evaluate, signal)
    const selected = await setup(evaluate, configuration)
    const authoring = () => ipc(evaluate, route('authoring'), {})
    const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
    const initial = await snapshot()
    requireFact(initial.executionProfileStage === 'qualified' && initial.capabilities.execution && initial.capabilities.coding,
      'C16_NORMAL_PROFILE_UNQUALIFIED')
    stage = 'author-seven-specialists'
    await openAuthoring(evaluate, signal, selected.workspaceId)
    await click(evaluate, signal, '[data-ui~="team-authoring-new-specialist-delivery"]')
    const visibleRoles = await evaluate('[...document.querySelectorAll("[data-ui~=team-authoring-member]")].map(node=>node.dataset.role)')
    requireFact(same(visibleRoles, roles), 'C16_SPECIALIST_ROSTER_MISMATCH')
    await fill(evaluate, signal, '[data-ui~="team-authoring-name"]', configuration.marker)
    await fill(evaluate, signal, '[data-ui~="team-authoring-purpose"]', 'Read and assess the disposable brief with six separate specialists.')
    await fill(evaluate, signal, '[data-ui~="team-authoring-shared"]', readOnlyInstructions)
    for (const role of roles) {
      await choose(evaluate, signal, memberSelector(role) + ' [data-ui~="teams-model"]',
        '[role="option"][data-model-source="gateway"][data-provider-id="' + selected.model.providerId + '"][data-model-id="' + selected.model.modelId + '"]')
      for (const field of fields) await fill(evaluate, signal, fieldSelector(role, field), delivery(role)[field])
    }
    await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
    const first = await waitFor(signal, async () => (await authoring()).revisions.find((item) =>
      item.team.title === configuration.marker), 'C16_SAVE_UNAVAILABLE')
    requireFact(first.team.template === 'specialist-delivery' && same(first.team.members.map((member) => member.role), roles) &&
      first.team.members.every((member) => same(member.model, selected.model) &&
        fields.every((field) => member[field] === delivery(member.role)[field]) &&
        member.tools.every((tool) => !['filesystem__write', 'filesystem__edit'].includes(tool))),
    'C16_SAVED_MEMBER_CONTRACT_MISMATCH')
    const revisions = [first]
    stage = 'immutable-delivery-field-revisions'
    for (const field of fields) {
      const prior = revisions.at(-1)
      const member = prior.team.members.find((item) => item.role === 'ui-ux')
      const nextValue = member[field] + '\nRetain the readonly README.md boundary and distinguish evidence from assumptions.'
      await fill(evaluate, signal, fieldSelector('ui-ux', field), nextValue)
      await click(evaluate, signal, '[data-ui~="team-authoring-save"]')
      const next = await waitFor(signal, async () => (await authoring()).revisions.find((item) =>
        item.team.id === first.team.id && item.revision === prior.revision + 1), 'C16_FIELD_REVISION_UNAVAILABLE')
      const expected = { ...prior.team, members: prior.team.members.map((item) =>
        item.role === 'ui-ux' ? { ...item, [field]: nextValue } : item) }
      requireFact(same(next.team, expected) && next.definition.digest !== prior.definition.digest &&
        next.package.digest !== prior.package.digest, 'C16_FIELD_REVISION_MUTATED_SELECTIONS_OR_IDENTITY')
      requireFact((await authoring()).revisions.some((item) => same(item, prior)), 'C16_PRIOR_REVISION_CHANGED')
      revisions.push(next)
    }
    const accepted = revisions.at(-1)
    evidence.revisions = revisions.map((item) => ({ revision: item.revision, definition: item.definition, package: item.package }))
    evidence.checks.push('seven-specialist-editor-persists-delivery-fields-and-manual-models',
      'each-delivery-field-changes-new-immutable-identity-and-preserves-prior-revisions-and-resources')
    stage = 'deploy-and-run-all-specialists'
    await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
    const binding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) =>
      item.activationSupported && same(item.package, accepted.package)), 'C16_DEPLOYMENT_UNAVAILABLE', 60000)
    await click(evaluate, signal, '[data-ui~="team-authoring-work"]')
    await openWork(evaluate, signal)
    await choose(evaluate, signal, '[data-ui~="teams-workspace"]', '[data-option-id="' + selected.workspaceId + '"]')
    await selectTeam(evaluate, signal, accepted, binding)
    const before = new Set((await snapshot()).instances.map((item) => item.id))
    await fill(evaluate, signal, '[data-ui~="teams-prompt"]',
      'Read README.md directly with filesystem__read. Delegate to all six specialist roles in declared order, ' +
      'giving each the same direct-read instruction. Each specialist returns a concise assessment for its responsibility ' +
      'and the exact marker ' + configuration.marker + '. Use actual earlier artifacts for context and code review. ' +
      'Do not list directories, write files, commit, publish, install dependencies or run tests. Report unperformed checks honestly.')
    await click(evaluate, signal, '[data-ui~="teams-start"]')
    const instance = await waitFor(signal, async () => (await snapshot()).instances.find((item) =>
      !before.has(item.id) && same(item.definition, accepted.definition)), 'C16_TEAM_RUN_UNAVAILABLE', 60000)
    requireFact(same(instance.members.map((member) => member.role), roles), 'C16_NATIVE_ROSTER_MISMATCH')
    const selector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
    const execution = () => ipc(evaluate, route('execution'), selector)
    const memberRoles = Object.fromEntries(instance.members.map((member) => [member.id, member.role]))
    const approvals = mixedTeamApprovalOperator({ evaluate, signal, selector, instance,
      instructions: accepted.team.instructions, workspaceDirectory: configuration.workspaceDirectory,
      template: 'specialist-delivery' })
    evidence.approvals = approvals.evidence
    const completed = await waitFor(signal, async () => {
      const value = await execution()
      if (value.attempts.some((item) => ['failed', 'cancelled', 'uncertain'].includes(item.status))) {
        evidence.failedExecution = value.attempts.map(attemptFailureEvidence)
        requireFact(false, 'C16_REAL_ATTEMPT_FAILED')
      }
      await approvals.handle()
      const current = (await snapshot()).instances.find((item) => item.id === instance.id)
      const finished = value.attempts.filter((item) => item.status === 'succeeded' || item.executionOutcome === 'succeeded')
      return current?.tasks.some((item) => item.role === 'coordinator' && item.status === 'succeeded') &&
        !value.attempts.some((item) => ['queued', 'running', 'cancellation_requested'].includes(item.status)) &&
        roles.slice(1).every((role) => finished.some((item) => memberRoles[item.memberId] === role)) ? value : false
    }, 'C16_REAL_SPECIALIST_WORK_UNAVAILABLE', 900000, 3000)
    const attempts = completed.attempts.filter((item) => roles.slice(1).includes(memberRoles[item.memberId]) &&
      (item.status === 'succeeded' || item.executionOutcome === 'succeeded'))
    const artifacts = (await ipc(evaluate, route('artifacts'), selector)).artifacts
    requireFact(attempts.every((attempt) => artifacts.some((item) => item.attemptId === attempt.id &&
      item.memberId === attempt.memberId && item.taskId === attempt.taskId &&
      JSON.stringify(item.content).includes(configuration.marker))), 'C16_CORRELATED_SPECIALIST_ARTIFACTS_UNAVAILABLE')
    requireFact(attempts.every((attempt) => attempt.effectiveModels?.length &&
      attempt.effectiveModels.every((model) => model.support === 'validated' && model.supportEvidenceRef &&
        model.wireModelAlias === configuration.gateway.alias)), 'C16_EFFECTIVE_MANUAL_MODEL_MISMATCH')
    evidence.attempts = attempts.map((item) => ({ id: item.id, taskId: item.taskId, memberId: item.memberId,
      role: memberRoles[item.memberId], effectiveModels: item.effectiveModels, outputSha256: digest(JSON.stringify(item.output)) }))
    evidence.artifacts = artifacts.map((item) => ({ id: item.id, attemptId: item.attemptId, contentSha256: digest(JSON.stringify(item.content)) }))
    evidence.accepted = { definition: accepted.definition, package: accepted.package, binding, teamInstanceId: instance.id }
    evidence.checks.push('all-six-specialists-have-real-successful-manual-model-attempts-and-correlated-artifacts')
    stage = 'reopen-immutable-specialist-team'
    await evaluate('setTimeout(()=>location.reload(),50);true')
    await delay(750, undefined, { signal })
    await openAuthoring(evaluate, signal, selected.workspaceId)
    const reopened = await authoring()
    requireFact(revisions.every((revision) => reopened.revisions.some((item) => same(item, revision))),
      'C16_REOPEN_CHANGED_IMMUTABLE_REVISIONS')
    await choose(evaluate, signal, '[data-ui~="team-authoring-select"]',
      '[role="option"][data-authored-team-id="' + accepted.team.id + '"][data-authored-revision="' + accepted.revision + '"]')
    for (const member of accepted.team.members) for (const field of fields) {
      const value = await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector(' +
        JSON.stringify(fieldSelector(member.role, field)) + ');return n?.getClientRects().length?{value:n.value}:false})()'),
      'C16_REOPEN_DELIVERY_FIELD_UNAVAILABLE')
      requireFact(value.value === member[field], 'C16_REOPEN_DELIVERY_FIELD_MISMATCH')
    }
    await openWork(evaluate, signal)
    await choose(evaluate, signal, '[data-ui~="teams-workspace"]', '[data-option-id="' + selected.workspaceId + '"]')
    await choose(evaluate, signal, '[data-ui~="teams-instance"]', '[role="option"][data-team-id="' + instance.id + '"]')
    await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector("[data-ui~=teams-run]");return n?.dataset.teamId===' +
      JSON.stringify(instance.id) + '&&n.dataset.definitionDigest===' + JSON.stringify(accepted.definition.digest) + '})()'),
    'C16_REOPEN_PINNED_RUN_UNAVAILABLE')
    requireFact(same((await execution()).attempts.map((item) => item.id), completed.attempts.map((item) => item.id)),
      'C16_REOPEN_REPEATED_MODEL_WORK')
    const reopenedArtifacts = (await ipc(evaluate, route('artifacts'), selector)).artifacts
    requireFact(evidence.artifacts.every((item) => reopenedArtifacts.some((value) => value.id === item.id &&
      digest(JSON.stringify(value.content)) === item.contentSha256)), 'C16_REOPEN_CHANGED_ARTIFACTS')
    requireFact(digest(fs.readFileSync(path.join(configuration.workspaceDirectory, 'README.md'))) === configuration.workspaceSha256 &&
      fs.readdirSync(configuration.workspaceDirectory).every((name) => ['README.md', '.git'].includes(name)),
    'C16_WORK_EXCEEDED_READ_ONLY_SCOPE')
    evidence.checks.push('reopen-retains-visible-delivery-fields-immutable-revisions-and-pinned-run-without-reexecution')
    evidence.complete = true
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = signal.aborted ? 'C16_OPERATION_CANCELLED_OR_TIMED_OUT' :
      /^C(?:15|16)_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C16_OPERATION_UNAVAILABLE'
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
