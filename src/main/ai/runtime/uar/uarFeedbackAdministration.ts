import { randomUUID } from 'node:crypto'
import * as z from 'zod'

import { application } from '@application'
import { readFeedbackGithubCredential, readUarConnectorCredential, writeFeedbackGithubCredential } from '@main/services/prometheus/integrationConfig'
import {
  uarFeedbackEffectSchema, uarFeedbackIssueSchema,
  type UarFeedbackApprovalInput, type UarFeedbackRetryApprovalInput, type UarFeedbackControlInput, type UarFeedbackCredentialInput,
  type UarFeedbackDetail, type UarFeedbackIntake, type UarFeedbackSelector, type UarFeedbackStartInput
} from '@shared/types/uarFeedback'
import { uarWorkflowRunSchema } from '@shared/types/uarWorkflows'

import {
  feedbackBinding, feedbackBindings, feedbackCredentialRef, feedbackIntake, feedbackPayloadDigest,
  feedbackRequest, feedbackScope, type FeedbackBinding, type FeedbackScope
} from './uarFeedbackBoundary'
import { publishFeedbackIssue, reconcileFeedbackIssue } from './uarFeedbackGithub'
import { scopedTeam } from './UarTeamsAdministrationAdapter'

const intakePath = (id: string) => '/feedback-intakes/' + encodeURIComponent(id)

async function detail(scope: FeedbackScope, intake: UarFeedbackIntake): Promise<UarFeedbackDetail> {
  const workflow = intake.workflowRunId ? uarWorkflowRunSchema.parse(await feedbackRequest(
    scope, '/workflow-runs/' + encodeURIComponent(intake.workflowRunId)
  )) : null
  if (workflow && (workflow.workspaceId !== scope.workspaceId || workflow.ownerId !== intake.ownerId ||
    workflow.id !== intake.workflowRunId)) throw new Error('FEEDBACK_WORKFLOW_SCOPE_DENIED')
  const effect = intake.connectorEffectId ? uarFeedbackEffectSchema.parse(await feedbackRequest(
    scope, '/connector-effects/' + encodeURIComponent(intake.connectorEffectId)
  )) : null
  if (effect && (!intake.issueDraft || effect.id !== intake.connectorEffectId || effect.target !== intake.issueDraft.target ||
    effect.bindingId !== intake.issueDraft.connectorBindingId || effect.decisionRef !== intake.issueApproval?.id ||
    effect.payloadDigest !== intake.issueDraft.payloadDigest)) throw new Error('FEEDBACK_EFFECT_SCOPE_DENIED')
  const number = effect?.receipt?.externalId
  const issueUrl = effect?.status === 'confirmed' && number && /^[1-9][0-9]*$/.test(number)
    ? `https://github.com/${effect.target}/issues/${number}` : null
  return { intake, workflow, effect, issueUrl }
}

async function getIntake(scope: FeedbackScope, id: string) {
  return feedbackIntake(await feedbackRequest(scope, intakePath(id)), scope, id)
}

export async function readUarFeedback(input: UarFeedbackSelector): Promise<UarFeedbackDetail> {
  const scope = await feedbackScope(input.workspaceId)
  return detail(scope, await getIntake(scope, input.intakeId))
}

export async function readUarFeedbackSnapshot(workspaceId: string) {
  const scope = await feedbackScope(workspaceId)
  const [rawIntakes, bindings] = await Promise.all([
    feedbackRequest(scope, '/feedback-intakes'), feedbackBindings(scope)
  ])
  const intakes = z.array(z.unknown()).parse(rawIntakes).map((value) => feedbackIntake(value, scope))
  const details = await Promise.all(intakes.filter((intake) => intake.connectorEffectId).map((intake) => detail(scope, intake)))
  return {
    workspaceId: scope.workspaceId, intakes, effects: details.flatMap((item) => item.effect ? [item.effect] : []),
    bindings: await Promise.all(bindings.filter((binding) => binding.credentialRef === feedbackCredentialRef(scope, binding.target))
      .map(async (binding) => ({ id: binding.id, revision: binding.revision, target: binding.target,
        credentialConfigured: Boolean(await readFeedbackGithubCredential(binding.credentialRef)) })))
  }
}

export async function configureUarFeedbackCredential(input: UarFeedbackCredentialInput) {
  const scope = await feedbackScope(input.workspaceId)
  await writeFeedbackGithubCredential(feedbackCredentialRef(scope, input.target), input.credential)
  await feedbackBinding(scope, input.target)
  return { configured: input.credential.operation === 'set' }
}

export async function startUarFeedback(input: UarFeedbackStartInput): Promise<UarFeedbackDetail> {
  const scope = await feedbackScope(input.workspaceId)
  await feedbackBinding(scope, input.target)
  let intake = feedbackIntake(await feedbackRequest(scope, '/feedback-intakes', {
    commandId: input.commandId, source: 'direct', sourceEventId: input.sourceEventId,
    feedback: input.input.feedback, target: input.target
  }), scope)
  if (intake.requestedTarget !== input.target) throw new Error('FEEDBACK_TARGET_CHANGED')
  if (intake.workflowRunId) return detail(scope, intake)
  const team = scopedTeam(await feedbackRequest(scope, '/team-instances/' + encodeURIComponent(input.teamId)), scope.workspaceId)
  if (team.id !== input.teamId || team.ownerId !== intake.ownerId) throw new Error('FEEDBACK_WORKFLOW_SCOPE_DENIED')
  await application.get('UarTeamHostService').ensure(team, scope.endpoint.generation)
  const { workspaceId: _workspaceId, target: _target, sourceEventId: _sourceEventId, ...workflowInput } = input
  void _workspaceId; void _target; void _sourceEventId
  const run = uarWorkflowRunSchema.parse(await feedbackRequest(scope, '/workflow-runs', workflowInput))
  if (run.workspaceId !== scope.workspaceId || run.teamId !== team.id || run.ownerId !== intake.ownerId) {
    throw new Error('FEEDBACK_WORKFLOW_SCOPE_DENIED')
  }
  intake = feedbackIntake(await feedbackRequest(scope, intakePath(intake.id) + '/workflow', {
    commandId: input.commandId, expectedRevision: intake.revision, workflowRunId: run.id
  }), scope, intake.id)
  return detail(scope, intake)
}

export async function previewUarFeedback(input: UarFeedbackSelector, selectedBinding?: FeedbackBinding) {
  const scope = await feedbackScope(input.workspaceId)
  let intake = await getIntake(scope, input.intakeId)
  let state = await detail(scope, intake)
  if (!intake.issueDraft && !intake.duplicateOf && state.workflow &&
    ['awaiting_decision', 'accepted'].includes(state.workflow.status) && intake.status === 'classifying') {
    intake = feedbackIntake(await feedbackRequest(scope, intakePath(intake.id) + '/finalize', {
      expectedRevision: intake.revision
    }), scope, intake.id)
  }
  if (!intake.issueDraft && !intake.duplicateOf && intake.status === 'drafted') {
    const run = state.workflow
    const artifact = run?.steps.find((step) => step.stepId === 'draft')?.artifact
    if (!artifact || !run || !['awaiting_decision', 'accepted'].includes(run.status) ||
      (run.wait && (run.wait.artifactId !== artifact.id || run.wait.artifactDigest !== artifact.digest)) ||
      !intake.requestedTarget) throw new Error('FEEDBACK_DRAFT_ARTIFACT_MISMATCH')
    const issue = uarFeedbackIssueSchema.parse(artifact.content)
    const binding = selectedBinding ?? await feedbackBinding(scope, intake.requestedTarget)
    if (binding.target !== intake.requestedTarget || binding.workspaceId !== scope.workspaceId) throw new Error('FEEDBACK_SCOPE_DENIED')
    if (binding.ownerId !== intake.ownerId) throw new Error('FEEDBACK_SCOPE_DENIED')
    const token = selectedBinding ? await readUarConnectorCredential(binding.credentialRef)
      : await readFeedbackGithubCredential(binding.credentialRef)
    if (token && JSON.stringify(issue).includes(token)) throw new Error('FEEDBACK_CREDENTIAL_IN_DRAFT')
    intake = feedbackIntake(await feedbackRequest(scope, intakePath(intake.id) + '/issue-draft', {
      commandId: 'draft-' + intake.id, expectedRevision: intake.revision, connectorBindingId: binding.id,
      expectedBindingRevision: binding.revision, sanitizedIssue: issue,
      sanitizationRef: 'boss-feedback-' + intake.id, egressLabel: 'public'
    }), scope, intake.id)
  }
  state = await detail(scope, intake)
  const draft = intake.issueDraft
  if (draft && feedbackPayloadDigest(draft.sanitizedIssue) !== draft.payloadDigest) throw new Error('FEEDBACK_PAYLOAD_MISMATCH')
  return { ...state, preview: draft ? {
    target: draft.target, artifactId: draft.artifactId, artifactDigest: draft.artifactDigest,
    payloadDigest: draft.payloadDigest, ...draft.sanitizedIssue, action: 'publish' as const,
    bindingId: draft.connectorBindingId, bindingRevision: draft.connectorBindingRevision
  } : null }
}

export async function approvePublishUarFeedback(input: UarFeedbackApprovalInput): Promise<UarFeedbackDetail> {
  return approveFeedbackIssue(input)
}

export async function retryPublishUarFeedback(input: UarFeedbackRetryApprovalInput): Promise<UarFeedbackDetail> {
  return approveFeedbackIssue(input, input)
}

async function approveFeedbackIssue(
  input: UarFeedbackApprovalInput, retry?: UarFeedbackRetryApprovalInput
): Promise<UarFeedbackDetail> {
  const scope = await feedbackScope(input.workspaceId)
  let intake = await getIntake(scope, input.intakeId)
  const draft = intake.issueDraft
  if (!draft || intake.duplicateOf || draft.artifactId !== input.artifactId || draft.artifactDigest !== input.artifactDigest ||
    draft.payloadDigest !== input.payloadDigest || draft.target !== input.target ||
    feedbackPayloadDigest(draft.sanitizedIssue) !== input.payloadDigest) throw new Error('FEEDBACK_APPROVAL_MISMATCH')
  const binding = (await feedbackBindings(scope)).find((item) => item.id === draft.connectorBindingId)
  if (!binding || binding.ownerId !== intake.ownerId || binding.revoked || binding.revision !== draft.connectorBindingRevision ||
    binding.credentialRef !== feedbackCredentialRef(scope, draft.target)) throw new Error('FEEDBACK_CONNECTOR_AUTHORITY_CHANGED')
  const token = await readFeedbackGithubCredential(binding.credentialRef)
  if (!token) throw new Error('FEEDBACK_GITHUB_CREDENTIAL_REQUIRED')
  if (JSON.stringify(draft.sanitizedIssue).includes(token)) throw new Error('FEEDBACK_CREDENTIAL_IN_DRAFT')
  if (retry) {
    intake = feedbackIntake(await feedbackRequest(scope, intakePath(intake.id) + '/retry-issue-approval', {
      commandId: input.commandId, expectedRevision: input.expectedRevision,
      expectedEffectId: retry.expectedEffectId, expectedDispatchId: retry.expectedDispatchId,
      connectorBindingId: binding.id, expectedBindingRevision: binding.revision,
      target: draft.target, artifactId: draft.artifactId, artifactDigest: draft.artifactDigest,
      payloadDigest: draft.payloadDigest, sanitizedIssue: draft.sanitizedIssue,
      sanitizationRef: draft.sanitizationRef, egressLabel: draft.egressLabel
    }), scope, intake.id)
  }
  if (!intake.issueApproval) {
    if (intake.revision !== input.expectedRevision) throw new Error('FEEDBACK_REVISION_CHANGED')
    intake = feedbackIntake(await feedbackRequest(scope, intakePath(intake.id) + '/explicit-issue-approval', {
      commandId: input.commandId, expectedRevision: input.expectedRevision,
      connectorBindingId: binding.id, expectedBindingRevision: binding.revision,
      target: draft.target, artifactId: draft.artifactId, artifactDigest: draft.artifactDigest,
      payloadDigest: draft.payloadDigest, sanitizedIssue: draft.sanitizedIssue,
      sanitizationRef: draft.sanitizationRef, egressLabel: draft.egressLabel
    }), scope, intake.id)
  }
  const approval = intake.issueApproval
  if (!approval || approval.authority !== 'explicit-customer' || approval.target !== draft.target ||
    approval.action !== 'publish' || approval.artifactId !== draft.artifactId || approval.artifactDigest !== draft.artifactDigest ||
    approval.sanitizedPayloadDigest !== draft.payloadDigest || approval.connectorBindingId !== binding.id ||
    approval.connectorBindingRevision !== binding.revision) throw new Error('FEEDBACK_APPROVAL_MISMATCH')
  const workflowState = await detail(scope, intake)
  const run = workflowState.workflow
  if (run?.status === 'awaiting_decision') {
    if (!run.wait || run.wait.artifactId !== draft.artifactId || run.wait.artifactDigest !== draft.artifactDigest) {
      throw new Error('FEEDBACK_DRAFT_ARTIFACT_MISMATCH')
    }
    await feedbackRequest(scope, '/workflow-runs/' + encodeURIComponent(run.id) + '/decide', {
      commandId: 'accept-' + approval.id, expectedRunRevision: run.revision, waitId: run.wait.id, decision: 'accept',
      artifactId: draft.artifactId, artifactDigest: draft.artifactDigest
    })
  }
  if (!intake.connectorEffectId) {
    await feedbackRequest(scope, '/connector-effects', {
      commandId: 'publish-' + approval.id, bindingId: binding.id, expectedBindingRevision: binding.revision,
      action: 'publish', egressLabels: [draft.egressLabel], decisionRef: approval.id, payload: draft.sanitizedIssue
    })
    intake = await getIntake(scope, intake.id)
  }
  const state = await detail(scope, intake)
  if (state.effect?.status === 'prepared') await publishFeedbackIssue(scope, state, binding, token)
  return detail(scope, await getIntake(scope, intake.id))
}

export async function controlUarFeedback(input: UarFeedbackControlInput, action: 'reject' | 'cancel') {
  const scope = await feedbackScope(input.workspaceId)
  const intake = await getIntake(scope, input.intakeId)
  if (intake.revision !== input.expectedRevision) throw new Error('FEEDBACK_REVISION_CHANGED')
  const state = await detail(scope, intake)
  if (state.effect) {
    if (state.effect.status !== 'prepared' && state.effect.status !== 'cancelled') throw new Error('FEEDBACK_ALREADY_DISPATCHED')
    if (state.effect.status === 'prepared') await feedbackRequest(scope,
      '/connector-effects/' + encodeURIComponent(state.effect.id) + '/cancel', { commandId: input.commandId })
  }
  const run = state.workflow
  if (run && ['ready', 'running', 'awaiting_decision'].includes(run.status)) {
    if (action === 'reject' && run.wait) {
      await feedbackRequest(scope, '/workflow-runs/' + encodeURIComponent(run.id) + '/decide', {
        commandId: input.commandId, expectedRunRevision: run.revision, waitId: run.wait.id, decision: 'reject',
        artifactId: run.wait.artifactId, artifactDigest: run.wait.artifactDigest
      })
    } else {
      await feedbackRequest(scope, '/workflow-runs/' + encodeURIComponent(run.id) + '/cancel', {
        commandId: input.commandId, expectedRunRevision: run.revision, reason: 'Customer cancelled feedback publication'
      })
    }
  }
  const updated = feedbackIntake(await feedbackRequest(scope, intakePath(intake.id) + '/decision', {
    commandId: input.commandId, expectedRevision: intake.revision, decision: action
  }), scope, intake.id)
  return detail(scope, updated)
}

export async function reconcileUarFeedback(input: UarFeedbackSelector): Promise<UarFeedbackDetail> {
  const scope = await feedbackScope(input.workspaceId)
  const state = await detail(scope, await getIntake(scope, input.intakeId))
  if (!state.effect || !['dispatched', 'uncertain'].includes(state.effect.status)) return state
  const draft = state.intake.issueDraft
  const binding = (await feedbackBindings(scope)).find((item) => item.id === draft?.connectorBindingId)
  if (!draft || !binding || binding.revoked || binding.ownerId !== state.intake.ownerId ||
    binding.credentialRef !== feedbackCredentialRef(scope, draft.target) || binding.target !== draft.target ||
    binding.revision !== draft.connectorBindingRevision) throw new Error('FEEDBACK_CONNECTOR_AUTHORITY_CHANGED')
  const token = await readFeedbackGithubCredential(binding.credentialRef)
  if (!token) throw new Error('FEEDBACK_GITHUB_CREDENTIAL_REQUIRED')
  await reconcileFeedbackIssue(scope, state, token, randomUUID())
  return detail(scope, await getIntake(scope, state.intake.id))
}
