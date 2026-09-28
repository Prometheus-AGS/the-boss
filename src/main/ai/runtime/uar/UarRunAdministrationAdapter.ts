import { application } from '@application'
import type { UarRunDetailSnapshot, UarRunInspection } from '@shared/types/prometheusIntegration'

import {
  attributedOwnerSessionId,
  body,
  ownerRequest,
  owners,
  projectRun,
  rawCheckpointResponse,
  rawRun
} from './UarOperationalAdministrationAdapter'
import type { UarSidecarEndpoint } from './UarSidecarService'

async function resolveRun(
  endpoint: UarSidecarEndpoint,
  runId: string
): Promise<{ requestSessionId: string; run: UarRunInspection }> {
  const availableOwners = owners()
  const requestOwner = availableOwners[0]
  if (!requestOwner) throw new Error('No UAR conversation is available for the shared installation owner')
  const response = await ownerRequest(
    endpoint,
    requestOwner.sessionId,
    `/api/uar/runs/${encodeURIComponent(runId)}`,
    {}
  )
  if (response.status === 404) throw new Error('The selected run is no longer available to the UAR installation owner')
  const raw = rawRun.parse(await body(response, 'Run detail'))
  return {
    requestSessionId: requestOwner.sessionId,
    run: projectRun(raw, attributedOwnerSessionId(raw, availableOwners))
  }
}

export async function readUarRunDetail(runId: string): Promise<UarRunDetailSnapshot> {
  const endpoint = await application.get('UarSidecarService').resolveSelected()
  const resolved = await resolveRun(endpoint, runId)
  const checkpoints = rawCheckpointResponse.parse(
    await body(
      await ownerRequest(
        endpoint,
        resolved.requestSessionId,
        `/api/uar/runs/${encodeURIComponent(runId)}/checkpoints`,
        {}
      ),
      'Run checkpoints'
    )
  )
  const sessionId = resolved.run.conversationId
  const inspect = async (path: string) => {
    if (!sessionId) return undefined
    const response = await ownerRequest(endpoint, resolved.requestSessionId, path)
    if (response.status === 404) return undefined
    return body(response, 'Run context')
  }
  const [agentConfig, effectiveConfig, contextStats, promptCaching, conversationPolicy] = await Promise.all([
    inspect(`/api/uar/sessions/${encodeURIComponent(sessionId ?? '')}/agent-config`),
    inspect(`/api/uar/sessions/${encodeURIComponent(sessionId ?? '')}/effective-config`),
    inspect(`/api/uar/sessions/${encodeURIComponent(sessionId ?? '')}/context-stats`),
    inspect(`/api/uar/sessions/${encodeURIComponent(sessionId ?? '')}/prompt-caching`),
    inspect(`/api/uar/conversations/${encodeURIComponent(sessionId ?? '')}/policy`)
  ])
  return {
    schemaVersion: 1,
    generation: endpoint.generation,
    run: resolved.run,
    checkpoints: checkpoints.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      nodeId: checkpoint.node_id,
      iteration: checkpoint.iteration,
      createdAt: checkpoint.created_at,
      completeness: checkpoint.protection?.completeness ?? 'incomplete_legacy'
    })),
    context: {
      ...(agentConfig !== undefined ? { agentConfig } : {}),
      ...(effectiveConfig !== undefined ? { effectiveConfig } : {}),
      ...(contextStats !== undefined ? { contextStats } : {}),
      ...(promptCaching !== undefined ? { promptCaching } : {}),
      ...(conversationPolicy !== undefined ? { conversationPolicy } : {})
    }
  }
}

export async function cancelUarRun(runId: string): Promise<UarRunDetailSnapshot> {
  const endpoint = await application.get('UarSidecarService').resolveSelected()
  const resolved = await resolveRun(endpoint, runId)
  await body(
    await ownerRequest(endpoint, resolved.requestSessionId, `/api/uar/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST'
    }),
    'Run cancellation'
  )
  return readUarRunDetail(runId)
}

export async function saveUarConversationPolicy(
  runId: string,
  policy?: Record<string, unknown>
): Promise<UarRunDetailSnapshot> {
  const endpoint = await application.get('UarSidecarService').resolveSelected()
  const resolved = await resolveRun(endpoint, runId)
  const conversationId = resolved.run.conversationId
  if (!conversationId) throw new Error('The selected run has no conversation policy scope')
  await body(
    await ownerRequest(
      endpoint,
      resolved.requestSessionId,
      `/api/uar/conversations/${encodeURIComponent(conversationId)}/policy`,
      policy
        ? {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(policy)
          }
        : { method: 'DELETE' }
    ),
    policy ? 'Conversation policy update' : 'Conversation policy reset'
  )
  return readUarRunDetail(runId)
}
