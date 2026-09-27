import { createHash, randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUarAuthorityProvider, type UarAuthorityEffect } from '../UarAuthorityProvider'
import { UarHostToolAdmission, type UarPreparedInvocation } from '../UarHostToolAdmission'

const authorityConfig = vi.hoisted(() => ({ provider: 'local' as 'local' | 'flint' }))

vi.mock('@main/services/prometheus/integrationConfig', () => ({
  readIntegrationConfig: () => ({
    uar: {
      authorityProvider: authorityConfig.provider,
      authorityEndpoint: 'http://127.0.0.1:4457'
    }
  }),
  readSecrets: async () => ({ uarAuthorityToken: 'protected-gate-token' })
}))

describe('AFC C02 governed-effect host integration gate', () => {
  afterEach(() => {
    authorityConfig.provider = 'local'
    vi.restoreAllMocks()
  })

  it('binds local and Flint authority to the exact trusted host claim', async () => {
    const localProvider = await createUarAuthorityProvider()
    const admission = new UarHostToolAdmission({
      sessionId: 'trusted-session',
      ownerId: 'trusted-owner',
      principalId: 'trusted-agent',
      workspace: '/trusted/workspace',
      authorityProvider: localProvider,
      disposition: () => 'auto'
    })
    const invocation = preparedInvocation(admission.hostEpoch)

    const prepared = await postAdmission(admission, 'prepare', { invocation })
    expect(prepared.status).toBe(200)
    expect(prepared.value).toMatchObject({
      invocationId: invocation.invocationId,
      authorityRevision: invocation.authorityRevision,
      hostDisposition: 'auto'
    })

    const preclaim = admission.claimToolCall(managedCall(invocation, prepared.value), invocation.mountedServerId)
    expect(preclaim.error).toBe('Managed tool admission is not executable')

    const resolved = await postAdmission(admission, 'resolve', {
      admissionId: prepared.value.admissionId,
      invocationId: invocation.invocationId,
      localDisposition: 'allowed',
      approved: true
    })
    expect(resolved.status).toBe(200)
    expect(resolved.value.authorityRevision).toBe(invocation.authorityRevision)

    const claimed = await postAdmission(admission, 'claim', {
      admissionId: prepared.value.admissionId,
      invocation,
      receipt: resolved.value
    })
    expect(claimed.status).toBe(200)
    expect(claimed.value).toEqual(resolved.value)
    expect(admission.claimToolCall(managedCall(invocation, claimed.value), invocation.mountedServerId)).toEqual({
      call: { id: 'call-1' },
      admissionId: prepared.value.admissionId
    })

    const changedPayload = nextInvocation(invocation)
    changedPayload.validatedArguments.path = '/forged/path'
    expect((await postAdmission(admission, 'prepare', { invocation: changedPayload })).status).toBe(409)

    const expiredLease = nextInvocation(invocation)
    expiredLease.lease.expiresAt = unixTime() - 1
    expiredLease.authorityRevision = authorityRevision(expiredLease)
    expect((await postAdmission(admission, 'prepare', { invocation: expiredLease })).status).toBe(409)
    const expiredBudget = nextInvocation(invocation)
    expiredBudget.budgetReservation.expiresAt = unixTime() - 1
    expiredBudget.authorityRevision = authorityRevision(expiredBudget)
    expect((await postAdmission(admission, 'prepare', { invocation: expiredBudget })).status).toBe(409)

    const wrongAgent = nextInvocation(invocation)
    wrongAgent.principalId = 'uar-forged-agent'
    expect((await postAdmission(admission, 'prepare', { invocation: wrongAgent })).status).toBe(409)

    authorityConfig.provider = 'flint'
    const requests: Array<{ path: string; body: Record<string, unknown>; authorization: string | null }> = []
    let evaluateDisposition: 'challenge' | 'permit' = 'challenge'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requests.push({
        path,
        body,
        authorization: new Headers(init?.headers).get('authorization')
      })
      if (path.endsWith('/decision')) return Response.json({ status: 'ok' })
      const request = (path.endsWith('/revalidate') ? body.request : body) as Record<string, unknown>
      return Response.json(gateDecision(request, path.endsWith('/revalidate') ? 'permit' : evaluateDisposition))
    })
    const flintProvider = await createUarAuthorityProvider()
    const flintInvocation = preparedInvocation(randomUUID())
    const effect: UarAuthorityEffect = {
      effectId: randomUUID(),
      invocation: flintInvocation,
      trustedPrincipal: 'trusted-owner',
      trustedActor: 'trusted-agent',
      trustedSessionId: 'trusted-session',
      trustedWorkspace: '/trusted/workspace',
      hostDisposition: 'auto'
    }
    const gateEvaluation = await flintProvider.evaluate(effect)
    expect(gateEvaluation).toMatchObject({ provider: 'flint', disposition: 'challenge' })
    expect(requests[0]).toMatchObject({
      path: '/authority/effects/evaluate',
      authorization: 'Bearer protected-gate-token',
      body: {
        identity: {
          subject: 'trusted-owner',
          actor: 'trusted-agent',
          verified: true,
          revoked: false
        },
        lease: { lease_id: flintInvocation.lease.leaseId, revision: flintInvocation.leaseRevision },
        budget: {
          budget_id: flintInvocation.budgetReservation.budgetId,
          reservation_id: flintInvocation.budgetReservation.reservationId
        }
      }
    })
    await expect(flintProvider.decide(gateEvaluation, true)).resolves.toBe(true)
    await expect(flintProvider.revalidate(effect, gateEvaluation)).resolves.toMatchObject({
      disposition: 'permit',
      bindingRevision: gateEvaluation.bindingRevision
    })
    expect(requests.map(({ path }) => path)).toEqual([
      '/authority/effects/evaluate',
      expect.stringMatching(/^\/authority\/effects\/the-boss\/.+\/decision$/),
      '/authority/effects/revalidate'
    ])

    evaluateDisposition = 'permit'
    let changedHostDisposition: 'auto' | 'ask' = 'auto'
    const policyChangeAdmission = new UarHostToolAdmission({
      sessionId: 'trusted-session',
      ownerId: 'trusted-owner',
      principalId: 'trusted-agent',
      workspace: '/trusted/workspace',
      authorityProvider: flintProvider,
      disposition: () => changedHostDisposition
    })
    const policyChangeInvocation = preparedInvocation(policyChangeAdmission.hostEpoch)
    const policyChangePrepared = await postAdmission(policyChangeAdmission, 'prepare', {
      invocation: policyChangeInvocation
    })
    expect(policyChangePrepared).toMatchObject({ status: 200, value: { hostDisposition: 'auto' } })
    const policyChangeReceipt = await postAdmission(policyChangeAdmission, 'resolve', {
      admissionId: policyChangePrepared.value.admissionId,
      invocationId: policyChangeInvocation.invocationId,
      localDisposition: 'allowed',
      approved: true
    })
    expect(policyChangeReceipt.status).toBe(200)
    changedHostDisposition = 'ask'
    const changedPolicyClaim = await postAdmission(policyChangeAdmission, 'claim', {
      admissionId: policyChangePrepared.value.admissionId,
      invocation: policyChangeInvocation,
      receipt: policyChangeReceipt.value
    })
    expect(changedPolicyClaim).toMatchObject({
      status: 409,
      value: { error: expect.stringMatching(/revalidation denied/) }
    })

    const untrustedEffect = {
      ...effect,
      invocation: { ...flintInvocation, ownerId: 'uar-forged-owner' }
    }
    await expect(flintProvider.evaluate(untrustedEffect)).rejects.toThrow(/trusted The Boss session/)

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    const unavailableGateAdmission = new UarHostToolAdmission({
      sessionId: 'trusted-session',
      ownerId: 'trusted-owner',
      principalId: 'trusted-agent',
      workspace: '/trusted/workspace',
      authorityProvider: flintProvider,
      disposition: () => 'auto'
    })
    const unavailable = await postAdmission(unavailableGateAdmission, 'prepare', {
      invocation: preparedInvocation(unavailableGateAdmission.hostEpoch)
    })
    expect(unavailable).toMatchObject({ status: 503, value: { error: expect.stringMatching(/HTTP 503/) } })
  })
})

type AdmissionResponse = { status: number; value: Record<string, any> }

async function postAdmission(
  admission: UarHostToolAdmission,
  operation: string,
  body: unknown
): Promise<AdmissionResponse> {
  const capture = { status: 0, value: {} as Record<string, any> }
  const response = {
    writeHead(status: number) {
      capture.status = status
      return this
    },
    end(value?: string) {
      capture.value = value ? JSON.parse(value) : {}
      return this
    }
  } as unknown as ServerResponse
  await admission.handleHttp('POST', `/uar/admission/v1/${operation}`, body, response)
  return capture
}

function managedCall(invocation: UarPreparedInvocation, receipt: Record<string, unknown>): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 'call-1',
    method: 'tools/call',
    params: {
      name: invocation.nativeToolName,
      arguments: invocation.validatedArguments,
      _meta: { 'tools.know-me.the-boss/admission': receipt }
    }
  }
}

function preparedInvocation(hostEpoch: string): UarPreparedInvocation {
  const runtimeEpoch = randomUUID()
  const rootRunId = randomUUID()
  const invocationId = randomUUID()
  const validatedArguments = { path: '/trusted/workspace/file.txt', content: 'content' }
  const payloadRevision = revision(validatedArguments)
  const leaseRevision = revision({ lease: invocationId })
  const budgetRevision = revision({ budget: rootRunId })
  const lease = {
    leaseId: `lease:${rootRunId}`,
    task: 'workspace__write',
    attempt: 1,
    epoch: runtimeEpoch,
    holder: 'trusted-agent',
    expiresAt: unixTime() + 300,
    active: true
  }
  const budgetReservation = {
    reservationId: `reservation:${invocationId}`,
    budgetId: `budget:${rootRunId}`,
    revision: budgetRevision,
    amount: 1,
    unit: 'tool_call',
    expiresAt: unixTime() + 300,
    active: true
  }
  const invocation = {
    version: 1,
    invocationId,
    modelToolCallId: 'call-1',
    attempt: 1,
    rootRunId,
    executingRunId: rootRunId,
    ownerId: 'trusted-owner',
    principalId: 'trusted-agent',
    workspace: '/trusted/workspace',
    runtimeEpoch,
    hostEpoch,
    catalogRevision: revision({ catalog: 'one' }),
    mountedServerId: 'workspace',
    nativeToolName: 'write',
    providerToolName: 'workspace__write',
    runPolicyRevision: revision({ run: 'one' }),
    governancePolicyRevision: revision({ governance: 'one' }),
    toolPolicyRevision: revision({ tool: 'write' }),
    resourceRevision: revision({ resource: '/trusted/workspace' }),
    payloadRevision,
    grantRevision: revision([]),
    leaseRevision,
    budgetRevision,
    lease,
    budgetReservation,
    authorityRevision: '',
    callIndex: 0,
    validatedArguments
  }
  invocation.authorityRevision = authorityRevision(invocation)
  return invocation
}

function nextInvocation(invocation: UarPreparedInvocation): UarPreparedInvocation {
  return {
    ...structuredClone(invocation),
    invocationId: randomUUID(),
    modelToolCallId: randomUUID()
  }
}

function authorityRevision(invocation: UarPreparedInvocation): string {
  return revision({
    principalId: invocation.principalId,
    ownerId: invocation.ownerId,
    rootRunId: invocation.rootRunId,
    executingRunId: invocation.executingRunId,
    runtimeEpoch: invocation.runtimeEpoch,
    hostEpoch: invocation.hostEpoch,
    catalogRevision: invocation.catalogRevision,
    runPolicyRevision: invocation.runPolicyRevision,
    expectedGovernancePolicyRevision: invocation.governancePolicyRevision,
    toolPolicyRevision: invocation.toolPolicyRevision,
    resourceRevision: invocation.resourceRevision,
    payloadRevision: invocation.payloadRevision,
    grantRevision: invocation.grantRevision,
    leaseRevision: invocation.leaseRevision,
    budgetRevision: invocation.budgetRevision,
    lease: invocation.lease,
    budgetReservation: invocation.budgetReservation
  })
}

function gateDecision(request: Record<string, any>, disposition: 'challenge' | 'permit'): Record<string, unknown> {
  return {
    protocol: 'afc.governed-effect/1',
    disposition,
    effect_id: request.effect_id,
    invocation_id: request.invocation_id,
    binding: {
      request_sha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
      policy: { set_id: 'active', revision: 'policy-1', digest: 'policy-digest' },
      execution_owner: { fact_source: 'flint-gate.admin-auth.jwt', issuer: 'issuer', subject: 'the-boss' },
      grants: request.grants,
      lease: request.lease,
      budget: request.budget,
      identity_revision: request.identity.identity_revision,
      epochs: request.epochs
    },
    ...(disposition === 'challenge' ? { challenge_id: randomUUID() } : {}),
    reason: disposition === 'challenge' ? 'approval_required' : 'policy_permitted'
  }
}

function revision(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)])
  )
}

function unixTime(): number {
  return Math.floor(Date.now() / 1_000)
}
