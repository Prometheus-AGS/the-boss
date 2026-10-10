import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { UarHostMcpBridge } from '../../src/main/ai/runtime/uar/UarHostMcpBridge'
import type { UarHostAdmissionSnapshot } from '../../src/main/ai/runtime/uar/UarHostToolAdmission'

type RecordValue = Record<string, any>
type Reply = { status: number; body: RecordValue }
type OwnerBinding = { httpStatus: number; persistedAuthorized: boolean; liveAuthorized: boolean; originalClaimUsable: boolean }
const progress = new Map([
  'missing_kind', 'unknown_kind', 'version_one', 'unknown_version', 'authentication_required',
  'substituted_kind', 'changed_arguments', 'changed_source', 'changed_revision', 'changed_run', 'changed_owner', 'changed_catalog',
  'receipt_missing_kind', 'receipt_unknown_kind', 'receipt_substituted_kind', 'receipt_version_one', 'receipt_revision',
  'prepared_finish', 'unclaimed_finish', 'native_current_policy_denied', 'concurrent_and_repeated_native_claim', 'mcp_kind_native_claim', 'native_kind_mcp_dispatch',
  'inactive_lease', 'expired_lease', 'inactive_budget', 'expired_budget', 'changed_budget_revision',
  'different_exact_approval', 'host_claim_persistence_failure', 'host_terminal_persistence_failure'
].map((category) => [category, 'unrun']))
let activeCategory: string | undefined
function begin(category: string) { activeCategory = category; progress.set(category, 'running') }
export function nativeHostProgress() {
  return [...progress].map(([category, status]) => ({ category,
    status: category === activeCategory && status === 'running' ? 'failed' : status }))
}

export function lifecycleFixture(directory: string) {
  const path = join(directory, 'host-lifecycle.json')
  const records = new Map<string, UarHostAdmissionSnapshot>()
  let fault: { id: string; state: string } | undefined
  let failures = 0
  return {
    persist(snapshot: UarHostAdmissionSnapshot) {
      if (fault?.id === snapshot.admissionId && fault.state === snapshot.state) {
        failures += 1
        throw new Error('Controlled host lifecycle persistence failure')
      }
      const next = new Map(records).set(snapshot.admissionId, snapshot)
      const pending = `${path}.pending`
      writeFileSync(pending, JSON.stringify([...next.values()]))
      const fd = openSync(pending, 'r')
      try { fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(pending, path)
      records.set(snapshot.admissionId, structuredClone(snapshot))
    },
    fail(id?: unknown, state = 'claimed') { fault = id === undefined ? undefined : { id: String(id), state } },
    failures: () => failures,
    state(id: unknown) {
      const stored = JSON.parse(readFileSync(path, 'utf8')) as UarHostAdmissionSnapshot[]
      return stored.find((entry) => entry.admissionId === id)?.state
    }
  }
}

export async function exerciseNativeHostCases(input: {
  bridge: UarHostMcpBridge
  invocation(): RecordValue
  post(operation: string, body: RecordValue): Promise<Reply>
  callManaged(prepared: RecordValue, value: RecordValue): Promise<unknown>
  effects(): number
  disposition(value: 'auto' | 'ask' | 'deny'): void
  store: ReturnType<typeof lifecycleFixture>
}) {
  const { bridge, post, store } = input
  const cases: Array<{ category: string; status: 'passed'; nativeConsumes: number; mcpEffects: number; ownerBinding?: OwnerBinding }> = []
  const initialEffects = input.effects()
  const native = (): RecordValue => sealHostInvocation({ ...input.invocation(), executionKind: 'runtime_native', mountedServerId: 'builtin',
    nativeToolName: 'search_tools', providerToolName: 'search_tools', validatedArguments: { query: 'gate-target' } })
  const prepared = async (value = native()) => {
    const preparation = await post('prepare', { invocation: value })
    assert.equal(preparation.status, 200)
    return { value, preparation: preparation.body }
  }
  const authorized = async (value = native()) => {
    const result = await prepared(value)
    const receipt = await post('resolve', { admissionId: result.preparation.admissionId,
      invocationId: value.invocationId, approved: true, localDisposition: 'allowed' })
    assert.equal(receipt.status, 200)
    assert.equal((await post('claim', { admissionId: result.preparation.admissionId, invocation: value, receipt: receipt.body })).status, 200)
    return { ...result, receipt: receipt.body, body: { admissionId: result.preparation.admissionId, invocation: value, receipt: receipt.body } }
  }
  const record = (category: string, nativeConsumes = 0, ownerBinding?: OwnerBinding) => {
    assert.equal(input.effects(), initialEffects)
    cases.push({ category, status: 'passed', nativeConsumes, mcpEffects: 0, ...(ownerBinding ? { ownerBinding } : {}) })
    progress.set(category, 'passed')
  }
  input.disposition('auto')
  for (const [category, patch] of [
    ['missing_kind', { executionKind: undefined }], ['unknown_kind', { executionKind: 'unrecognized' }],
    ['version_one', { version: 1 }], ['unknown_version', { version: 99 }]
  ] as const) {
    begin(category)
    assert.equal((await post('prepare', { invocation: { ...native(), ...patch } })).status, 422)
    record(category)
  }
  begin('authentication_required')
  const unauthorized = await fetch(`${bridge.toolAdmission.url}/prepare`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invocation: native() }) })
  assert.equal(unauthorized.status, 403)
  record('authentication_required')
  begin('prepared_finish')
  const unclaimed = await prepared()
  assert.equal((await post('finish', { admissionId: unclaimed.preparation.admissionId,
    invocationId: unclaimed.value.invocationId, outcome: 'succeeded' })).status, 409)
  assert.equal(store.state(unclaimed.preparation.admissionId), 'prepared')
  record('prepared_finish')
  const exact = await authorized()
  let ownerBinding: OwnerBinding | undefined
  for (const [category, patch] of [
    ['substituted_kind', { executionKind: 'host_mcp' }], ['changed_arguments', { validatedArguments: { query: 'changed' } }],
    ['changed_source', { mountedServerId: 'native_skill' }], ['changed_revision', { authorityRevision: 'changed' }],
    ['changed_run', { executingRunId: 'changed' }], ['changed_owner', { ownerId: `${exact.value.ownerId}:changed` }], ['changed_catalog', { catalogRevision: 'changed' }]
  ] as const) {
    begin(category)
    const refusal = await post('claim-native', { ...exact.body, invocation: { ...exact.value, ...patch } })
    assert.equal(refusal.status, 409)
    assert.equal(store.state(exact.preparation.admissionId), 'authorized')
    if (category === 'changed_owner') {
      ownerBinding = { httpStatus: refusal.status, persistedAuthorized: store.state(exact.preparation.admissionId) === 'authorized',
        liveAuthorized: bridge.approvalSnapshot().find((entry) => entry.admissionId === exact.preparation.admissionId)?.state === 'authorized',
        originalClaimUsable: false }
      assert(ownerBinding.liveAuthorized)
    }
    record(category, 0, category === 'changed_owner' ? ownerBinding : undefined)
  }
  for (const [category, patch] of [
    ['receipt_missing_kind', { executionKind: undefined }], ['receipt_unknown_kind', { executionKind: 'unrecognized' }],
    ['receipt_substituted_kind', { executionKind: 'host_mcp' }], ['receipt_version_one', { version: 1 }],
    ['receipt_revision', { authorityRevision: 'changed' }]
  ] as const) {
    begin(category)
    assert.equal((await post('claim-native', { ...exact.body, receipt: { ...exact.receipt, ...patch } })).status, 409)
    record(category)
  }
  begin('unclaimed_finish')
  assert.equal((await post('finish', { admissionId: exact.preparation.admissionId,
    invocationId: exact.value.invocationId, outcome: 'succeeded' })).status, 409)
  record('unclaimed_finish')
  begin('native_current_policy_denied')
  input.disposition('deny')
  assert.equal((await post('claim-native', exact.body)).status, 409)
  assert.equal(store.state(exact.preparation.admissionId), 'authorized')
  input.disposition('auto')
  record('native_current_policy_denied')
  begin('concurrent_and_repeated_native_claim')
  const concurrent = await Promise.all([post('claim-native', exact.body), post('claim-native', exact.body)])
  assert.deepEqual(concurrent.map((reply) => reply.status).sort(), [200, 409])
  assert.deepEqual(concurrent.find((reply) => reply.status === 200)?.body, exact.receipt)
  assert.equal(store.state(exact.preparation.admissionId), 'claimed')
  assert.equal((await post('claim-native', exact.body)).status, 409)
  assert(ownerBinding)
  ownerBinding.originalClaimUsable = true
  record('concurrent_and_repeated_native_claim', 1)
  begin('mcp_kind_native_claim')
  const crossMcp = await authorized(input.invocation())
  assert.equal((await post('claim-native', crossMcp.body)).status, 409)
  assert.equal(store.state(crossMcp.preparation.admissionId), 'authorized')
  record('mcp_kind_native_claim')
  begin('native_kind_mcp_dispatch')
  const crossNative = await authorized()
  await assert.rejects(() => input.callManaged(crossNative.preparation, crossNative.value.validatedArguments))
  assert.equal(store.state(crossNative.preparation.admissionId), 'invalidated')
  record('native_kind_mcp_dispatch')
  for (const [category, field, patch] of [
    ['inactive_lease', 'lease', { active: false }], ['expired_lease', 'lease', { expiresAt: 0 }],
    ['inactive_budget', 'budgetReservation', { active: false }], ['expired_budget', 'budgetReservation', { expiresAt: 0 }],
    ['changed_budget_revision', 'budgetReservation', { revision: 'changed' }]
  ] as const) {
    begin(category)
    const value = native()
    value[field] = { ...value[field], ...patch }
    sealHostInvocation(value)
    assert.equal((await post('prepare', { invocation: value })).status, 409)
    record(category)
  }
  begin('different_exact_approval')
  input.disposition('ask')
  const human = await prepared()
  const other = await prepared()
  assert(await bridge.recordHumanDecision(String(other.preparation.admissionId), true))
  assert.equal(await bridge.recordHumanDecision('unknown-exact-approval', true), false)
  assert.equal((await post('resolve', { admissionId: human.preparation.admissionId, invocationId: human.value.invocationId,
    approved: true, localDisposition: 'approved' })).status, 409)
  record('different_exact_approval')
  input.disposition('auto')
  begin('host_claim_persistence_failure')
  const persist = await authorized()
  store.fail(persist.preparation.admissionId)
  const failedBefore = store.failures()
  assert.equal((await post('claim-native', persist.body)).status, 503)
  assert.equal(store.failures() - failedBefore, 1)
  assert.equal(store.state(persist.preparation.admissionId), 'authorized')
  assert.equal(bridge.approvalSnapshot().find((entry) => entry.admissionId === persist.preparation.admissionId)?.state, 'authorized')
  store.fail()
  bridge.cancelAdmission(String(persist.preparation.admissionId))
  assert.equal((await post('claim-native', persist.body)).status, 409)
  record('host_claim_persistence_failure')
  begin('host_terminal_persistence_failure')
  const terminal = await authorized()
  assert.equal((await post('claim-native', terminal.body)).status, 200)
  store.fail(terminal.preparation.admissionId, 'succeeded')
  assert.equal((await post('finish', { admissionId: terminal.preparation.admissionId,
    invocationId: terminal.value.invocationId, outcome: 'succeeded' })).status, 500)
  assert.equal(store.state(terminal.preparation.admissionId), 'claimed')
  assert.equal((await post('claim-native', terminal.body)).status, 409)
  store.fail()
  record('host_terminal_persistence_failure', 1)
  return { syntheticAuthorityBindings: true, genuineNativeExecution: false, cases, caseCount: cases.length }
}

/** Synthetic host fixture with the current UAR authority envelope. */
export function sealHostInvocation(value: RecordValue): RecordValue {
  value.governancePolicyRevision ??= 'gate-governance-v1'
  value.resourceRevision ??= 'gate-resource-v1'
  value.grantRevision ??= 'gate-grant-v1'
  value.leaseRevision ??= 'gate-lease-v1'
  value.payloadRevision = fixtureRevision(value.validatedArguments)
  value.authorityRevision = fixtureRevision({
    executionKind: value.executionKind,
    principalId: value.principalId,
    ownerId: value.ownerId,
    rootRunId: value.rootRunId,
    executingRunId: value.executingRunId,
    runtimeEpoch: value.runtimeEpoch,
    hostEpoch: value.hostEpoch,
    catalogRevision: value.catalogRevision,
    runPolicyRevision: value.runPolicyRevision,
    expectedGovernancePolicyRevision: value.governancePolicyRevision,
    toolPolicyRevision: value.toolPolicyRevision,
    resourceRevision: value.resourceRevision,
    payloadRevision: value.payloadRevision,
    grantRevision: value.grantRevision,
    leaseRevision: value.leaseRevision,
    budgetRevision: value.budgetRevision,
    lease: value.lease,
    budgetReservation: value.budgetReservation
  })
  return value
}

function fixtureRevision(value: unknown): string {
  const canonicalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(canonicalize)
    if (!entry || typeof entry !== 'object') return entry
    return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, canonicalize(child)]))
  }
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`
}
