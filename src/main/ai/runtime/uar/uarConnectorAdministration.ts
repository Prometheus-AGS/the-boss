import { createHash, randomUUID } from 'node:crypto'
import * as z from 'zod'

import { readUarConnectorCredential, writeUarConnectorCredential } from '@main/services/prometheus/integrationConfig'
import {
  uarConnectorBindingSchema, uarConnectorEffectSchema,
  type UarConnectorBinding, type UarConnectorPrepareInput, type UarConnectorSaveInput, type UarConnectorSelector,
  type UarConnectorReconcileInput
} from '@shared/types/uarConnectors'

import { feedbackRequest, feedbackScope, type FeedbackScope } from './uarFeedbackBoundary'
import { dispatchUarConnector } from './uarConnectorTransport'
import { uarPrincipalForSession } from './uarPrincipal'

function credentialRef(scope: FeedbackScope, input: Pick<UarConnectorBinding, 'provider' | 'target' | 'site'>) {
  return `host://connector-${input.provider}-` + createHash('sha256')
    .update(JSON.stringify([scope.endpoint.instanceId, scope.workspaceId, input.provider, input.target, input.site ?? null]))
    .digest('hex')
}

async function bindings(scope: FeedbackScope) {
  return z.array(uarConnectorBindingSchema).parse(await feedbackRequest(scope, '/connector-bindings')).map((binding) => {
    if (binding.workspaceId !== scope.workspaceId) throw new Error('FEEDBACK_SCOPE_DENIED')
    return binding
  })
}

async function publicBinding(scope: FeedbackScope, binding: UarConnectorBinding) {
  const { credentialRef: ref, ...publicValue } = binding
  const managedByHost = ref === credentialRef(scope, binding)
  return { ...publicValue, managedByHost,
    credentialConfigured: managedByHost && Boolean(await readUarConnectorCredential(ref)) }
}

export async function readUarConnectors(workspaceId: string) {
  const scope = await feedbackScope(workspaceId)
  const [installed, rawEffects] = await Promise.all([bindings(scope), feedbackRequest(scope, '/connector-effects')])
  const effects = z.array(uarConnectorEffectSchema).parse(rawEffects)
  if (effects.some((effect) => effect.workspaceId !== scope.workspaceId)) throw new Error('FEEDBACK_SCOPE_DENIED')
  return { workspaceId: scope.workspaceId, effects,
    bindings: await Promise.all(installed.map((binding) => publicBinding(scope, binding))) }
}

export async function saveUarConnector(input: UarConnectorSaveInput) {
  const scope = await feedbackScope(input.workspaceId)
  const ref = credentialRef(scope, input)
  const installed = await bindings(scope)
  const previous = input.id ? installed.find((binding) => binding.id === input.id) : undefined
  if (input.id && (!previous || previous.credentialRef !== credentialRef(scope, previous))) {
    throw new Error('FEEDBACK_CREDENTIAL_SCOPE_DENIED')
  }
  const binding = uarConnectorBindingSchema.parse(await feedbackRequest(scope, '/connector-bindings', {
    commandId: randomUUID(), id: input.id ?? randomUUID(), expectedRevision: input.expectedRevision ?? null,
    provider: input.provider, approvalMode: input.approvalMode ?? 'explicit_customer',
    target: input.target, site: input.site ?? null, allowedActions: input.allowedActions,
    allowedEgressLabels: ['public', 'internal'], credentialRef: ref, revoked: input.revoked ?? false
  }))
  if (binding.workspaceId !== scope.workspaceId || binding.credentialRef !== ref) throw new Error('FEEDBACK_SCOPE_DENIED')
  if (input.credential) await writeUarConnectorCredential(ref, input.credential)
  return publicBinding(scope, binding)
}

export async function prepareUarConnector(input: UarConnectorPrepareInput) {
  const scope = await feedbackScope(input.workspaceId)
  const binding = (await bindings(scope)).find((candidate) => candidate.id === input.bindingId)
  if (!binding || binding.credentialRef !== credentialRef(scope, binding)) throw new Error('FEEDBACK_CREDENTIAL_SCOPE_DENIED')
  const credential = await readUarConnectorCredential(binding.credentialRef)
  if (credential && JSON.stringify(input.payload).includes(credential)) throw new Error('FEEDBACK_CREDENTIAL_IN_DRAFT')
  const effect = uarConnectorEffectSchema.parse(await feedbackRequest(scope, '/connector-effects', {
    commandId: randomUUID(), bindingId: input.bindingId, expectedBindingRevision: input.expectedBindingRevision,
    action: input.action, egressLabels: input.egressLabels, decisionRef: input.decisionRef ?? null, payload: input.payload
  }))
  if (effect.workspaceId !== scope.workspaceId || effect.bindingId !== binding.id || effect.ownerId !== binding.ownerId) {
    throw new Error('FEEDBACK_SCOPE_DENIED')
  }
  return effect
}

export async function controlUarConnector(input: UarConnectorSelector, action: 'dispatch' | 'cancel') {
  const scope = await feedbackScope(input.workspaceId)
  const effect = uarConnectorEffectSchema.parse(await feedbackRequest(scope,
    '/connector-effects/' + encodeURIComponent(input.effectId)))
  const binding = (await bindings(scope)).find((candidate) => candidate.id === effect.bindingId)
  if (effect.workspaceId !== scope.workspaceId || !binding || binding.ownerId !== effect.ownerId ||
    binding.credentialRef !== credentialRef(scope, binding)) throw new Error('FEEDBACK_SCOPE_DENIED')
  if (action === 'cancel') return uarConnectorEffectSchema.parse(await feedbackRequest(scope,
    '/connector-effects/' + encodeURIComponent(effect.id) + '/cancel', { commandId: randomUUID() }))
  await dispatchUarConnector(scope, binding, effect)
  return uarConnectorEffectSchema.parse(await feedbackRequest(scope, '/connector-effects/' + encodeURIComponent(effect.id)))
}

/** Explicit operator attestation of independently checked evidence; never an external retry. */
export async function reconcileUarConnector(input: UarConnectorReconcileInput) {
  const scope = await feedbackScope(input.workspaceId)
  const effect = uarConnectorEffectSchema.parse(await feedbackRequest(scope,
    '/connector-effects/' + encodeURIComponent(input.effectId)))
  const binding = (await bindings(scope)).find((candidate) => candidate.id === effect.bindingId)
  if (!input.independentlyChecked || !effect.dispatchId || !['dispatched', 'uncertain'].includes(effect.status) ||
    effect.payloadDigest !== input.expectedPayloadDigest || effect.workspaceId !== scope.workspaceId ||
    !binding || effect.ownerId !== binding.ownerId || binding.credentialRef !== credentialRef(scope, binding)) {
    throw new Error('FEEDBACK_CONNECTOR_RECONCILIATION_REQUIRED')
  }
  const credential = await readUarConnectorCredential(binding.credentialRef)
  if (credential && JSON.stringify(input).includes(credential)) throw new Error('FEEDBACK_CREDENTIAL_IN_DRAFT')
  return uarConnectorEffectSchema.parse(await feedbackRequest(scope,
    '/connector-effects/' + encodeURIComponent(effect.id) + '/reconcile', {
      commandId: randomUUID(), dispatchId: effect.dispatchId, disposition: input.disposition,
      externalId: input.externalId ?? null, result: null,
      evidenceRef: `operator-attestation:${uarPrincipalForSession('durable-administration')}:${input.evidenceRef}`
    }))
}
