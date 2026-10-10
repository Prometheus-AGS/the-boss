import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname } from 'node:path'

import { exercisePostAckCases, postAckCaseProgress } from './bauar-post-ack-cases'
import type { NativeFaultConversation } from './bauar-native-desktop-cases'
import { launchProjectionDesktop } from './bauar-secret-projection-launch'
import { startProjectionMcp } from './bauar-secret-projection-mcp'
import type { ProjectionProviderConversation } from './bauar-secret-projection-provider'
import { registrationErrorDiagnostic } from './bauar-secret-projection-turn'

const state = { stage: 'configuration', providerRequests: 0, authenticatedRequests: 0, fixtureFailures: 0,
  httpStatuses: { success: 0, rejected: 0, failed: 0 }, fixtureCleanupConfirmed: false }
let failure: ReturnType<typeof registrationErrorDiagnostic> | undefined

async function main(): Promise<void> {
  const gateSidecar = process.env.THE_BOSS_UAR_POST_ACK_SIDECAR_PATH
  const gateArtifactManifest = process.env.THE_BOSS_UAR_POST_ACK_MANIFEST_PATH
  assert(gateSidecar && gateArtifactManifest, 'Post-ack artifact and manifest inputs are required')
  const canary = `${randomUUID()}-projection-credential`
  let conversation: NativeFaultConversation | ProjectionProviderConversation | undefined
  state.stage = 'mcp_fixture'
  const mcp = await startProjectionMcp(canary, 'deferred')
  const provider = createServer((request, response) => {
    response.once('finish', () => {
      if (response.statusCode >= 500) state.httpStatuses.failed += 1
      else if (response.statusCode >= 400) state.httpStatuses.rejected += 1
      else state.httpStatuses.success += 1
    })
    const dispatch = async () => {
      if (request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ data: [{ id: 'projection-model' }] }))
        return
      }
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        response.writeHead(404).end()
        return
      }
      state.providerRequests += 1
      if (request.headers.authorization !== `Bearer ${canary}`) { response.writeHead(403).end(); return }
      state.authenticatedRequests += 1
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const step = conversation?.next(body)
      if (step?.kind === 'failure') {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: step.category, type: 'invalid_request_error' } }))
        return
      }
      const event = (delta: object, finishReason: string | null) => `data: ${JSON.stringify({
        id: 'projection-reply', object: 'chat.completion.chunk', created: 1, model: body.model,
        choices: [{ index: 0, delta, finish_reason: finishReason }]
      })}\n\n`
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      if (step?.kind === 'call') {
        response.end(event({ role: 'assistant', tool_calls: [{ index: 0, id: step.call.id, type: 'function',
          function: { name: step.call.name, arguments: step.call.arguments }
        }] }, null) + event({}, 'tool_calls') + 'data: [DONE]\n\n')
        return
      }
      for (const delta of [
        { role: 'assistant', reasoning_content: 'Benign reasoning ' }, { reasoning_content: 'marker.' },
        { content: 'Benign projection ' }, { content: 'gate marker.' }
      ]) {
        response.write(event(delta, null))
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      response.end(event({}, 'stop') + 'data: [DONE]\n\n')
    }
    void dispatch().catch(() => {
      state.fixtureFailures += 1
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' })
      response.end()
    })
  })
  let listening = false
  let result: Awaited<ReturnType<typeof exercisePostAckCases>> | undefined
  try {
    state.stage = 'provider_fixture'
    await new Promise<void>((resolve, reject) => {
      provider.once('error', reject)
      provider.listen(0, '127.0.0.1', resolve)
    })
    listening = true
    const address = provider.address()
    assert(address && typeof address !== 'string')
    state.stage = 'post_ack_cases'
    result = await exercisePostAckCases({ launch: launchProjectionDesktop, gateSidecar, gateArtifactManifest,
      baseUrl: `http://127.0.0.1:${address.port}/v1`, canary, mcpUrl: mcp.url,
      targetEffects: () => mcp.calls.length, conversation: (value) => { conversation = value } })
    assert.equal(result.cases.length, 2)
    assert(result.cases.every((entry) => entry.status === 'passed' && entry.cleanupConfirmed))
    assert.equal(state.authenticatedRequests, state.providerRequests)
    assert.equal(state.fixtureFailures, 0)
    assert.equal(state.httpStatuses.rejected, 0)
    assert.equal(state.httpStatuses.failed, 0)
    assert.equal(mcp.calls.length, 0)
    assert.equal(mcp.fillerCalls(), 0)
  } catch (error) { failure = registrationErrorDiagnostic(error); throw error }
  finally {
    conversation = undefined
    const closed = await Promise.allSettled([mcp.close(), (async () => {
      provider.closeAllConnections()
      if (listening) await new Promise<void>((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()))
    })()])
    if (closed.some((entry) => entry.status === 'rejected')) throw new Error('Post-ack fixture cleanup failed')
    state.fixtureCleanupConfirmed = true
  }
  assert(result)
  const receipt = { gate: 'BAUAR focused post-ack', boundary: 'real Electron, authenticated UAR, provider and MCP',
    ...result, fixture: state, ordinaryCasesRepeated: 0 }
  if (process.argv[2]) {
    await mkdir(dirname(process.argv[2]), { recursive: true })
    await writeFile(process.argv[2], `${JSON.stringify(receipt, null, 2)}\n`)
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
}

void main().catch((error) => {
  failure ??= registrationErrorDiagnostic(error)
  process.stderr.write(`${JSON.stringify({ gate: 'BAUAR focused post-ack', status: 'failed', failure,
    fixture: state, postAckCases: postAckCaseProgress() })}\n`)
  process.exitCode = 1
})
