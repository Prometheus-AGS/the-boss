import { createHash, randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'

import type { UarAuthorityDecision, UarAuthorityEffect, UarAuthorityProvider } from './UarAuthorityProvider'
import { sanitizeUarProviderToolName } from './uarToolNames'

export const UAR_TOOL_ADMISSION_VERSION = 1
export const UAR_TOOL_ADMISSION_PATH = '/uar/admission/v1'
export const UAR_TOOL_ADMISSION_META_KEY = 'tools.know-me.the-boss/admission'

export type UarHostToolDisposition = 'auto' | 'ask' | 'deny'

export type UarPreparedInvocation = {
  version: number
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

export type UarHostAdmissionState =
  | 'prepared'
  | 'awaiting-human'
  | 'awaiting-ack'
  | 'authorized'
  | 'claimed'
  | 'succeeded'
  | 'failed'
  | 'denied'
  | 'cancelled'
  | 'invalidated'
  | 'interrupted'
  | 'outcome-unknown'

export type UarHostAdmissionSnapshot = {
  admissionId: string
  invocationId: string
  rootRunId: string
  executingRunId: string
  sessionId: string
  ownerId: string
  workspace: string
  hostEpoch: string
  toolName: string
  state: UarHostAdmissionState
  hostDisposition: UarHostToolDisposition
  actionDisplay: Record<string, unknown>
  updatedAt: number
}

type AdmissionRecord = {
  admissionId: string
  invocation: UarPreparedInvocation
  argumentDigest: string
  hostDisposition: UarHostToolDisposition
  authority: UarAuthorityDecision
  claimRevalidated: boolean
  managedDispatchClaimed: boolean
  state: UarHostAdmissionState
  decision?: boolean
  actionDisplay: Record<string, unknown>
  updatedAt: number
}

type JsonRpcCall = { id: unknown }
type ClaimResult = { call?: JsonRpcCall; admissionId?: string; error?: string }

export interface UarHostToolAdmissionOptions {
  sessionId?: string
  ownerId: string
  principalId: string
  workspace: string
  authorityProvider: UarAuthorityProvider
  disposition(toolName: string): UarHostToolDisposition
  persistLifecycle?(snapshot: UarHostAdmissionSnapshot): void
  onLifecycle?(snapshot: UarHostAdmissionSnapshot): void
  verifyTeamInvocation?(invocation: UarPreparedInvocation): Promise<boolean>
}

export class UarHostToolAdmission {
  readonly hostEpoch = randomUUID()
  private readonly records = new Map<string, AdmissionRecord>()
  private readonly invocationIndex = new Map<string, string>()
  private runtimeEpoch?: string
  private rootRunId?: string

  constructor(private readonly options: UarHostToolAdmissionOptions) {}

  async handleHttp(
    method: string | undefined,
    path: string,
    body: unknown,
    response: ServerResponse
  ): Promise<boolean> {
    if (!path.startsWith(`${UAR_TOOL_ADMISSION_PATH}/`)) return false
    const operation = path.slice(UAR_TOOL_ADMISSION_PATH.length + 1)
    if (method === 'POST' && operation === 'prepare') return this.prepare(body, response)
    if (method === 'POST' && operation === 'resolve') return this.resolve(body, response)
    if (method === 'POST' && operation === 'claim') return this.claim(body, response)
    if (method === 'POST' && operation === 'cancel') return this.cancel(body, response)
    if (method === 'POST' && operation === 'finish') return this.finish(body, response)
    if (method === 'POST' && operation === 'inspect') return this.inspect(body, response)
    this.respond(response, 404, { error: 'Unknown tool admission operation' })
    return true
  }

  claimToolCall(body: unknown, serverName: string): ClaimResult {
    if (Array.isArray(body))
      return { call: { id: null }, error: 'Batch tools/call is not supported by the managed host' }
    if (!isRecord(body) || body.method !== 'tools/call' || !isRecord(body.params)) return {}
    const call = { id: body.id ?? null }
    const name = body.params.name
    const args = body.params.arguments
    const meta = isRecord(body.params._meta) ? body.params._meta[UAR_TOOL_ADMISSION_META_KEY] : undefined
    if (typeof name !== 'string' || !isRecord(args) || !isRecord(meta)) {
      return { call, error: 'Managed tool call is missing exact admission identity' }
    }
    const admissionId = meta.admissionId
    const invocationId = meta.invocationId
    const record = typeof admissionId === 'string' ? this.records.get(admissionId) : undefined
    if (!record || typeof invocationId !== 'string') return { call, error: 'Managed tool admission is unknown' }
    const invocation = record.invocation
    const providerName = sanitizeUarProviderToolName(`${serverName}__${name}`)
    const matches =
      meta.version === UAR_TOOL_ADMISSION_VERSION &&
      meta.runtimeEpoch === invocation.runtimeEpoch &&
      meta.hostEpoch === this.hostEpoch &&
      meta.authorityRevision === invocation.authorityRevision &&
      invocationId === invocation.invocationId &&
      invocation.mountedServerId === serverName &&
      invocation.nativeToolName === name &&
      invocation.providerToolName === providerName &&
      record.argumentDigest === argumentDigest(args)
    if (!matches) {
      this.transition(record, 'invalidated')
      return { call, error: 'Managed tool call does not match its prepared admission' }
    }
    const currentDisposition = this.options.disposition(providerName)
    if (currentDisposition === 'deny' || (currentDisposition === 'ask' && record.decision !== true)) {
      this.transition(record, 'invalidated')
      return { call, error: 'Managed tool policy changed before dispatch' }
    }
    if (record.state !== 'claimed') return { call, error: 'Managed tool admission is not executable' }
    if (!record.claimRevalidated) return { call, error: 'Managed tool admission was not revalidated before dispatch' }
    if (record.managedDispatchClaimed) return { call, error: 'Managed tool admission was already dispatched' }
    record.managedDispatchClaimed = true
    return { call, admissionId: record.admissionId }
  }

  async recordHumanDecision(admissionId: string, approved: boolean): Promise<boolean> {
    const record = this.records.get(admissionId)
    if (!record) return false
    if (record.decision !== undefined) return record.decision === approved
    if (!['prepared', 'awaiting-human'].includes(record.state)) return false
    if (
      record.authority.disposition === 'challenge' &&
      !(await this.options.authorityProvider.decide(record.authority, approved))
    ) {
      return false
    }
    this.transition(record, approved ? 'awaiting-ack' : 'denied')
    record.decision = approved
    return true
  }

  cancelAdmission(
    admissionId: string,
    invocationId: string | undefined,
    reason: 'cancelled' | 'invalidated' = 'cancelled'
  ): UarHostAdmissionState | undefined {
    const record = this.records.get(admissionId)
    if (!record || (invocationId && record.invocation.invocationId !== invocationId)) return undefined
    if (
      ![
        'claimed',
        'succeeded',
        'failed',
        'denied',
        'cancelled',
        'invalidated',
        'interrupted',
        'outcome-unknown'
      ].includes(record.state)
    ) {
      this.transition(record, reason)
    }
    return record.state
  }

  invalidateForTeardown(onError: (error: unknown) => void = () => undefined): void {
    for (const record of this.records.values()) {
      try {
        if (record.state === 'claimed') this.transition(record, 'outcome-unknown')
        else if (!['succeeded', 'failed', 'denied', 'cancelled', 'invalidated'].includes(record.state)) {
          this.transition(record, 'interrupted')
        }
      } catch (error) {
        onError(error)
      }
    }
  }

  snapshots(ownerId = this.options.ownerId): UarHostAdmissionSnapshot[] {
    if (ownerId !== this.options.ownerId) return []
    return [...this.records.values()].map((record) => this.snapshot(record))
  }

  private async prepare(body: unknown, response: ServerResponse): Promise<true> {
    const invocation = isRecord(body) && isPreparedInvocation(body.invocation) ? body.invocation : undefined
    if (!invocation) {
      this.respond(response, 422, { error: 'Invalid prepared tool invocation' })
      return true
    }
    if (
      !this.binds(invocation) ||
      (this.options.verifyTeamInvocation && !(await this.options.verifyTeamInvocation(invocation)))
    ) {
      this.respond(response, 409, { error: 'Prepared tool invocation belongs to another host binding' })
      return true
    }
    if (!validAuthorityEnvelope(invocation)) {
      this.respond(response, 409, { error: 'Prepared tool invocation has an invalid authority binding' })
      return true
    }
    if (this.invocationIndex.has(invocation.invocationId)) {
      this.respond(response, 409, { error: 'Prepared tool invocation already exists' })
      return true
    }
    const admissionId = randomUUID()
    const localDisposition = this.options.disposition(invocation.providerToolName)
    let authority: UarAuthorityDecision
    try {
      authority = await this.options.authorityProvider.evaluate(this.effect(admissionId, invocation, localDisposition))
    } catch (error) {
      this.respond(response, 503, { error: authorityError(error) })
      return true
    }
    const hostDisposition = composeDisposition(localDisposition, authority.disposition)
    const record: AdmissionRecord = {
      admissionId,
      invocation: structuredClone(invocation),
      argumentDigest: argumentDigest(invocation.validatedArguments),
      hostDisposition,
      authority,
      claimRevalidated: false,
      managedDispatchClaimed: false,
      state: hostDisposition === 'auto' ? 'prepared' : hostDisposition === 'ask' ? 'awaiting-human' : 'denied',
      actionDisplay: safeActionDisplay(invocation),
      updatedAt: Date.now()
    }
    try {
      this.options.persistLifecycle?.(this.snapshot(record))
    } catch {
      this.respond(response, 503, { error: 'Tool admission evidence could not be persisted' })
      return true
    }
    this.records.set(admissionId, record)
    this.invocationIndex.set(invocation.invocationId, admissionId)
    this.options.onLifecycle?.(this.snapshot(record))
    this.respond(response, 200, this.preparation(record))
    return true
  }

  private resolve(body: unknown, response: ServerResponse): true {
    const admissionId = isRecord(body) && typeof body.admissionId === 'string' ? body.admissionId : ''
    const invocationId = isRecord(body) && typeof body.invocationId === 'string' ? body.invocationId : ''
    const approved = isRecord(body) && typeof body.approved === 'boolean' ? body.approved : undefined
    const localDisposition = isRecord(body) ? body.localDisposition : undefined
    const record = this.records.get(admissionId)
    if (
      !record ||
      record.invocation.invocationId !== invocationId ||
      approved === undefined ||
      !['allowed', 'approved', 'governance_bypassed', 'denied'].includes(String(localDisposition))
    ) {
      this.respond(response, 404, { error: 'Tool admission decision is unknown' })
      return true
    }
    if (!approved) {
      if (record.decision === true || ['claimed', 'succeeded'].includes(record.state)) {
        this.respond(response, 409, { error: 'Tool admission decision conflicts with host state' })
        return true
      }
      this.transition(record, 'denied')
      record.decision ??= false
      this.respond(response, 200, { state: record.state })
      return true
    }
    const currentDisposition = this.options.disposition(record.invocation.providerToolName)
    const requiresHuman =
      record.hostDisposition === 'ask' || currentDisposition === 'ask' || localDisposition === 'approved'
    if (
      record.hostDisposition === 'deny' ||
      currentDisposition === 'deny' ||
      localDisposition === 'denied' ||
      (requiresHuman && record.decision !== true) ||
      !['prepared', 'awaiting-ack', 'authorized'].includes(record.state)
    ) {
      this.respond(response, 409, { error: 'Tool admission decision conflicts with host state' })
      return true
    }
    this.transition(record, 'authorized')
    this.respond(response, 200, this.receipt(record))
    return true
  }

  private async claim(body: unknown, response: ServerResponse): Promise<true> {
    const admissionId = isRecord(body) && typeof body.admissionId === 'string' ? body.admissionId : ''
    const invocation = isRecord(body) && isPreparedInvocation(body.invocation) ? body.invocation : undefined
    const receipt = isRecord(body) && isRecord(body.receipt) ? body.receipt : undefined
    const record = this.records.get(admissionId)
    if (
      !record ||
      !invocation ||
      !receipt ||
      record.state !== 'authorized' ||
      !sameInvocation(record.invocation, invocation) ||
      !matchesReceipt(record, receipt)
    ) {
      this.respond(response, 409, { error: 'Tool admission claim does not match its authorized binding' })
      return true
    }
    const currentDisposition = this.options.disposition(invocation.providerToolName)
    if (this.options.verifyTeamInvocation && !(await this.options.verifyTeamInvocation(invocation))) {
      this.respond(response, 409, { error: 'Team tool authority changed before claim' })
      return true
    }
    let authority: UarAuthorityDecision
    try {
      authority = await this.options.authorityProvider.revalidate(
        this.effect(admissionId, invocation, currentDisposition),
        record.authority
      )
    } catch (error) {
      this.respond(response, 503, { error: authorityError(error) })
      return true
    }
    const currentHostDisposition = composeDisposition(currentDisposition, authority.disposition)
    if (
      authority.disposition !== 'permit' ||
      authority.bindingRevision !== record.authority.bindingRevision ||
      currentHostDisposition === 'deny' ||
      (currentHostDisposition === 'ask' && record.decision !== true)
    ) {
      this.transition(record, 'invalidated')
      this.respond(response, 409, { error: `Tool authority revalidation denied: ${authority.reason}` })
      return true
    }
    try {
      this.transition(record, 'claimed')
    } catch {
      this.respond(response, 503, { error: 'Tool claim evidence could not be persisted' })
      return true
    }
    record.claimRevalidated = true
    this.respond(response, 200, this.receipt(record))
    return true
  }

  private cancel(body: unknown, response: ServerResponse): true {
    const admissionId = isRecord(body) && typeof body.admissionId === 'string' ? body.admissionId : ''
    const invocationId = isRecord(body) && typeof body.invocationId === 'string' ? body.invocationId : undefined
    const reason = isRecord(body) && body.reason === 'invalidated' ? 'invalidated' : 'cancelled'
    const state = this.cancelAdmission(admissionId, invocationId, reason)
    if (!state) {
      this.respond(response, 404, { error: 'Tool admission is unknown' })
      return true
    }
    const outcome = ['cancelled', 'invalidated'].includes(state)
      ? 'cancelled'
      : state === 'claimed'
        ? 'already_claimed'
        : 'already_terminal'
    this.respond(response, 200, outcome)
    return true
  }

  private finish(body: unknown, response: ServerResponse): true {
    const admissionId = isRecord(body) && typeof body.admissionId === 'string' ? body.admissionId : ''
    const invocationId = isRecord(body) && typeof body.invocationId === 'string' ? body.invocationId : ''
    const outcome =
      isRecord(body) && (body.outcome === 'succeeded' || body.outcome === 'failed') ? body.outcome : undefined
    const record = this.records.get(admissionId)
    if (!record || record.invocation.invocationId !== invocationId || !outcome) {
      this.respond(response, 404, { error: 'Tool admission is unknown' })
      return true
    }
    if (record.state === 'claimed') this.transition(record, outcome)
    if (record.state !== outcome) {
      this.respond(response, 409, { error: 'Tool admission is not awaiting a terminal receipt' })
      return true
    }
    response.writeHead(204)
    response.end()
    return true
  }

  private inspect(body: unknown, response: ServerResponse): true {
    const admissionId = isRecord(body) && typeof body.admissionId === 'string' ? body.admissionId : ''
    const record = this.records.get(admissionId)
    if (!record) {
      this.respond(response, 404, { error: 'Tool admission is unknown' })
      return true
    }
    this.respond(response, 200, {
      admissionId,
      invocationId: record.invocation.invocationId,
      toolName: record.invocation.providerToolName,
      state: record.state,
      hostDisposition: record.hostDisposition,
      updatedAt: record.updatedAt
    })
    return true
  }

  private binds(invocation: UarPreparedInvocation): boolean {
    if (
      invocation.version !== UAR_TOOL_ADMISSION_VERSION ||
      invocation.hostEpoch !== this.hostEpoch ||
      invocation.ownerId !== this.options.ownerId ||
      (!this.options.verifyTeamInvocation && invocation.principalId !== this.options.principalId) ||
      invocation.workspace !== this.options.workspace ||
      invocation.attempt !== 1
    ) {
      return false
    }
    this.runtimeEpoch ??= invocation.runtimeEpoch
    if (!this.options.verifyTeamInvocation) this.rootRunId ??= invocation.rootRunId
    return (
      this.runtimeEpoch === invocation.runtimeEpoch &&
      (Boolean(this.options.verifyTeamInvocation) || this.rootRunId === invocation.rootRunId)
    )
  }

  private receipt(record: AdmissionRecord): Record<string, unknown> {
    return {
      version: UAR_TOOL_ADMISSION_VERSION,
      admissionId: record.admissionId,
      invocationId: record.invocation.invocationId,
      runtimeEpoch: record.invocation.runtimeEpoch,
      hostEpoch: this.hostEpoch,
      authorityRevision: record.invocation.authorityRevision,
      managedMcpMetadata: true
    }
  }

  private preparation(record: AdmissionRecord): Record<string, unknown> {
    return {
      ...this.receipt(record),
      hostDisposition: record.hostDisposition,
      actionDisplay: record.actionDisplay
    }
  }

  private transition(record: AdmissionRecord, state: UarHostAdmissionState): void {
    if (record.state === state) return
    const snapshot = this.snapshot(record, state)
    this.options.persistLifecycle?.(snapshot)
    record.state = state
    record.updatedAt = snapshot.updatedAt
    this.options.onLifecycle?.(snapshot)
  }

  private snapshot(record: AdmissionRecord, state = record.state): UarHostAdmissionSnapshot {
    return {
      admissionId: record.admissionId,
      invocationId: record.invocation.invocationId,
      rootRunId: record.invocation.rootRunId,
      executingRunId: record.invocation.executingRunId,
      sessionId: this.options.sessionId ?? this.options.ownerId,
      ownerId: record.invocation.ownerId,
      workspace: record.invocation.workspace,
      hostEpoch: this.hostEpoch,
      toolName: record.invocation.providerToolName,
      state,
      hostDisposition: record.hostDisposition,
      actionDisplay: record.actionDisplay,
      updatedAt: state === record.state ? record.updatedAt : Date.now()
    }
  }

  private respond(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(value))
  }

  private effect(
    effectId: string,
    invocation: UarPreparedInvocation,
    hostDisposition: UarHostToolDisposition
  ): UarAuthorityEffect {
    return {
      effectId,
      invocation,
      trustedPrincipal: this.options.ownerId,
      trustedActor: this.options.verifyTeamInvocation ? invocation.principalId : this.options.principalId,
      trustedSessionId: this.options.sessionId ?? this.options.ownerId,
      trustedWorkspace: this.options.workspace,
      hostDisposition
    }
  }
}

function isPreparedInvocation(value: unknown): value is UarPreparedInvocation {
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

function argumentDigest(value: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

function validAuthorityEnvelope(invocation: UarPreparedInvocation): boolean {
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

function sameInvocation(left: UarPreparedInvocation, right: UarPreparedInvocation): boolean {
  return (
    left.invocationId === right.invocationId &&
    left.runtimeEpoch === right.runtimeEpoch &&
    left.hostEpoch === right.hostEpoch &&
    left.authorityRevision === right.authorityRevision &&
    left.payloadRevision === right.payloadRevision &&
    left.leaseRevision === right.leaseRevision &&
    left.budgetRevision === right.budgetRevision &&
    argumentDigest({ lease: left.lease, budgetReservation: left.budgetReservation }) ===
      argumentDigest({ lease: right.lease, budgetReservation: right.budgetReservation }) &&
    argumentDigest(left.validatedArguments) === argumentDigest(right.validatedArguments) &&
    validAuthorityEnvelope(right)
  )
}

function matchesReceipt(record: AdmissionRecord, receipt: Record<string, unknown>): boolean {
  return (
    receipt.version === UAR_TOOL_ADMISSION_VERSION &&
    receipt.admissionId === record.admissionId &&
    receipt.invocationId === record.invocation.invocationId &&
    receipt.runtimeEpoch === record.invocation.runtimeEpoch &&
    receipt.hostEpoch === record.invocation.hostEpoch &&
    receipt.authorityRevision === record.invocation.authorityRevision &&
    receipt.managedMcpMetadata === true
  )
}

function revisionDigest(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`
}

function composeDisposition(
  local: UarHostToolDisposition,
  authority: UarAuthorityDecision['disposition']
): UarHostToolDisposition {
  if (local === 'deny' || authority === 'deny') return 'deny'
  if (local === 'ask' || authority === 'challenge') return 'ask'
  return 'auto'
}

function authorityError(error: unknown): string {
  return error instanceof Error ? error.message : 'Host authority provider is unavailable'
}

function safeActionDisplay(invocation: UarPreparedInvocation): Record<string, unknown> {
  const target = safeTarget(invocation.validatedArguments)
  return {
    operation: invocation.nativeToolName,
    server: invocation.mountedServerId,
    ...(target ? { target } : {}),
    detailsAvailable: Boolean(target)
  }
}

function safeTarget(argumentsValue: Record<string, unknown>): string | undefined {
  for (const key of ['path', 'file_path', 'filePath', 'directory', 'root', 'uri', 'url']) {
    const value = argumentsValue[key]
    if (typeof value !== 'string' || !value.trim()) continue
    const trimmed = value.trim().slice(0, 512)
    if (key !== 'uri' && key !== 'url') return trimmed
    try {
      const parsed = new URL(trimmed)
      parsed.username = ''
      parsed.password = ''
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString()
    } catch {
      return undefined
    }
  }
  return undefined
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
