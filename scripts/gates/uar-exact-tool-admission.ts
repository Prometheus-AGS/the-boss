import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CallToolRequestSchema, LATEST_PROTOCOL_VERSION, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { createUarHostMcpBridge } from '../../src/main/ai/runtime/uar/UarHostMcpBridge'
import {
  UAR_TOOL_ADMISSION_META_KEY,
  UAR_TOOL_ADMISSION_VERSION,
  type UarHostToolDisposition
} from '../../src/main/ai/runtime/uar/UarHostToolAdmission'
import { exerciseNativeHostCases, lifecycleFixture, nativeHostProgress } from './bauar-native-host-cases'

type JsonRecord = Record<string, unknown>
type MatrixResult = { host: UarHostToolDisposition; local: 'auto' | 'ask' | 'deny'; result: string }

const ownerId = 'gate-a1-owner'

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'bauar-host-admission-'))
  const store = lifecycleFixture(workspace)
  let hostDisposition: UarHostToolDisposition = 'auto'
  let observedEffects = 0
  let holdResponse = false
  let markEffectStarted: (() => void) | undefined
  let releaseResponse: (() => void) | undefined
  const heldResponse = new Promise<void>((resolve) => { releaseResponse = resolve })
  const effectStarted = new Promise<void>((resolve) => { markEffectStarted = resolve })
  const filesystem = createFilesystemServer(async (admissionId) => {
    assert.equal(bridge.approvalSnapshot().find((entry) => entry.admissionId === admissionId)?.state, 'claimed')
    observedEffects += 1
    if (holdResponse) {
      markEffectStarted?.()
      await heldResponse
    }
  })
  const bridge = await createUarHostMcpBridge(
    { filesystem: { name: 'filesystem', instance: filesystem } },
    { ownerId, workspace, disposition: () => hostDisposition, persistLifecycle: store.persist }
  )
  const mounted = bridge.servers[0]
  assert(mounted)
  const client = new Client({ name: 'gate-a1', version: '1.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(mounted.url), {
    requestInit: { headers: mounted.headers }
  })

  try {
    await client.connect(transport)
    let ordinal = 0
    const preparedInvocations = new Map<unknown, JsonRecord>()
    const invocation = (
      argumentsValue: JsonRecord = { path: '/gate-a1/workspace/file.txt', content: 'protected' }
    ): JsonRecord => {
      ordinal += 1
      return {
        version: UAR_TOOL_ADMISSION_VERSION,
        executionKind: 'host_mcp',
        invocationId: `gate-a1-invocation-${ordinal}`,
        modelToolCallId: `model-call-${ordinal}`,
        attempt: 1,
        rootRunId: 'gate-a1-root',
        executingRunId: 'gate-a1-root',
        ownerId,
        principalId: ownerId,
        workspace,
        runtimeEpoch: 'gate-a1-runtime',
        hostEpoch: bridge.toolAdmission.hostEpoch,
        authorityRevision: `gate-a1-authority-${ordinal}`,
        budgetRevision: 'gate-a1-budget-v1',
        lease: { leaseId: `gate-a1-lease-${ordinal}`, task: 'gate-a1-root', active: true, attempt: 1, epoch: 'gate-a1-runtime', holder: ownerId,
          expiresAt: Math.floor(Date.now() / 1_000) + 600 },
        budgetReservation: { reservationId: `gate-a1-reservation-${ordinal}`, budgetId: 'gate-a1-budget', active: true, amount: 1, unit: 'tool_call', revision: 'gate-a1-budget-v1',
          expiresAt: Math.floor(Date.now() / 1_000) + 600 },
        catalogRevision: 'catalog-v1',
        mountedServerId: 'filesystem',
        nativeToolName: 'write_file',
        providerToolName: 'filesystem__write_file',
        runPolicyRevision: 'run-policy-v1',
        toolPolicyRevision: 'tool-policy-v1',
        approvalClass: 'not_required',
        callIndex: ordinal,
        validatedArguments: argumentsValue
      }
    }
    const post = async (operation: string, body: JsonRecord): Promise<{ status: number; body: JsonRecord }> => {
      const response = await fetch(`${bridge.toolAdmission.url}/${operation}`, {
        method: 'POST',
        headers: { ...bridge.toolAdmission.headers, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      const text = await response.text()
      return { status: response.status, body: text ? JSON.parse(text) as JsonRecord : {} }
    }
    const prepare = async (value: JsonRecord): Promise<JsonRecord> => {
      const result = await post('prepare', { invocation: value })
      assert.equal(result.status, 200)
      assert.equal(result.body.invocationId, value.invocationId)
      assert.equal(result.body.executionKind, value.executionKind)
      assert.equal(result.body.hostEpoch, bridge.toolAdmission.hostEpoch)
      assert.equal(result.body.authorityRevision, value.authorityRevision)
      preparedInvocations.set(result.body.admissionId, structuredClone(value))
      assert(!JSON.stringify(result.body.actionDisplay).includes('protected'))
      return result.body
    }
    const resolve = async (
      prepared: JsonRecord,
      localDisposition: 'allowed' | 'approved' | 'denied',
      approved: boolean
    ): Promise<{ status: number; body: JsonRecord }> => {
      const result = await post('resolve', {
        admissionId: prepared.admissionId,
        invocationId: prepared.invocationId,
        localDisposition,
        approved
      })
      if (approved && result.status === 200) {
        const before = observedEffects
        const checked = await post('claim', { admissionId: prepared.admissionId,
          invocation: preparedInvocations.get(prepared.admissionId), receipt: result.body })
        assert.equal(checked.status, 200)
        assert.deepEqual(checked.body, result.body)
        assert.equal(observedEffects, before)
        assert.equal(bridge.approvalSnapshot().find((entry) => entry.admissionId === prepared.admissionId)?.state, 'authorized')
      }
      return result
    }
    const callManaged = (prepared: JsonRecord, value: JsonRecord) =>
      client.callTool({
        name: 'write_file',
        arguments: value,
        _meta: {
          [UAR_TOOL_ADMISSION_META_KEY]: {
            version: UAR_TOOL_ADMISSION_VERSION,
            executionKind: prepared.executionKind,
            admissionId: prepared.admissionId,
            invocationId: prepared.invocationId,
            runtimeEpoch: 'gate-a1-runtime',
            hostEpoch: bridge.toolAdmission.hostEpoch,
            authorityRevision: prepared.authorityRevision
          }
        }
      })

    const nativeCases = await exerciseNativeHostCases({ bridge, invocation, post, callManaged,
      effects: () => observedEffects, disposition: (value) => { hostDisposition = value }, store })
    const matrix: MatrixResult[] = []
    for (const host of ['auto', 'ask', 'deny'] as const) {
      for (const local of ['auto', 'ask', 'deny'] as const) {
        hostDisposition = host
        const prepared = await prepare(invocation())
        if (host === 'deny') {
          assert.equal(prepared.hostDisposition, 'deny')
          matrix.push({ host, local, result: 'denied' })
          continue
        }
        if (local === 'deny') {
          const denied = await resolve(prepared, 'denied', false)
          assert.equal(denied.status, 200)
          assert.equal(denied.body.state, 'denied')
          matrix.push({ host, local, result: 'denied' })
          continue
        }
        const needsHuman = host === 'ask' || local === 'ask'
        if (needsHuman) assert(bridge.recordHumanDecision(String(prepared.admissionId), true))
        const authorized = await resolve(prepared, needsHuman ? 'approved' : 'allowed', true)
        assert.equal(authorized.status, 200)
        assert.equal(authorized.body.admissionId, prepared.admissionId)
        matrix.push({ host, local, result: needsHuman ? 'approved' : 'authorized' })
      }
    }

    hostDisposition = 'auto'
    const identicalArguments = { path: '/gate-a1/workspace/same.txt', content: 'same' }
    const claimCase = invocation(identicalArguments)
    const claimPrepared = await prepare(claimCase)
    const claimReceipt = { version: claimPrepared.version, executionKind: claimPrepared.executionKind,
      admissionId: claimPrepared.admissionId,
      invocationId: claimPrepared.invocationId, runtimeEpoch: claimPrepared.runtimeEpoch,
      hostEpoch: claimPrepared.hostEpoch, authorityRevision: claimPrepared.authorityRevision, managedMcpMetadata: true }
    const claimBody = { admissionId: claimPrepared.admissionId, invocation: claimCase, receipt: claimReceipt }
    assert.equal((await post('claim', claimBody)).status, 409)
    assert.equal((await resolve(claimPrepared, 'allowed', true)).status, 200)
    assert.equal((await post('claim', { ...claimBody, invocation: { ...claimCase, authorityRevision: 'changed' } })).status, 409)
    assert.equal((await post('claim', { ...claimBody, receipt: { ...claimReceipt, authorityRevision: 'changed' } })).status, 409)
    hostDisposition = 'deny'
    assert.equal((await post('claim', claimBody)).status, 409)
    hostDisposition = 'auto'
    assert.equal((await post('claim', claimBody)).status, 200)
    bridge.cancelAdmission(String(claimPrepared.admissionId), String(claimPrepared.invocationId))
    assert.equal((await post('claim', claimBody)).status, 409)
    assert.equal(observedEffects, 0)
    const missingRevision = invocation()
    delete missingRevision.authorityRevision
    assert.equal((await post('prepare', { invocation: missingRevision })).status, 422)
    const expired = invocation(identicalArguments)
    ;(expired.lease as JsonRecord).expiresAt = 0
    const expiredPrepared = await prepare(expired)
    const expiredReceipt = await post('resolve', { admissionId: expiredPrepared.admissionId,
      invocationId: expiredPrepared.invocationId, localDisposition: 'allowed', approved: true })
    assert.equal(expiredReceipt.status, 200)
    assert.equal((await post('claim', { admissionId: expiredPrepared.admissionId,
      invocation: expired, receipt: expiredReceipt.body })).status, 409)
    await assert.rejects(() => callManaged(expiredPrepared, identicalArguments))
    const metadataMismatch = await prepare(invocation(identicalArguments))
    assert.equal((await resolve(metadataMismatch, 'allowed', true)).status, 200)
    await assert.rejects(() => callManaged({ ...metadataMismatch, authorityRevision: 'changed' }, identicalArguments))
    assert.equal(observedEffects, 0)
    const first = await prepare(invocation(identicalArguments))
    const second = await prepare(invocation(identicalArguments))
    assert.notEqual(first.admissionId, second.admissionId)
    const firstReceipt = await resolve(first, 'allowed', true)
    assert.equal(firstReceipt.status, 200)
    assert.equal((await resolve(second, 'allowed', true)).status, 200)
    await callManaged(first, identicalArguments)
    assert.equal(observedEffects, 1)
    assert.equal((await post('claim', { admissionId: first.admissionId,
      invocation: preparedInvocations.get(first.admissionId), receipt: firstReceipt.body })).status, 409)
    await assert.rejects(() => callManaged(first, identicalArguments))
    await callManaged(second, identicalArguments)
    assert.equal(observedEffects, 2)

    const concurrent = await prepare(invocation(identicalArguments))
    assert.equal((await resolve(concurrent, 'allowed', true)).status, 200)
    const beforeConcurrent = observedEffects
    const concurrentResults = await Promise.allSettled([
      callManaged(concurrent, identicalArguments),
      callManaged(concurrent, identicalArguments)
    ])
    assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1)
    for (const result of concurrentResults) {
      if (result.status === 'rejected') assert.match(String(result.reason), /not executable/)
    }
    assert.equal(observedEffects - beforeConcurrent, 1)
    assert.equal(bridge.approvalSnapshot().find((entry) => entry.admissionId === concurrent.admissionId)?.state, 'claimed')

    const mismatchArguments = { path: '/gate-a1/workspace/mismatch.txt', content: 'original' }
    const mismatch = await prepare(invocation(mismatchArguments))
    assert.equal((await resolve(mismatch, 'allowed', true)).status, 200)
    await assert.rejects(() =>
      callManaged(mismatch, { path: '/gate-a1/workspace/mismatch.txt', content: 'changed' })
    )
    await assert.rejects(() => client.callTool({ name: 'write_file', arguments: {} }))

    const batch = await fetch(mounted.url, {
      method: 'POST',
      headers: {
        ...mounted.headers,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify([{ jsonrpc: '2.0', id: 'batch', method: 'tools/call', params: {} }])
    })
    assert.match(await batch.text(), /Batch tools\/call is not supported/)

    const incompatible = invocation()
    incompatible.version = 1
    assert.equal((await post('prepare', { invocation: incompatible })).status, 422)

    const lost = await prepare(invocation(identicalArguments))
    assert.equal((await resolve(lost, 'allowed', true)).status, 200)
    assert(transport.sessionId)
    const beforeLost = observedEffects
    holdResponse = true
    const disconnect = new AbortController()
    const lostResponse = fetch(mounted.url, {
      method: 'POST',
      signal: disconnect.signal,
      headers: {
        ...mounted.headers,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': transport.sessionId,
        'mcp-protocol-version': LATEST_PROTOCOL_VERSION
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'lost-effect-response', method: 'tools/call',
        params: {
          name: 'write_file', arguments: identicalArguments,
          _meta: {
            [UAR_TOOL_ADMISSION_META_KEY]: {
              version: UAR_TOOL_ADMISSION_VERSION, executionKind: lost.executionKind, admissionId: lost.admissionId,
              invocationId: lost.invocationId, runtimeEpoch: 'gate-a1-runtime', hostEpoch: bridge.toolAdmission.hostEpoch,
              authorityRevision: lost.authorityRevision
            }
          }
        }
      })
    }).then((response) => response.text()).then(() => 'received', () => 'lost')
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        effectStarted,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error('Lost-response effect did not start')), 30_000)
        })
      ])
      assert.equal(observedEffects - beforeLost, 1)
      disconnect.abort()
      assert.equal(await lostResponse, 'lost')
    } finally {
      if (deadline) clearTimeout(deadline)
      disconnect.abort()
      releaseResponse?.()
    }
    await assert.rejects(() => callManaged(lost, identicalArguments))
    assert.equal(observedEffects - beforeLost, 1)
    await bridge.close()
    assert.equal(bridge.approvalSnapshot().find((entry) => entry.admissionId === lost.admissionId)?.state, 'outcome-unknown')

    const report = {
      gate: 'A1',
      protocolVersion: UAR_TOOL_ADMISSION_VERSION,
      productionBridge: true,
      nativeCases,
      matrix,
      identicalCalls: { distinctAdmissions: true, replayRejected: true },
      claimRevalidation: { nonConsuming: true, exactBinding: true, pendingCancelledConsumedRejected: true, currentPolicy: true,
        expiredLeaseRejected: true, metadataRevisionRejected: true },
      concurrentDuplicate: { exactlyOneEffect: true, oneRejected: true },
      lostResponse: { effectObserved: true, replayRejected: true, teardownState: 'outcome-unknown' },
      mismatchRejected: true,
      identityFreeRejected: true,
      batchRejected: true,
      incompatibleVersionRejected: true,
      safeProjection: true,
      toolEffectObserved: true
    }
    const evidencePath = process.argv[2]
    if (evidencePath) {
      await mkdir(dirname(evidencePath), { recursive: true })
      await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    }
    console.log(JSON.stringify(report))
  } finally {
    releaseResponse?.()
    await Promise.allSettled([client.close(), bridge.close()])
  }
}

function createFilesystemServer(onEffect: (admissionId: string) => Promise<void>): McpServer {
  const server = new McpServer({ name: 'filesystem', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'write_file',
        description: 'Gate A1 filesystem effect',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content']
        }
      }
    ]
  }))
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const meta = request.params._meta?.[UAR_TOOL_ADMISSION_META_KEY] as { admissionId?: unknown } | undefined
    assert.equal(typeof meta?.admissionId, 'string')
    await onEffect(meta!.admissionId as string)
    return { content: [{ type: 'text', text: JSON.stringify({ wrote: request.params.arguments?.path }) }] }
  })
  return server
}

void main().catch(() => {
  process.stderr.write(`${JSON.stringify({ nativeCases: nativeHostProgress() })}\n`)
  process.stderr.write('Host admission gate failed; inspect isolated evidence.\n')
  process.exitCode = 1
})
