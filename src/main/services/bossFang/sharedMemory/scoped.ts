import { createHash } from 'node:crypto'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'

import { admittedHostInvocation } from '@main/ai/runtime/uar/uarHostInvocation'
import { uarPrincipalForSession } from '@main/ai/runtime/uar/uarPrincipal'
import { t } from '@main/i18n'

import { memoryCall, type MemoryConnection } from './connection'

export type MemoryIdentity = { workspaceId: string; agentId: string; teamId?: string }
const visibility = z.enum(['workspace', 'team', 'private']).default('workspace')
const remember = z.object({ content: z.string().min(1).max(100_000), scope: visibility }).strict()
const retrieve = z.object({ id: z.string().min(1).max(1024), scope: visibility }).strict()
const search = z
  .object({
    query: z.string().min(1).max(4096),
    limit: z.number().int().min(1).max(100).default(10),
    scope: visibility
  })
  .strict()
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const sharedMemoryTools = [
  'shared_memory__shared_memory_remember',
  'shared_memory__shared_memory_retrieve',
  'shared_memory__shared_memory_search'
]

function boundScope(identity: MemoryIdentity, scope: z.infer<typeof visibility>) {
  if (scope === 'team' && !identity.teamId) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
  return {
    user_id: uarPrincipalForSession('shared-memory'),
    session_id: 'boss.workspace.' + digest(identity.workspaceId),
    agent_id:
      scope === 'workspace'
        ? 'boss.shared.workspace'
        : scope === 'team'
          ? 'boss.team.' + digest(identity.teamId!)
          : 'boss.private.' + digest(identity.agentId)
  }
}
function isScoped(value: unknown, scope: ReturnType<typeof boundScope>): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.entries(scope).every(([key, expected]) => (value as Record<string, unknown>)[key] === expected)
  )
}
function publicMemory(value: Record<string, unknown>) {
  const { embedding: _, user_id: _user, session_id: _session, agent_id: _agent, ...record } = value
  return record
}

export async function scopedMemoryOperation(
  connection: MemoryConnection,
  identity: MemoryIdentity,
  operation: string,
  args: unknown
) {
  const parsed =
    operation === 'remember'
      ? remember.parse(args)
      : operation === 'retrieve'
        ? retrieve.parse(args)
        : operation === 'search'
          ? search.parse(args)
          : undefined
  if (!parsed) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
  const scope = boundScope(identity, parsed.scope)
  const value =
    operation === 'remember'
      ? await memoryCall(connection, 'add_memory', { content: (parsed as z.infer<typeof remember>).content, ...scope })
      : operation === 'retrieve'
        ? await memoryCall(connection, 'get_memory', { id: (parsed as z.infer<typeof retrieve>).id })
        : await memoryCall(connection, 'search_memories', {
            query: (parsed as z.infer<typeof search>).query,
            limit: (parsed as z.infer<typeof search>).limit,
            ...scope
          })
  let result: unknown
  if (operation === 'search') {
    if (!Array.isArray(value)) throw new Error(t('bossfang.sharedMemoryInvalidResponse'))
    result = value.filter((entry) => isScoped(entry, scope)).map(publicMemory)
  } else {
    if (!isScoped(value, scope)) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
    result = publicMemory(value)
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ scope: parsed.scope, workspaceId: identity.workspaceId, memory: result })
      }
    ]
  }
}

/** Identity is supplied by the admitted invocation, never by model arguments. */
export function createSharedMemoryServer(connection: MemoryConnection, workspaceId: string, teamId?: string) {
  const server = new Server({ name: 'shared-memory', version: '1.0.0' }, { capabilities: { tools: {} } })
  const scope = {
    type: 'string',
    enum: teamId ? ['workspace', 'team', 'private'] : ['workspace', 'private'],
    default: 'workspace'
  }
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'shared_memory_remember',
        description:
          'Remember in the selected Surreal Memory service. Workspace memories are shared with authorized agents; private memories belong only to this agent.',
        inputSchema: {
          type: 'object',
          properties: { content: { type: 'string' }, scope },
          required: ['content'],
          additionalProperties: false
        }
      },
      {
        name: 'shared_memory_retrieve',
        description: 'Retrieve a previously returned memory ID in the selected scope.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, scope },
          required: ['id'],
          additionalProperties: false
        }
      },
      {
        name: 'shared_memory_search',
        description: 'Search scoped shared memory, including memories stored before restart.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, scope },
          required: ['query'],
          additionalProperties: false
        }
      }
    ]
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const invocation = admittedHostInvocation.getStore()
      if (!invocation) throw new Error(t('bossfang.sharedMemoryScopeDenied'))
      return await scopedMemoryOperation(
        connection,
        { workspaceId, agentId: invocation.principalId, teamId },
        request.params.name.replace(/^shared_memory_/, ''),
        request.params.arguments
      )
    } catch (error) {
      return {
        isError: true,
        content: [
          { type: 'text', text: error instanceof Error ? error.message : t('bossfang.sharedMemoryUnavailable') }
        ]
      }
    }
  })
  return server
}
