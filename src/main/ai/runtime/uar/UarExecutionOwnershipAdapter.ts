import * as z from 'zod'

import { application } from '@application'
import type {
  UarExecutionOwnerSnapshot,
  UarExecutionReclaimInput,
  UarExecutionReclaimReceipt
} from '@shared/types/uarTeamProfiles'

import type { UarSidecarEndpoint } from './UarSidecarService'

const fence = z.object({
  catalogId: z.string(),
  serviceInstanceId: z.string(),
  incarnationId: z.string(),
  epoch: z.number().int().positive()
})
const ownership = z.object({
  claim: fence
    .extend({
      state: z.enum(['held', 'draining', 'released']),
      acquiredAt: z.string(),
      auditReceiptId: z.string(),
      releasedAt: z.string().optional()
    })
    .nullable(),
  currentFence: fence,
  ownsExecution: z.boolean()
})

async function request(
  path: string,
  input?: UarExecutionReclaimInput,
  method = 'GET',
  selectedEndpoint?: UarSidecarEndpoint
): Promise<unknown> {
  const sidecar = application.get('UarSidecarService')
  const endpoint = selectedEndpoint ?? (await sidecar.resolveSelected())
  const response = await sidecar.adminRequestInstance(
    endpoint,
    path,
    input
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input)
        }
      : { method }
  )
  const body: unknown = await response.json()
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(body)
    const code =
      error.success && /^TEAM_[A-Z_]+$/.test(error.data.error.code) ? error.data.error.code : 'TEAM_SCOPE_DENIED'
    throw new Error(code)
  }
  const current = selectedEndpoint
    ? await sidecar.resolveInstance(selectedEndpoint.instanceId)
    : await sidecar.resolveSelected()
  if (current.generation !== endpoint.generation) throw new Error('TEAM_REVISION_CONFLICT')
  return body
}

export async function readUarExecutionOwner(endpoint?: UarSidecarEndpoint): Promise<UarExecutionOwnerSnapshot> {
  return ownership.parse(await request('/api/v1/collaboration/execution-owner', undefined, 'GET', endpoint))
}

export async function reclaimUarExecutionOwner(input: UarExecutionReclaimInput): Promise<UarExecutionReclaimReceipt> {
  const current = await readUarExecutionOwner()
  if (
    input.catalogId !== current.currentFence.catalogId ||
    input.replacementServiceInstanceId !== current.currentFence.serviceInstanceId
  ) {
    throw new Error('TEAM_SCOPE_DENIED')
  }
  return z
    .object({
      commandId: z.string(),
      requestDigest: z.string(),
      authenticatedActorId: z.string(),
      reason: z.string(),
      previousFence: fence,
      replacementFence: fence,
      authorizationDecisionRef: z.string(),
      fencingEvidenceRef: z.string(),
      transferredQueuedAttemptIds: z.array(z.string()),
      uncertainAttemptIds: z.array(z.string()),
      committedAt: z.string()
    })
    .parse(await request('/api/v1/collaboration/execution-owner/reclaim', input))
}

export async function quiesceUarExecutionOwner(): Promise<{
  fencingEvidenceRef: string
  claim: NonNullable<UarExecutionOwnerSnapshot['claim']>
}> {
  return z
    .object({ fencingEvidenceRef: z.string(), claim: ownership.shape.claim.unwrap() })
    .parse(await request('/api/v1/collaboration/execution-owner/quiesce', undefined, 'POST'))
}
