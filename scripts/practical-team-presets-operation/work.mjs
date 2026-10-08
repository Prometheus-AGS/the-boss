import { click, fill, choose, ipc, openWork, selectTeam } from '../reusable-team-operation/scenario.mjs'
import { mixedTeamApprovalOperator } from '../reusable-team-operation/approvals.mjs'
import { attemptFailureEvidence } from '../reusable-team-operation/attempt-diagnostics.mjs'
import { digest, requireFact, route, same, waitFor } from '../reusable-team-operation/io.mjs'

export async function runPreset({ evaluate, signal, selected, configuration, preset, accepted, evidence }) {
  const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
  await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
  const binding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) =>
    item.activationSupported && same(item.package, accepted.package)), 'C16_PRACTICAL_DEPLOYMENT_UNAVAILABLE', 60000)
  await click(evaluate, signal, '[data-ui~="team-authoring-work"]')
  await openWork(evaluate, signal)
  await choose(evaluate, signal, '[data-ui~="teams-workspace"]', '[data-option-id="' + selected.workspaceId + '"]')
  await selectTeam(evaluate, signal, accepted, binding)
  const before = new Set((await snapshot()).instances.map((item) => item.id))
  await fill(evaluate, signal, '[data-ui~="teams-prompt"]',
    'Read README.md directly with filesystem__read. Delegate to every contributor and then reviewer in the declared role order. ' +
    'Give each member the same direct-read instruction. Use the preset output and evidence instructions to produce useful ' +
    preset.template + ' artifacts. Pass actual contributor artifacts to the reviewer for independent acceptance or rejection. ' +
    'Each member must return its required section and the exact delivery marker ' + configuration.marker +
    '. Do not list directories, write files, commit, publish, send external messages, create issues, install dependencies or run tests. ' +
    'Report unperformed checks and missing inputs honestly.')
  await click(evaluate, signal, '[data-ui~="teams-start"]')
  const instance = await waitFor(signal, async () => (await snapshot()).instances.find((item) =>
    !before.has(item.id) && same(item.definition, accepted.definition)), 'C16_PRACTICAL_RUN_UNAVAILABLE', 60000)
  requireFact(same(instance.members.map((member) => member.role), preset.roles), 'C16_PRACTICAL_NATIVE_ROSTER_MISMATCH')
  const selector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
  const execution = () => ipc(evaluate, route('execution'), selector)
  const memberRoles = Object.fromEntries(instance.members.map((member) => [member.id, member.role]))
  const approvals = mixedTeamApprovalOperator({ evaluate, signal, selector, instance,
    instructions: accepted.team.instructions, workspaceDirectory: configuration.workspaceDirectory, template: preset.template })
  evidence.approvals = approvals.evidence
  const completed = await waitFor(signal, async () => {
    const value = await execution()
    if (value.attempts.some((item) => ['failed', 'cancelled', 'uncertain'].includes(item.status))) {
      evidence.failedExecution = value.attempts.map(attemptFailureEvidence)
      requireFact(false, 'C16_PRACTICAL_REAL_ATTEMPT_FAILED')
    }
    await approvals.handle()
    const current = (await snapshot()).instances.find((item) => item.id === instance.id)
    const successful = value.attempts.filter((item) => item.status === 'succeeded' || item.executionOutcome === 'succeeded')
    return current?.tasks.some((item) => item.role === 'coordinator' && item.status === 'succeeded') &&
      !value.attempts.some((item) => ['queued', 'running', 'cancellation_requested'].includes(item.status)) &&
      preset.roles.slice(1).every((role) => successful.some((item) => memberRoles[item.memberId] === role)) ? value : false
  }, 'C16_PRACTICAL_REAL_WORK_UNAVAILABLE', 300000, 3000)
  const artifacts = (await ipc(evaluate, route('artifacts'), selector)).artifacts
  const attempts = completed.attempts.filter((item) => preset.roles.slice(1).includes(memberRoles[item.memberId]) &&
    (item.status === 'succeeded' || item.executionOutcome === 'succeeded'))
  requireFact(attempts.every((attempt) => artifacts.some((item) => item.attemptId === attempt.id &&
    item.memberId === attempt.memberId && item.taskId === attempt.taskId &&
    JSON.stringify(item.content).includes(configuration.marker) &&
    JSON.stringify(item.content).includes(preset.sections[memberRoles[attempt.memberId]]))),
  'C16_PRACTICAL_CORRELATED_DELIVERABLES_UNAVAILABLE')
  requireFact(attempts.every((attempt) => attempt.effectiveModels?.length && attempt.effectiveModels.every((model) =>
    model.support === 'validated' && model.supportEvidenceRef && model.wireModelAlias === configuration.gateway.alias)),
  'C16_PRACTICAL_EFFECTIVE_MODEL_MISMATCH')
  requireFact(evidence.approvals.approvals.some((item) => item.toolName === 'filesystem__read' && item.decision === 'allow'),
    'C16_PRACTICAL_READ_ONLY_APPROVAL_UNAVAILABLE')
  const reviewer = attempts.filter((attempt) => memberRoles[attempt.memberId] === 'reviewer')
  requireFact(reviewer.some((attempt) => preset.roles.slice(1, -1).every((role) => artifacts.some((artifact) =>
    memberRoles[artifact.memberId] === role && attempt.contextArtifactIds.includes(artifact.id)))),
    'C16_PRACTICAL_REVIEW_EVIDENCE_NOT_LINKED')
  evidence.accepted = { teamId: accepted.team.id, revision: accepted.revision, definition: accepted.definition,
    package: accepted.package, binding, teamInstanceId: instance.id }
  evidence.attempts = attempts.map((item) => ({ id: item.id, taskId: item.taskId, memberId: item.memberId,
    role: memberRoles[item.memberId], effectiveModels: item.effectiveModels, contextArtifactIds: item.contextArtifactIds,
    outputSha256: digest(JSON.stringify(item.output)) }))
  evidence.artifacts = artifacts.map((item) => ({ id: item.id, attemptId: item.attemptId, taskId: item.taskId,
    memberId: item.memberId, contentSha256: digest(JSON.stringify(item.content)) }))
  return { selector, instance, completed, artifacts }
}

export async function reopenRun({ evaluate, signal, selected, run, accepted }) {
  await openWork(evaluate, signal)
  await choose(evaluate, signal, '[data-ui~="teams-workspace"]', '[data-option-id="' + selected.workspaceId + '"]')
  await choose(evaluate, signal, '[data-ui~="teams-instance"]', '[role="option"][data-team-id="' + run.instance.id + '"]')
  await waitFor(signal, () => evaluate('(()=>{const n=document.querySelector("[data-ui~=teams-run]");return n?.dataset.teamId===' +
    JSON.stringify(run.instance.id) + '&&n.dataset.definitionDigest===' + JSON.stringify(accepted.definition.digest) + '})()'),
  'C16_PRACTICAL_REOPEN_PINNED_RUN_UNAVAILABLE')
  const current = await ipc(evaluate, route('execution'), run.selector)
  requireFact(same(current.attempts.map((item) => item.id), run.completed.attempts.map((item) => item.id)),
    'C16_PRACTICAL_REOPEN_REPEATED_INFERENCE')
  const artifacts = (await ipc(evaluate, route('artifacts'), run.selector)).artifacts
  requireFact(run.artifacts.every((item) => artifacts.some((value) => value.id === item.id && same(value, item))),
    'C16_PRACTICAL_REOPEN_CHANGED_ARTIFACTS')
}
