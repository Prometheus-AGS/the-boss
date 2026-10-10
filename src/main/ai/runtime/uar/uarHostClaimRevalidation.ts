import { isDeepStrictEqual } from 'node:util'

import { isRecord, type PreparedInvocation } from './toolAdmission/wire'

type ClaimRecord = {
  invocation: PreparedInvocation
  state: string
  hostDisposition: 'auto' | 'ask' | 'deny'
  decision?: boolean
}

/** Recheck UAR's immutable, forwarded lease/reservation facts; never mint them. */
export function hasLiveHostClaimFacts(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.lease) || !isRecord(value.budgetReservation)) return false
  const lease = value.lease
  const budget = value.budgetReservation
  if (![value.principalId, value.budgetRevision, lease.leaseId, lease.task, budget.reservationId, budget.budgetId]
    .every((field) => typeof field === 'string' && field.trim().length > 0)) return false
  const now = Math.floor(Date.now() / 1_000)
  return lease.active === true && budget.active === true &&
    lease.attempt === value.attempt && lease.epoch === value.runtimeEpoch && lease.holder === value.principalId &&
    budget.amount === 1 && budget.unit === 'tool_call' && budget.revision === value.budgetRevision &&
    typeof lease.expiresAt === 'number' && Number.isSafeInteger(lease.expiresAt) && now < lease.expiresAt &&
    typeof budget.expiresAt === 'number' && Number.isSafeInteger(budget.expiresAt) && now < budget.expiresAt
}

/** Revalidate immutable authority before either executor consumes the host claim. */
export function revalidateHostClaim(
  body: unknown,
  record: ClaimRecord | undefined,
  receipt: Record<string, unknown> | undefined,
  disposition: (toolName: string) => 'auto' | 'ask' | 'deny'
): { status: number; body: Record<string, unknown> } {
  if (!record || !receipt) return { status: 404, body: { error: 'Tool admission is unknown' } }
  if (!isRecord(body) || !isDeepStrictEqual(body.invocation, record.invocation) ||
    !isDeepStrictEqual(body.receipt, receipt)) {
    return { status: 409, body: { error: 'Tool claim does not match its prepared admission' } }
  }
  const currentDisposition = disposition(record.invocation.providerToolName)
  if (record.state !== 'authorized' || record.hostDisposition === 'deny' || currentDisposition === 'deny' ||
    ((record.hostDisposition === 'ask' || currentDisposition === 'ask') && record.decision !== true) ||
    !hasLiveHostClaimFacts(record.invocation)) {
    return { status: 409, body: { error: 'Tool admission is not executable' } }
  }
  return { status: 200, body: receipt }
}
