import { createHash } from 'node:crypto'

import { readIntegrationConfig, readSecrets } from '@main/services/prometheus/integrationConfig'

import type { UarHostToolDisposition, UarPreparedInvocation } from './UarHostToolAdmission'

export type UarAuthorityDisposition = 'deny' | 'challenge' | 'permit'

export type UarAuthorityEffect = {
  effectId: string
  invocation: UarPreparedInvocation
  trustedPrincipal: string
  trustedActor: string
  trustedSessionId: string
  trustedWorkspace: string
  hostDisposition: UarHostToolDisposition
}

export type UarAuthorityDecision = {
  provider: 'local' | 'flint'
  disposition: UarAuthorityDisposition
  issuer: string
  bindingRevision: string
  challengeId?: string
  reason: string
  providerBinding?: Record<string, unknown>
}

export interface UarAuthorityProvider {
  evaluate(effect: UarAuthorityEffect): Promise<UarAuthorityDecision>
  decide(decision: UarAuthorityDecision, approved: boolean): Promise<boolean>
  revalidate(effect: UarAuthorityEffect, decision: UarAuthorityDecision): Promise<UarAuthorityDecision>
}

export async function createUarAuthorityProvider(): Promise<UarAuthorityProvider> {
  const config = readIntegrationConfig().uar
  if (config.authorityProvider === 'local') return createLocalUarAuthorityProvider()
  const secrets = await readSecrets()
  const credential = secrets.uarAuthorityToken
  if (!credential) throw new Error('Flint Gate authority is selected but has no protected credential')
  return new FlintUarAuthorityProvider(config.authorityEndpoint, credential)
}

export function createLocalUarAuthorityProvider(): UarAuthorityProvider {
  return new LocalUarAuthorityProvider()
}

class LocalUarAuthorityProvider implements UarAuthorityProvider {
  private readonly decisions = new Map<string, boolean>()

  async evaluate(effect: UarAuthorityEffect): Promise<UarAuthorityDecision> {
    assertTrustedBinding(effect)
    const disposition = localDisposition(effect.hostDisposition)
    return {
      provider: 'local',
      disposition,
      issuer: 'the-boss.local',
      bindingRevision: localBinding(effect),
      ...(disposition === 'challenge' ? { challengeId: effect.effectId } : {}),
      reason: `host_policy_${effect.hostDisposition}`
    }
  }

  async decide(decision: UarAuthorityDecision, approved: boolean): Promise<boolean> {
    if (decision.provider !== 'local' || decision.disposition !== 'challenge' || !decision.challengeId) return false
    const key = challengeKey(decision)
    const existing = this.decisions.get(key)
    if (existing !== undefined) return existing === approved
    this.decisions.set(key, approved)
    return true
  }

  async revalidate(effect: UarAuthorityEffect, decision: UarAuthorityDecision): Promise<UarAuthorityDecision> {
    const current = await this.evaluate(effect)
    if (decision.provider !== 'local' || current.bindingRevision !== decision.bindingRevision) {
      return { ...current, disposition: 'deny', reason: 'authority_binding_changed' }
    }
    if (current.disposition === 'deny') return current
    if (current.disposition === 'challenge' || decision.disposition === 'challenge') {
      if (decision.disposition !== 'challenge') {
        return { ...current, disposition: 'deny', reason: 'approval_not_granted' }
      }
      const approved = this.decisions.get(challengeKey(decision))
      if (approved !== true) return { ...current, disposition: 'deny', reason: 'approval_not_granted' }
    }
    return { ...current, disposition: 'permit', reason: 'host_authority_revalidated' }
  }
}

class FlintUarAuthorityProvider implements UarAuthorityProvider {
  private readonly endpoint: URL

  constructor(
    endpoint: string,
    private readonly credential: string
  ) {
    this.endpoint = new URL(endpoint)
  }

  async evaluate(effect: UarAuthorityEffect): Promise<UarAuthorityDecision> {
    assertTrustedBinding(effect)
    const request = flintRequest(effect)
    return this.requestDecision('/authority/effects/evaluate', request, request, effect)
  }

  async decide(decision: UarAuthorityDecision, approved: boolean): Promise<boolean> {
    if (decision.provider !== 'flint' || !decision.challengeId) return false
    const response = await this.request(
      `/authority/effects/${encodeURIComponent(decision.issuer)}/${encodeURIComponent(decision.challengeId)}/decision`,
      { decision: approved ? 'approve' : 'deny' }
    )
    return response.ok
  }

  async revalidate(effect: UarAuthorityEffect, decision: UarAuthorityDecision): Promise<UarAuthorityDecision> {
    if (decision.provider !== 'flint') return deniedFlint(effect, 'authority_provider_changed')
    const request = flintRequest(effect)
    const current = decision.challengeId
      ? await this.requestDecision(
          '/authority/effects/revalidate',
          { issuer: decision.issuer, challenge_id: decision.challengeId, request },
          request,
          effect
        )
      : await this.requestDecision('/authority/effects/evaluate', request, request, effect)
    if (current.bindingRevision !== decision.bindingRevision) {
      return { ...current, disposition: 'deny', reason: 'authority_binding_changed' }
    }
    return current
  }

  private async requestDecision(
    pathname: string,
    body: unknown,
    expectedRequest: Record<string, unknown>,
    effect: UarAuthorityEffect
  ): Promise<UarAuthorityDecision> {
    const response = await this.request(pathname, body)
    const value: unknown = await response.json()
    if (!isRecord(value) || value.protocol !== 'afc.governed-effect/1' || !isRecord(value.binding)) {
      throw new Error('Flint Gate returned an invalid governed-effect decision')
    }
    if (value.effect_id !== effect.effectId || value.invocation_id !== effect.invocation.invocationId) {
      throw new Error('Flint Gate returned a decision for another effect')
    }
    const disposition = value.disposition
    const requestRevision = value.binding.request_sha256
    if (
      (disposition !== 'deny' && disposition !== 'challenge' && disposition !== 'permit') ||
      typeof requestRevision !== 'string' ||
      requestRevision !== flintRequestDigest(expectedRequest) ||
      (disposition === 'challenge' && typeof value.challenge_id !== 'string') ||
      !matchesFlintBinding(value.binding, expectedRequest)
    ) {
      throw new Error('Flint Gate returned an incomplete governed-effect decision')
    }
    return {
      provider: 'flint',
      disposition,
      issuer: 'the-boss',
      bindingRevision: digest(value.binding),
      ...(typeof value.challenge_id === 'string' ? { challengeId: value.challenge_id } : {}),
      reason: typeof value.reason === 'string' ? value.reason : disposition,
      providerBinding: structuredClone(value.binding)
    }
  }

  private async request(pathname: string, body: unknown): Promise<Response> {
    const url = new URL(pathname, this.endpoint)
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(`Flint Gate authority request failed with HTTP ${response.status}`)
    return response
  }
}

function flintRequest(effect: UarAuthorityEffect): Record<string, unknown> {
  const invocation = effect.invocation
  if (invocation.lease.expiresAt == null || invocation.budgetReservation.expiresAt == null) {
    throw new Error('Flint Gate authority requires expiring UAR lease and budget reservations')
  }
  return {
    protocol: 'afc.governed-effect/1',
    effect_id: effect.effectId,
    invocation_id: invocation.invocationId,
    action: { namespace: 'uar.mcp', name: invocation.providerToolName, version: '1' },
    resource: { kind: 'workspace', destination: effect.trustedWorkspace },
    payload: { algorithm: 'sha256', sha256: unprefixedSha256(invocation.payloadRevision) },
    identity: {
      issuer: 'the-boss',
      subject: effect.trustedPrincipal,
      subject_kind: 'service',
      actor: effect.trustedActor,
      audience: ['flint-gate'],
      identity_revision: digest({
        principal: effect.trustedPrincipal,
        actor: effect.trustedActor,
        session: effect.trustedSessionId,
        workspace: effect.trustedWorkspace
      }),
      verified: true,
      revoked: false
    },
    grants: [],
    lease: {
      lease_id: invocation.lease.leaseId,
      revision: invocation.leaseRevision,
      expires_at: new Date(invocation.lease.expiresAt * 1_000).toISOString().replace('.000Z', 'Z'),
      active: invocation.lease.active
    },
    budget: {
      budget_id: invocation.budgetReservation.budgetId,
      revision: invocation.budgetReservation.revision,
      reservation_id: invocation.budgetReservation.reservationId,
      expires_at: new Date(invocation.budgetReservation.expiresAt * 1_000).toISOString().replace('.000Z', 'Z'),
      active: invocation.budgetReservation.active
    },
    epochs: {
      runtime: invocation.runtimeEpoch,
      host: invocation.hostEpoch,
      catalog: invocation.catalogRevision
    }
  }
}

function flintRequestDigest(request: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex')
}

function unprefixedSha256(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('UAR payload revision is not a canonical SHA-256 digest')
  return value.slice('sha256:'.length)
}

function matchesFlintBinding(binding: Record<string, unknown>, request: Record<string, unknown>): boolean {
  const identity = request.identity
  const requestLease = request.lease
  const bindingLease = binding.lease
  const policy = binding.policy
  const executionOwner = binding.execution_owner
  if (
    !isRecord(identity) ||
    !isRecord(requestLease) ||
    !isRecord(bindingLease) ||
    !isRecord(policy) ||
    !isRecord(executionOwner)
  ) {
    return false
  }
  if (
    typeof policy.set_id !== 'string' ||
    !policy.set_id ||
    typeof policy.revision !== 'string' ||
    !policy.revision ||
    typeof policy.digest !== 'string' ||
    !policy.digest ||
    typeof executionOwner.fact_source !== 'string' ||
    !executionOwner.fact_source ||
    typeof executionOwner.issuer !== 'string' ||
    !executionOwner.issuer ||
    typeof executionOwner.subject !== 'string' ||
    !executionOwner.subject
  ) {
    return false
  }
  return (
    binding.identity_revision === identity.identity_revision &&
    digest(binding.grants) === digest(request.grants) &&
    bindingLease.lease_id === requestLease.lease_id &&
    bindingLease.revision === requestLease.revision &&
    bindingLease.active === requestLease.active &&
    typeof bindingLease.expires_at === 'string' &&
    typeof requestLease.expires_at === 'string' &&
    Date.parse(bindingLease.expires_at) === Date.parse(requestLease.expires_at) &&
    digest(binding.budget) === digest(request.budget) &&
    digest(binding.epochs) === digest(request.epochs)
  )
}

function assertTrustedBinding(effect: UarAuthorityEffect): void {
  if (
    effect.invocation.principalId !== effect.trustedActor ||
    effect.invocation.ownerId !== effect.trustedPrincipal ||
    effect.invocation.workspace !== effect.trustedWorkspace
  ) {
    throw new Error('UAR invocation identity does not match the trusted The Boss session')
  }
}

function localDisposition(disposition: UarHostToolDisposition): UarAuthorityDisposition {
  return disposition === 'auto' ? 'permit' : disposition === 'ask' ? 'challenge' : 'deny'
}

function localBinding(effect: UarAuthorityEffect): string {
  return digest({
    protocol: 'the-boss.uar.host-authority/1',
    effectId: effect.effectId,
    invocationId: effect.invocation.invocationId,
    authorityRevision: effect.invocation.authorityRevision,
    payloadRevision: effect.invocation.payloadRevision,
    principal: effect.trustedPrincipal,
    actor: effect.trustedActor,
    session: effect.trustedSessionId,
    workspace: effect.trustedWorkspace,
    hostDisposition: effect.hostDisposition,
    hostEpoch: effect.invocation.hostEpoch
  })
}

function challengeKey(decision: UarAuthorityDecision): string {
  return `${decision.issuer}\u0000${decision.challengeId ?? ''}\u0000${decision.bindingRevision}`
}

function deniedFlint(effect: UarAuthorityEffect, reason: string): UarAuthorityDecision {
  return {
    provider: 'flint',
    disposition: 'deny',
    issuer: 'the-boss',
    bindingRevision: digest({ effectId: effect.effectId, authorityRevision: effect.invocation.authorityRevision }),
    reason
  }
}

function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)) ?? 'undefined')
    .digest('hex')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)])
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
