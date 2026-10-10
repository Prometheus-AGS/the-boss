import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import { ipc } from '../reusable-team-operation/scenario.mjs'
import { digest, requireFact, same } from '../reusable-team-operation/io.mjs'
import { previewVisible, selectIntake } from './ui.mjs'

export async function resume(context, configuration, evidence) {
  const { evaluate, signal } = context
  const previous = configuration.previous
  const selector = previous.selector
  requireFact(selector?.workspaceId && selector.intakeId && previous.preview?.preview,
    'C10_ACTUAL_PREVIEW_RECEIPT_REQUIRED')
  const approved = previous.preview.preview
  requireFact(configuration.target === approved.target, 'C10_OPERATOR_TARGET_MISMATCH')
  evidence.selector = selector
  evidence.actualModels = previous.actualModels
  evidence.teamInstanceId = previous.teamInstanceId
  evidence.priorPreviewEvidenceSha256 = configuration.priorPreviewEvidenceSha256
  await selectIntake(evaluate, signal, selector.workspaceId, selector.intakeId)
  const read = () => ipc(evaluate, 'prometheus.uar.feedback.read', selector)
  let current = await read()
  requireFact(current.intake.issueDraft && current.intake.requestedTarget === configuration.target &&
    current.intake.issueDraft.artifactId === approved.artifactId &&
    current.intake.issueDraft.artifactDigest === approved.artifactDigest &&
    current.intake.issueDraft.payloadDigest === approved.payloadDigest &&
    current.intake.issueDraft.target === approved.target,
  'C10_PERSISTED_APPROVED_DRAFT_CHANGED')
  evidence.before = current
  if (configuration.mode === 'publish') {
    requireFact(configuration.artifactDigest === approved.artifactDigest &&
      configuration.payloadDigest === approved.payloadDigest, 'C10_EXPLICIT_APPROVAL_DIGEST_REQUIRED')
    requireFact(!current.effect || current.effect.status === 'prepared', 'C10_EXISTING_EFFECT_REQUIRES_RECONCILIATION')
    const shown = await previewVisible(evaluate, signal, selector)
    requireFact(same(shown.preview, approved), 'C10_CURRENT_PREVIEW_CHANGED')
    const credentialEnv = process.env.BOSS_C10_GITHUB_CREDENTIAL_ENV
    requireFact(/^[A-Za-z_][A-Za-z0-9_]*$/.test(credentialEnv ?? '') && process.env[credentialEnv]?.trim(),
      'C10_GITHUB_ENV_CREDENTIAL_REQUIRED')
    requireFact(!JSON.stringify(shown.preview).includes(process.env[credentialEnv]), 'C10_PREVIEW_CONTAINS_CREDENTIAL')
    await ipc(evaluate, 'prometheus.uar.feedback.credential', { workspaceId: selector.workspaceId,
      target: configuration.target, credential: { operation: 'set', value: process.env[credentialEnv] } })
    evidence.githubCredentialReference = credentialEnv
    evidence.explicitOperatorApproval = { target: configuration.target, artifactId: approved.artifactId,
      artifactDigest: configuration.artifactDigest, payloadDigest: configuration.payloadDigest,
      authority: 'separate-confirmed-publish-invocation', approvedAt: new Date().toISOString() }
    current = await ipc(evaluate, 'prometheus.uar.feedback.approve_publish', { ...selector,
      commandId: randomUUID(), expectedRevision: shown.intake.revision, artifactId: approved.artifactId,
      artifactDigest: configuration.artifactDigest, payloadDigest: configuration.payloadDigest, target: configuration.target })
    evidence.checks.push('explicit-approved-target-artifact-and-payload-through-real-work-ipc')
  } else if (configuration.mode === 'cancel') {
    requireFact(!current.effect || current.effect.status === 'prepared', 'C10_DISPATCHED_EFFECT_CANNOT_BE_CANCELLED')
    current = await ipc(evaluate, 'prometheus.uar.feedback.cancel', { ...selector,
      commandId: randomUUID(), expectedRevision: current.intake.revision })
    requireFact(current.intake.status === 'cancelled' && !current.intake.externalIssueId &&
      (!current.effect || current.effect.status === 'cancelled'), 'C10_CANCELLATION_MUST_NOT_PUBLISH')
    evidence.checks.push('durable-cancellation-before-publication')
  } else if (configuration.mode === 'reconcile') {
    const beforeDispatch = current.effect?.dispatchId
    const beforeEffect = current.effect?.id
    requireFact(beforeEffect && ['dispatched', 'uncertain', 'confirmed'].includes(current.effect.status),
      'C10_ACTUAL_UNKNOWN_OR_CONFIRMED_EFFECT_REQUIRED')
    current = await ipc(evaluate, 'prometheus.uar.feedback.reconcile', selector)
    requireFact(current.effect?.id === beforeEffect && current.effect?.dispatchId === beforeDispatch,
      'C10_RECONCILIATION_REDISPATCHED_EFFECT')
    evidence.checks.push('actual-host-reconciliation-retains-single-dispatch')
  } else {
    requireFact(configuration.mode === 'reopen', 'C10_OPERATION_MODE_REQUIRED')
    evidence.checks.push('retained-profile-draft-read-without-new-execution')
  }
  evidence.current = current
  const expected = { draft: current.intake.issueDraft, effectId: current.effect?.id,
    dispatchId: current.effect?.dispatchId, externalIssueId: current.intake.externalIssueId }
  await evaluate('setTimeout(()=>location.reload(),50);true')
  await delay(750, undefined, { signal })
  await selectIntake(evaluate, signal, selector.workspaceId, selector.intakeId)
  const reopened = await read()
  requireFact(same(reopened.intake.issueDraft, expected.draft) && reopened.effect?.id === expected.effectId &&
    reopened.effect?.dispatchId === expected.dispatchId && reopened.intake.externalIssueId === expected.externalIssueId,
  'C10_REOPEN_CHANGED_EFFECT_RECEIPT')
  const snapshot = await ipc(evaluate, 'prometheus.uar.feedback.snapshot', { workspaceId: selector.workspaceId })
  if (reopened.effect) requireFact(snapshot.effects.filter((item) =>
    item.decisionRef === reopened.intake.issueApproval?.id).length === 1, 'C10_DUPLICATE_EFFECT_INTENT')
  evidence.reopened = reopened
  evidence.currentReceiptSha256 = digest(JSON.stringify(reopened))
  evidence.checks.push('renderer-reopen-retains-draft-dispatch-and-outcome')
  if (reopened.effect?.status === 'confirmed') {
    requireFact(reopened.intake.externalIssueId === reopened.effect.receipt.externalId && reopened.issueUrl &&
      reopened.effect.target === approved.target && reopened.effect.payloadDigest === approved.payloadDigest &&
      reopened.intake.issueApproval?.authority === 'explicit-customer', 'C10_EXTERNAL_ISSUE_RECEIPT_MISMATCH')
    evidence.status = 'confirmed'
    evidence.publishedFeatureComplete = true
    evidence.checks.push('confirmed-real-github-issue-linked-to-approved-intake')
  } else if (['dispatched', 'uncertain'].includes(reopened.effect?.status)) {
    evidence.status = 'pending-reconciliation'
    evidence.requiredAction = { code: 'C10_GITHUB_OUTCOME_UNKNOWN', nextMode: 'reconcile',
      effectId: reopened.effect.id, dispatchId: reopened.effect.dispatchId }
  } else evidence.status = configuration.mode === 'cancel' ? 'cancelled' : 'pending-approval'
}
