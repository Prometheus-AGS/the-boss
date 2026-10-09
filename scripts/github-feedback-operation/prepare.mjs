import fs from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

import { click, choose, fill, ipc, openWork, setup, selectTeam } from '../reusable-team-operation/scenario.mjs'
import { digest, requireFact, route, same, waitFor } from '../reusable-team-operation/io.mjs'
import { readTools } from '../practical-team-presets-operation/contracts.mjs'
import { mixedTeamApprovalOperator } from '../reusable-team-operation/approvals.mjs'
import { feedbackWork, chooseText, previewVisible, selectIntake } from './ui.mjs'
import { authorFeedback } from './author.mjs'

export async function prepare(context, configuration, evidence) {
  const { evaluate, signal } = context
  evidence.stage = 'open-work'
  await openWork(evaluate, signal)
  evidence.stage = 'configure-workspace-and-model'
  const selected = await setup(evaluate, configuration)
  evidence.workspaceId = selected.workspaceId
  evidence.selectedModel = selected.model
  evidence.credentialReference = configuration.gateway.credentialEnv
  evidence.stage = 'load-execution-profile-and-reviewed-skill'
  const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId: selected.workspaceId })
  const profile = await snapshot()
  requireFact(profile.executionProfileStage === 'qualified' && profile.capabilities.execution,
    'C10_NORMAL_EXECUTION_PROFILE_REQUIRED')
  const skills = await ipc(evaluate, route('skills'), {})
  const skill = skills.entries.find((entry) => entry.skillRef?.id === 'builtin::better-writing' &&
    entry.availability === 'available' && entry.reviewedCoverage.status === 'reviewed' &&
    entry.skillRef.requiredTools.every((tool) => readTools.includes(tool)))
  requireFact(skill, 'C10_REVIEWED_CUSTOMER_FEEDBACK_SKILL_REQUIRED')
  const authored = await authorFeedback({ evaluate, signal, selected, configuration, skill, evidence })
  evidence.stage = 'deploy-feedback-team'
  await click(evaluate, signal, '[data-ui~="team-authoring-deploy"]')
  const binding = await waitFor(signal, async () => (await snapshot()).bindings.find((item) =>
    item.activationSupported && same(item.package, authored.accepted.package)), 'C10_FEEDBACK_TEAM_DEPLOYMENT_REQUIRED', 60000)
  evidence.teamDefinition = authored.accepted.definition
  evidence.teamPackage = authored.accepted.package
  evidence.deploymentBinding = binding
  await feedbackWork(evaluate, signal, selected.workspaceId)
  await selectTeam(evaluate, signal, authored.accepted, binding)
  const workflows = await ipc(evaluate, 'prometheus.uar.workflows.snapshot', { workspaceId: selected.workspaceId })
  const workflow = workflows.definitions.find((item) => item.supported && same(item.package, authored.accepted.package))
  requireFact(workflows.available && workflows.stage === 'qualified' && workflow &&
    workflow.steps[0].id === 'classify' && workflow.steps[1].id === 'draft', 'C10_PACKAGED_FEEDBACK_WORKFLOW_REQUIRED')
  evidence.workflowDefinition = workflow.identity
  const feedback = fs.readFileSync(configuration.feedbackFile, 'utf8').trim()
  requireFact(feedback.length > 0 && feedback.length <= 8000, 'C10_ACTUAL_FEEDBACK_INPUT_REQUIRED')
  for (const name of [configuration.gateway.credentialEnv, process.env.BOSS_C10_GITHUB_CREDENTIAL_ENV].filter(Boolean))
    requireFact(!process.env[name] || !feedback.includes(process.env[name]), 'C10_FEEDBACK_CONTAINS_CREDENTIAL')
  evidence.feedbackInputSha256 = digest(feedback)
  await chooseText(evaluate, signal, '[data-ui~="team-feedback-workflow"]', workflow.title + ' · ' + workflow.identity.version)
  await chooseText(evaluate, signal, '[data-ui~="team-feedback-definition"]', authored.accepted.team.title + ' · ' + authored.accepted.definition.version)
  await chooseText(evaluate, signal, '[data-ui~="team-feedback-binding"]', binding.id)
  await fill(evaluate, signal, '[data-ui~="team-feedback-target"]', configuration.target)
  await fill(evaluate, signal, '[data-ui~="team-feedback-input"]', feedback)
  const before = new Set((await ipc(evaluate, 'prometheus.uar.feedback.snapshot', { workspaceId: selected.workspaceId })).intakes.map((item) => item.id))
  await click(evaluate, signal, '[data-ui~="team-feedback-draft"]')
  const intake = await waitFor(signal, async () => (await ipc(evaluate, 'prometheus.uar.feedback.snapshot',
    { workspaceId: selected.workspaceId })).intakes.find((item) => !before.has(item.id) && item.requestedTarget === configuration.target),
  'C10_DURABLE_FEEDBACK_START_REQUIRED', 60000)
  const selector = { workspaceId: selected.workspaceId, intakeId: intake.id }
  const read = () => ipc(evaluate, 'prometheus.uar.feedback.read', selector)
  const initial = await read()
  requireFact(initial.workflow?.teamId, 'C10_WORKFLOW_TEAM_LINK_REQUIRED')
  const instance = (await snapshot()).instances.find((item) => item.id === initial.workflow.teamId)
  requireFact(instance && same(instance.package, authored.accepted.package), 'C10_WORKFLOW_TEAM_SCOPE_REQUIRED')
  const executionSelector = { workspaceId: selected.workspaceId, teamInstanceId: instance.id }
  evidence.selector = selector
  evidence.teamInstanceId = instance.id
  await selectTeam(evaluate, signal, authored.accepted, binding)
  await choose(evaluate, signal, '[data-ui~="teams-instance"]', `[role="option"][data-team-id="${instance.id}"]`)
  const operator = mixedTeamApprovalOperator({ evaluate, signal, selector: executionSelector, instance,
    instructions: authored.accepted.team.instructions, workspaceDirectory: configuration.workspaceDirectory,
    template: 'customer-feedback' })
  evidence.hostApprovals = operator.evidence
  const completed = await waitFor(signal, async () => {
    const value = await read()
    requireFact(!['failed', 'cancelled', 'rejected', 'reconciling'].includes(value.workflow?.status),
      'C10_REAL_FEEDBACK_WORKFLOW_FAILED')
    const attempts = (await ipc(evaluate, route('execution'), executionSelector)).attempts
    requireFact(!attempts.some((item) => ['failed', 'cancelled', 'uncertain'].includes(item.status)),
      'C10_REAL_FEEDBACK_ATTEMPT_FAILED')
    await operator.handle()
    return value.workflow?.status === 'awaiting_decision' ? value : false
  }, 'C10_REAL_CLASSIFY_DRAFT_REQUIRED', 900000, 3000)
  requireFact(completed.workflow.steps.every((step) => step.artifact && step.attemptId === step.artifact.attemptId) &&
    !completed.intake.issueApproval && !completed.effect, 'C10_EFFECT_FREE_DRAFT_BOUNDARY_REQUIRED')
  const attempts = (await ipc(evaluate, route('execution'), executionSelector)).attempts
  const generated = completed.workflow.steps.map((step) => attempts.find((item) => item.id === step.attemptId))
  requireFact(generated.every((item) => item && item.effectiveModels?.length && item.effectiveModels.every((model) =>
    model.support === 'validated' && model.supportEvidenceRef && model.wireModelAlias === configuration.gateway.alias)),
  'C10_ACTUAL_MODEL_PROVENANCE_REQUIRED')
  evidence.actualModels = generated.map((item) => ({ attemptId: item.id, taskId: item.taskId,
    memberId: item.memberId, effectiveModels: item.effectiveModels, usage: item.usage,
    outputSha256: digest(JSON.stringify(item.output)) }))
  evidence.workflowArtifacts = completed.workflow.steps.map((step) => ({ stepId: step.stepId,
    ...step.artifact, contentSha256: digest(JSON.stringify(step.artifact.content)) }))
  evidence.preview = await previewVisible(evaluate, signal, selector)
  requireFact(evidence.preview.preview.target === configuration.target && !evidence.preview.effect &&
    !evidence.preview.intake.issueApproval, 'C10_PREVIEW_MUST_NOT_PUBLISH')
  const expected = evidence.preview.intake.issueDraft
  await evaluate('setTimeout(()=>location.reload(),50);true')
  await delay(750, undefined, { signal })
  await selectIntake(evaluate, signal, selected.workspaceId, intake.id)
  const reopened = await previewVisible(evaluate, signal, selector)
  requireFact(same(reopened.intake.issueDraft, expected) && !reopened.effect && !reopened.intake.issueApproval,
    'C10_REOPEN_CHANGED_APPROVED_DRAFT_OR_POSTED')
  evidence.reopened = reopened
  evidence.checks.push('normal-packaged-customer-feedback-preset-deployed', 'real-team-classify-and-draft-inference',
    'exact-visible-marked-issue-preview-without-publication', 'renderer-reopen-preserves-draft-and-no-external-effect')
  evidence.status = 'pending-approval'
  evidence.previewComplete = true
  evidence.publishedFeatureComplete = false
  evidence.requiredAction = { code: 'C10_EXPLICIT_DRAFT_APPROVAL_REQUIRED', target: expected.target,
    artifactId: expected.artifactId, artifactDigest: expected.artifactDigest, payloadDigest: expected.payloadDigest,
    nextMode: 'publish', confirmationSurface: 'explicit --target --artifact-digest --payload-digest with --resume operation.json' }
}
