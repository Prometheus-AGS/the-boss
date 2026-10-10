import { createHash } from 'node:crypto'

export const UAR_TOOL_ADMISSION_VERSION = 2
export const UAR_TOOL_ADMISSION_PATH = '/uar/admission/v2'
export const UAR_TOOL_ADMISSION_META_KEY = 'tools.know-me.the-boss/admission'

export type UarHostToolDisposition = 'auto' | 'ask' | 'deny'
export type UarToolExecutionKind = 'runtime_native' | 'host_mcp'

export type PreparedInvocation = {
  version: number
  executionKind: UarToolExecutionKind
  invocationId: string
  modelToolCallId: string
  attempt: number
  rootRunId: string
  executingRunId: string
  ownerId: string
  principalId: string
  workspace: string
  runtimeEpoch: string
  hostEpoch: string
  catalogRevision: string
  mountedServerId: string
  nativeToolName: string
  providerToolName: string
  runPolicyRevision: string
  governancePolicyRevision: string
  toolPolicyRevision: string
  resourceRevision: string
  payloadRevision: string
  grantRevision: string
  leaseRevision: string
  budgetRevision: string
  lease: {
    leaseId: string
    task: string
    attempt: number
    epoch: string
    holder: string
    expiresAt: number
    active: boolean
  }
  budgetReservation: {
    reservationId: string
    budgetId: string
    revision: string
    amount: number
    unit: string
    expiresAt: number
    active: boolean
  }
  authorityRevision: string
  callIndex: number
  validatedArguments: Record<string, unknown>
}

export function isPreparedInvocation(value: unknown): value is PreparedInvocation {
  if (
    !isRecord(value) ||
    !isRecord(value.validatedArguments) ||
    !isRecord(value.lease) ||
    !isRecord(value.budgetReservation)
  ) {
    return false
  }
  const strings = [
    'invocationId',
    'modelToolCallId',
    'rootRunId',
    'executingRunId',
    'ownerId',
    'principalId',
    'workspace',
    'runtimeEpoch',
    'hostEpoch',
    'catalogRevision',
    'mountedServerId',
    'nativeToolName',
    'providerToolName',
    'runPolicyRevision',
    'governancePolicyRevision',
    'toolPolicyRevision',
    'resourceRevision',
    'payloadRevision',
    'grantRevision',
    'leaseRevision',
    'budgetRevision',
    'authorityRevision'
  ]
  const lease = value.lease
  const budget = value.budgetReservation
  return (
    value.version === UAR_TOOL_ADMISSION_VERSION &&
    (value.executionKind === 'host_mcp' || value.executionKind === 'runtime_native') &&
    value.attempt === 1 &&
    Number.isSafeInteger(value.callIndex) &&
    typeof lease.leaseId === 'string' &&
    typeof lease.task === 'string' &&
    lease.attempt === value.attempt &&
    typeof lease.epoch === 'string' &&
    typeof lease.holder === 'string' &&
    typeof lease.active === 'boolean' &&
    Number.isSafeInteger(lease.expiresAt) &&
    typeof budget.reservationId === 'string' &&
    typeof budget.budgetId === 'string' &&
    typeof budget.revision === 'string' &&
    Number.isSafeInteger(budget.amount) &&
    typeof budget.unit === 'string' &&
    typeof budget.active === 'boolean' &&
    Number.isSafeInteger(budget.expiresAt) &&
    strings.every((key) => typeof value[key] === 'string' && value[key].length > 0)
  )
}

export function argumentDigest(value: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

export function validAuthorityEnvelope(invocation: PreparedInvocation): boolean {
  if (revisionDigest(invocation.validatedArguments) !== invocation.payloadRevision) return false
  const now = Math.floor(Date.now() / 1_000)
  if (
    !invocation.lease.active ||
    invocation.lease.attempt !== invocation.attempt ||
    invocation.lease.epoch !== invocation.runtimeEpoch ||
    invocation.lease.holder !== invocation.principalId ||
    invocation.lease.expiresAt <= now ||
    !invocation.budgetReservation.active ||
    invocation.budgetReservation.amount !== 1 ||
    invocation.budgetReservation.unit !== 'tool_call' ||
    invocation.budgetReservation.revision !== invocation.budgetRevision ||
    invocation.budgetReservation.expiresAt <= now
  ) {
    return false
  }
  return (
    revisionDigest({
      executionKind: invocation.executionKind,
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
    }) === invocation.authorityRevision
  )
}

function revisionDigest(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
