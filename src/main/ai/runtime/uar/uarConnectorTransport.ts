import { randomUUID } from 'node:crypto'
import * as z from 'zod'

import { readUarConnectorCredential } from '@main/services/prometheus/integrationConfig'
import type { UarConnectorBinding, UarConnectorEffect } from '@shared/types/uarConnectors'

import { feedbackRequest, type FeedbackScope } from './uarFeedbackBoundary'

const planSchema = z.object({ effectId: z.string(), dispatchId: z.string(), provider: z.string(),
  credentialRef: z.string(), origin: z.string(), method: z.enum(['GET', 'POST', 'PATCH', 'LOCAL']),
  path: z.string(), body: z.unknown().nullable(), headers: z.record(z.string(), z.string()) })
type Plan = z.infer<typeof planSchema>

function admittedPlan(binding: UarConnectorBinding, effect: UarConnectorEffect, plan: Plan): boolean {
  if (plan.effectId !== effect.id || plan.provider !== binding.provider || plan.credentialRef !== binding.credentialRef) return false
  const origins = { github: 'https://api.github.com', notion: 'https://api.notion.com', slack: 'https://slack.com',
    jira: binding.site }
  if (plan.origin !== origins[binding.provider]) return false
  if (effect.action === 'draft') return plan.method === 'LOCAL' && plan.path === ''
  const target = binding.target
  switch (binding.provider) {
    case 'github':
      return effect.action === 'read'
        ? plan.method === 'GET' && new RegExp(`^/repos/${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/[1-9][0-9]*$`).test(plan.path)
        : effect.action === 'publish' && plan.method === 'POST' && plan.path === `/repos/${target}/issues`
    case 'notion':
      return (effect.action === 'read' && plan.method === 'GET' && plan.path === `/v1/pages/${target}`) ||
        (effect.action === 'write' && plan.method === 'PATCH' && plan.path === `/v1/pages/${target}`) ||
        (effect.action === 'publish' && plan.method === 'POST' && plan.path === '/v1/pages')
    case 'slack':
      return (effect.action === 'read' && plan.method === 'GET' && plan.path === `/api/conversations.history?channel=${target}`) ||
        (effect.action === 'send' && plan.method === 'POST' && plan.path === '/api/chat.postMessage')
    case 'jira': {
      const site = new URL(plan.origin)
      if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) return false
      return (effect.action === 'read' && plan.method === 'GET' && plan.path.startsWith(`/rest/api/3/issue/${target}-`) &&
        /^[a-zA-Z0-9_.-]+$/.test(plan.path.slice('/rest/api/3/issue/'.length))) ||
        (effect.action === 'write' && plan.method === 'POST' && plan.path === '/rest/api/3/issue')
    }
  }
}

async function boundedResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65_536) throw new Error('FEEDBACK_CONNECTOR_RESULT_TOO_LARGE')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

function externalId(provider: UarConnectorBinding['provider'], value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const id = provider === 'github' ? data.number : provider === 'slack' ? data.ts : provider === 'jira' ? data.key : data.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

/** The native durable lease owns idempotency; this transport never retries an external write. */
export async function dispatchUarConnector(scope: FeedbackScope, binding: UarConnectorBinding, effect: UarConnectorEffect) {
  if (effect.status !== 'prepared' || binding.revoked || binding.revision !== effect.bindingRevision) {
    throw new Error('FEEDBACK_CONNECTOR_AUTHORITY_CHANGED')
  }
  const token = await readUarConnectorCredential(binding.credentialRef)
  if (!token && effect.action !== 'draft') throw new Error('FEEDBACK_CONNECTOR_CREDENTIAL_REQUIRED')
  const plan = planSchema.parse(await feedbackRequest(scope, '/connector-effects/' + encodeURIComponent(effect.id) + '/dispatch',
    { credentialRef: binding.credentialRef }))
  let disposition = 'uncertain'
  let id: string | null = null
  let evidenceRef = 'connector-response-unavailable'
  let result: unknown = null
  try {
    if (!admittedPlan(binding, effect, plan)) {
      disposition = 'rejected'
      evidenceRef = 'host-request-plan-denied'
    } else if (plan.method === 'LOCAL') {
      disposition = 'confirmed'
      id = 'draft:' + effect.id
      evidenceRef = 'uar-durable-local-draft'
    } else {
      const response = await fetch(plan.origin + plan.path, { method: plan.method, redirect: 'manual',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          ...(binding.provider === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'The-Boss-Connectors' } : {}),
          ...(binding.provider === 'notion' ? { 'Notion-Version': '2026-03-11' } : {}) },
        ...(plan.body !== null ? { body: JSON.stringify(plan.body) } : {}) })
      evidenceRef = `${binding.provider}-http-${response.status}`
      if (response.ok) {
        const value = await boundedResponse(response)
        const slackRejected = binding.provider === 'slack' && (!value || typeof value !== 'object' ||
          (value as Record<string, unknown>).ok !== true)
        if (slackRejected) disposition = 'rejected'
        else if (!token || !JSON.stringify(value).includes(token)) {
          id = effect.action === 'read' ? 'read:' + effect.id : externalId(binding.provider, value)
          if (id) { disposition = 'confirmed'; result = effect.action === 'read' ? value : null }
        }
      } else if ([400, 401, 403, 404, 410, 415, 422, 429].includes(response.status)) disposition = 'rejected'
    }
  } catch {
    // A lost or malformed response never permits replay of a write.
  }
  await feedbackRequest(scope, '/connector-effects/' + encodeURIComponent(effect.id) + '/outcome', {
    commandId: randomUUID(), dispatchId: plan.dispatchId, disposition, externalId: id, evidenceRef, result
  })
}
