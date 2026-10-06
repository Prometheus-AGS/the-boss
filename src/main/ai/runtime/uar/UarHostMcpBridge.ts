import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

import type { AgentMcpServer } from '@main/ai/runtime/agentMcpServers'

import {
  UAR_TOOL_ADMISSION_PATH,
  UAR_TOOL_ADMISSION_VERSION,
  UarHostToolAdmission,
  type UarHostAdmissionSnapshot,
  type UarHostAdmissionState,
  type UarHostToolAdmissionOptions
} from './UarHostToolAdmission'

export interface UarRunMcpServer {
  name: string
  url: string
  headers: Record<string, string>
}

export interface UarHostMcpBridge {
  servers: readonly UarRunMcpServer[]
  toolAdmission: {
    version: number
    hostEpoch: string
    url: string
    headers: Record<string, string>
  }
  redactions: readonly string[]
  recordHumanDecision(admissionId: string, approved: boolean): Promise<boolean>
  cancelAdmission(
    admissionId: string,
    invocationId?: string,
    reason?: 'cancelled' | 'invalidated'
  ): UarHostAdmissionState | undefined
  approvalSnapshot(): UarHostAdmissionSnapshot[]
  close(): Promise<void>
}

type McpInstance = Pick<AgentMcpServer['instance'], 'connect' | 'close'>
type HostServer = { name: string } & ({ instance: McpInstance } | { createInstance: () => McpInstance })
type ClientSession = { instance: McpInstance; transport: StreamableHTTPServerTransport }

type MountedServer = {
  path: string
  server: HostServer
  transport?: StreamableHTTPServerTransport
  sessions: Map<string, ClientSession>
  ownedSessions: Set<ClientSession>
}

export async function createUarHostMcpBridge(
  servers: Record<string, MountedServer['server']>,
  admissionOptions: UarHostToolAdmissionOptions,
  onError: (error: unknown) => void = () => undefined
): Promise<UarHostMcpBridge> {
  const token = randomBytes(32).toString('base64url')
  const mounted = await connectServers(servers, token)
  const routes = new Map(mounted.map((entry) => [entry.path, entry]))
  const admissions = new UarHostToolAdmission(admissionOptions)
  let expectedHost = ''
  const httpServer = createServer((request, response) => {
    void handleRequest(request, response, expectedHost, token, routes, admissions).catch((error) => {
      onError(error)
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })

  try {
    const port = await listen(httpServer)
    expectedHost = `127.0.0.1:${port}`
    const admissionUrl = `http://${expectedHost}${UAR_TOOL_ADMISSION_PATH}`
    return {
      servers: mounted.map((entry) => ({
        name: entry.server.name,
        url: `http://${expectedHost}${entry.path}`,
        headers: { Authorization: `Bearer ${token}` }
      })),
      toolAdmission: {
        version: UAR_TOOL_ADMISSION_VERSION,
        hostEpoch: admissions.hostEpoch,
        url: admissionUrl,
        headers: { Authorization: `Bearer ${token}` }
      },
      redactions: [token, admissionUrl, ...mounted.map((entry) => `http://${expectedHost}${entry.path}`)],
      recordHumanDecision: (admissionId, approved) => admissions.recordHumanDecision(admissionId, approved),
      cancelAdmission: (admissionId, invocationId, reason) =>
        admissions.cancelAdmission(admissionId, invocationId, reason),
      approvalSnapshot: () => admissions.snapshots(),
      close: async () => {
        admissions.invalidateForTeardown(onError)
        await closeBridge(httpServer, mounted)
      }
    }
  } catch (error) {
    await closeBridge(httpServer, mounted)
    throw error
  }
}

async function connectServers(
  servers: Record<string, MountedServer['server']>,
  token: string
): Promise<MountedServer[]> {
  const mounted: MountedServer[] = []
  try {
    for (const [serverId, server] of Object.entries(servers)) {
      const entry: MountedServer = {
        path: `/mcp/${createHash('sha256').update(`${token}\0${serverId}`).digest('hex')}`,
        server,
        sessions: new Map(),
        ownedSessions: new Set()
      }
      mounted.push(entry)
      if ('instance' in server) {
        entry.transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID })
        await server.instance.connect(entry.transport)
      }
    }
    return mounted
  } catch (error) {
    await closeMountedServers(mounted)
    throw error
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  expectedHost: string,
  token: string,
  routes: ReadonlyMap<string, MountedServer>,
  admissions: UarHostToolAdmission
): Promise<void> {
  const remoteAddress = request.socket.remoteAddress
  if (
    remoteAddress !== '127.0.0.1' ||
    request.headers.host !== expectedHost ||
    request.headers.origin !== undefined ||
    !matchesBearerToken(request.headers.authorization, token)
  ) {
    response.writeHead(403)
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${expectedHost}`)
  const body = request.method === 'POST' ? await readJsonBody(request) : undefined
  if (await admissions.handleHttp(request.method, url.pathname, body, response)) return
  const mounted = !url.search && routes.get(url.pathname)
  if (!mounted) {
    response.writeHead(404)
    response.end()
    return
  }
  const transport = await clientTransport(mounted, request, response, body)
  if (!transport) return
  const claim = admissions.claimToolCall(body, mounted.server.name)
  if (claim.error) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: claim.call?.id ?? null,
        error: { code: -32_003, message: claim.error }
      })
    )
    return
  }
  try {
    await transport.handleRequest(request, response, body)
  } finally {
    // A rejected initialize owns no resumable session.
    if ('createInstance' in mounted.server && !transport.sessionId) {
      const session = [...mounted.ownedSessions].find((entry) => entry.transport === transport)
      if (session) {
        mounted.ownedSessions.delete(session)
        await session.instance.close()
      }
    }
  }
}

async function clientTransport(
  mounted: MountedServer,
  request: IncomingMessage,
  response: ServerResponse,
  body: unknown
): Promise<StreamableHTTPServerTransport | undefined> {
  if (mounted.transport) return mounted.transport
  const sessionId = request.headers['mcp-session-id']
  if (typeof sessionId === 'string') {
    const session = mounted.sessions.get(sessionId)
    if (session) return session.transport
    response.writeHead(404)
    response.end()
    return
  }
  if (sessionId !== undefined || request.method !== 'POST' || !isInitializeRequest(body)) {
    response.writeHead(400)
    response.end()
    return
  }
  if (!('createInstance' in mounted.server)) return
  const instance = mounted.server.createInstance()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (id) => {
      mounted.sessions.set(id, session)
    }
  })
  const session: ClientSession = { instance, transport }
  mounted.ownedSessions.add(session)
  transport.onclose = () => {
    if (transport.sessionId && mounted.sessions.get(transport.sessionId) === session) {
      mounted.sessions.delete(transport.sessionId)
    }
    mounted.ownedSessions.delete(session)
  }
  try {
    await instance.connect(transport)
    return transport
  } catch (error) {
    mounted.ownedSessions.delete(session)
    await instance.close()
    throw error
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 8 * 1024 * 1024) throw new Error('UAR host MCP request body exceeds 8 MiB')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function matchesBearerToken(authorization: string | undefined, token: string): boolean {
  if (!authorization?.startsWith('Bearer ')) return false
  const actual = Buffer.from(authorization.slice(7))
  const expected = Buffer.from(token)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('UAR host MCP bridge did not receive a TCP address'))
        return
      }
      resolve(address.port)
    })
  })
}

async function closeBridge(server: Server, mounted: readonly MountedServer[]): Promise<void> {
  server.closeAllConnections()
  await Promise.allSettled([closeHttpServer(server), closeMountedServers(mounted)])
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve) => server.close(() => resolve()))
}

async function closeMountedServers(mounted: readonly MountedServer[]): Promise<void> {
  await Promise.allSettled(
    mounted.flatMap((entry) =>
      'instance' in entry.server
        ? [entry.server.instance.close()]
        : [...entry.ownedSessions].map((session) => session.instance.close())
    )
  )
}
