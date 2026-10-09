import { createHash } from 'node:crypto'
import * as z from 'zod'

import { application } from '@application'
import { uarFeedbackIntakeSchema, uarFeedbackTargetSchema, type UarFeedbackIntake } from '@shared/types/uarFeedback'

import { workspace } from './UarDurableAdministrationAdapter'
import { uarPrincipalForSession } from './uarPrincipal'
import type { UarSidecarEndpoint } from './UarSidecarService'

export const feedbackBase = '/api/v1/collaboration'
export const feedbackBindingSchema = z.object({
  id: z.string(), ownerId: z.string(), workspaceId: z.string(), revision: z.number().int().nonnegative(),
  provider: z.literal('github'), target: uarFeedbackTargetSchema, credentialRef: z.string(), revoked: z.boolean(),
  allowedActions: z.array(z.string()), allowedEgressLabels: z.array(z.string())
})
export type FeedbackBinding = z.infer<typeof feedbackBindingSchema>
export type FeedbackScope = { workspaceId: string; endpoint: UarSidecarEndpoint }

export async function feedbackScope(workspaceId: string): Promise<FeedbackScope> {
  const resolved = workspace(workspaceId)
  const endpoint = await application.get('UarSidecarService').resolveSelected()
  return { workspaceId: resolved, endpoint }
}

export function feedbackCredentialRef(scope: FeedbackScope, target: string): string {
  return 'host://feedback-github-' + createHash('sha256')
    .update(JSON.stringify([scope.endpoint.instanceId, scope.workspaceId, target])).digest('hex')
}

export function feedbackPayloadDigest(issue: { title: string; body: string }): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify({ body: issue.body, title: issue.title })).digest('hex')
}

export async function feedbackRequest(scope: FeedbackScope, pathname: string, payload?: object): Promise<unknown> {
  const response = await application.get('UarSidecarService').requestInstance(
    scope.endpoint, feedbackBase + pathname, uarPrincipalForSession('durable-administration'), {
      method: payload ? 'POST' : 'GET',
      headers: { 'x-uar-workspace-id': scope.workspaceId, ...(payload ? { 'content-type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    }
  )
  if (!response.ok) throw new Error(`FEEDBACK_RUNTIME_REQUEST_FAILED_HTTP_${response.status}`)
  return response.json()
}

export function feedbackIntake(value: unknown, scope: FeedbackScope, id?: string): UarFeedbackIntake {
  const intake = uarFeedbackIntakeSchema.parse(value)
  if (intake.workspaceId !== scope.workspaceId || (id !== undefined && intake.id !== id)) {
    throw new Error('FEEDBACK_SCOPE_DENIED')
  }
  return intake
}

export async function feedbackBindings(scope: FeedbackScope): Promise<FeedbackBinding[]> {
  const values = z.array(z.unknown()).parse(await feedbackRequest(scope, '/connector-bindings'))
  return values.filter((value) => z.object({ provider: z.literal('github') }).safeParse(value).success).map((value) => {
    const binding = feedbackBindingSchema.parse(value)
    if (binding.workspaceId !== scope.workspaceId) throw new Error('FEEDBACK_SCOPE_DENIED')
    return binding
  })
}

export async function feedbackBinding(scope: FeedbackScope, target: string): Promise<FeedbackBinding> {
  const credentialRef = feedbackCredentialRef(scope, target)
  const existing = (await feedbackBindings(scope)).find((binding) => binding.credentialRef === credentialRef)
  if (existing) {
    if (existing.revoked || existing.target !== target || !existing.allowedActions.includes('publish') ||
      !existing.allowedEgressLabels.includes('public')) throw new Error('FEEDBACK_CONNECTOR_AUTHORITY_CHANGED')
    return existing
  }
  const binding = feedbackBindingSchema.parse(await feedbackRequest(scope, '/connector-bindings', {
    commandId: credentialRef.slice('host://'.length), id: credentialRef.slice('host://'.length),
    expectedRevision: null, provider: 'github', target, site: null,
    allowedActions: ['publish'], allowedEgressLabels: ['public'], credentialRef, revoked: false
  }))
  if (binding.workspaceId !== scope.workspaceId || binding.credentialRef !== credentialRef || binding.target !== target) {
    throw new Error('FEEDBACK_SCOPE_DENIED')
  }
  return binding
}
