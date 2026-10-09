import { randomUUID } from 'node:crypto'
import * as z from 'zod'

import { readUarConnectorCredential } from '@main/services/prometheus/integrationConfig'
import { uarConnectorBindingSchema } from '@shared/types/uarConnectors'
import {
  uarFeedbackPolicySchema, type UarFeedbackPolicySaveInput, type UarFeedbackPolicyAuthorizeInput,
  type UarFeedbackReviewInput, type UarFeedbackImplementationInput
} from '@shared/types/uarFeedbackPolicy'

import { feedbackRequest, feedbackScope } from './uarFeedbackBoundary'
import { previewUarFeedback, readUarFeedback } from './uarFeedbackAdministration'

export async function readUarFeedbackPolicies(workspaceId: string) {
  const scope = await feedbackScope(workspaceId)
  const policies = z.array(uarFeedbackPolicySchema).parse(await feedbackRequest(scope, '/feedback-policies'))
  if (policies.some((policy) => policy.workspaceId !== scope.workspaceId)) throw new Error('FEEDBACK_SCOPE_DENIED')
  return policies
}

export async function saveUarFeedbackPolicy(input: UarFeedbackPolicySaveInput) {
  const scope = await feedbackScope(input.workspaceId)
  const { workspaceId: _workspaceId, ...value } = input
  void _workspaceId
  const policy = uarFeedbackPolicySchema.parse(await feedbackRequest(scope, '/feedback-policies', {
    ...value, id: input.id ?? randomUUID(), expectedRevision: input.expectedRevision ?? null, commandId: randomUUID()
  }))
  if (policy.workspaceId !== scope.workspaceId) throw new Error('FEEDBACK_SCOPE_DENIED')
  return policy
}

/** Authorizes and prepares a draft; sending remains a separate explicit connector action. */
export async function authorizeUarFeedbackPolicy(input: UarFeedbackPolicyAuthorizeInput) {
  const scope = await feedbackScope(input.workspaceId)
  const policy = (await readUarFeedbackPolicies(scope.workspaceId)).find((candidate) => candidate.id === input.policyId)
  if (!policy || !policy.enabled || policy.revision !== input.expectedPolicyRevision) throw new Error('FEEDBACK_REVISION_CHANGED')
  const bindings = z.array(uarConnectorBindingSchema).parse(await feedbackRequest(scope, '/connector-bindings'))
  const binding = bindings.find((candidate) => candidate.id === policy.connectorBindingId)
  if (!binding || binding.provider !== 'github' || binding.approvalMode !== 'standing_policy' ||
    binding.ownerId !== policy.ownerId || binding.workspaceId !== scope.workspaceId) throw new Error('FEEDBACK_SCOPE_DENIED')
  const state = await previewUarFeedback(input, { ...binding, provider: 'github' })
  const draft = state.intake.issueDraft
  if (!draft || draft.connectorBindingId !== binding.id || state.intake.duplicateOf) throw new Error('FEEDBACK_APPROVAL_MISMATCH')
  const credential = await readUarConnectorCredential(binding.credentialRef)
  if (credential && JSON.stringify(draft.sanitizedIssue).includes(credential)) throw new Error('FEEDBACK_CREDENTIAL_IN_DRAFT')
  if (!state.intake.issueApproval) await feedbackRequest(scope,
    '/feedback-intakes/' + encodeURIComponent(input.intakeId) + '/issue-approval', {
      commandId: randomUUID(), expectedRevision: state.intake.revision, policyId: policy.id,
      expectedPolicyRevision: policy.revision, sanitizedIssue: draft.sanitizedIssue, sanitizationRef: draft.sanitizationRef
    })
  const authorized = await readUarFeedback(input)
  const approval = authorized.intake.issueApproval
  if (!approval || approval.authority !== 'standing-policy') throw new Error('FEEDBACK_APPROVAL_MISMATCH')
  if (!authorized.intake.connectorEffectId) await feedbackRequest(scope, '/connector-effects', {
    commandId: 'publish-' + approval.id, bindingId: binding.id, expectedBindingRevision: binding.revision,
    action: 'publish', egressLabels: [draft.egressLabel], decisionRef: approval.id, payload: draft.sanitizedIssue
  })
  return readUarFeedback(input)
}

export async function attachUarFeedbackReview(input: UarFeedbackReviewInput) {
  const scope = await feedbackScope(input.workspaceId)
  const { workspaceId: _workspaceId, intakeId, ...payload } = input
  void _workspaceId
  await feedbackRequest(scope, '/feedback-intakes/' + encodeURIComponent(intakeId) + '/review', payload)
  return readUarFeedback(input)
}

export async function admitUarFeedbackImplementation(input: UarFeedbackImplementationInput) {
  const scope = await feedbackScope(input.workspaceId)
  const { workspaceId: _workspaceId, intakeId, ...payload } = input
  void _workspaceId
  await feedbackRequest(scope, '/feedback-intakes/' + encodeURIComponent(intakeId) + '/implementation', payload)
  return readUarFeedback(input)
}
