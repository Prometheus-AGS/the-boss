import * as z from 'zod'

import { application } from '@application'
import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import type {
  UarDurableBinding,
  UarDurableCommand,
  UarDurableInstance,
  UarDurableObserver,
  UarDurableOperation,
  UarDurableWorkspaceSnapshot,
  UarInstanceAction,
  UarInstanceProfile,
  UarObserverAction
} from '@shared/types/uarDurableAdministration'

import { readUarAdministrationSnapshot } from './UarAdministrationAdapter'
import { projectBinding, rawBinding } from './uarBindingPosture'
import { projectInstance, projectObserver } from './uarDurableProjections'
import { uarPrincipalForSession } from './uarPrincipal'
import type { UarSidecarEndpoint } from './UarSidecarService'

export { rawBinding } from './uarBindingPosture'

const instancePath = '/api/uar/agent-instances/v1'
const observerPath = '/api/uar/observers/v1'
const bindingPath = '/api/v1/collaboration/deployment-bindings'

const operations = [
  'collaboration.capabilities',
  'collaboration.packages.list',
  'collaboration.packages.preflight',
  'collaboration.packages.install',
  'collaboration.deployment_bindings.preflight',
  'collaboration.deployment_bindings.install',
  'collaboration.deployment_bindings.list',
  'agent-instances.list',
  'agent-instances.read',
  'agent-instances.create',
  'agent-instances.turn',
  'agent-instances.activate',
  'agent-instances.passivate',
  'agent-instances.drain',
  'agent-instances.disable',
  'agent-instances.restart',
  'agent-instances.cancel',
  'observers.list',
  'observers.read',
  'observers.create',
  'observers.pause',
  'observers.resume',
  'observers.gap.acknowledge'
] as const satisfies readonly UarDurableOperation[]

export function workspace(workspaceId: string): string {
  // The renderer supplies a selector. Main resolves it against Boss's user-workspace store.
  return agentWorkspaceService.getById(workspaceId).id
}

export async function capabilityState(endpoint?: UarSidecarEndpoint) {
  const snapshot = await readUarAdministrationSnapshot(endpoint)
  const entries = operations.map((id) => {
    const surface = snapshot.surfaces.find((candidate) => candidate.methods.some((method) => method.id === id))
    const method = surface?.methods.find((candidate) => candidate.id === id)
    const available =
      surface?.availability === 'available' && method?.adapter === 'available' && method.apply !== 'unavailable'
    return [
      id,
      {
        available,
        ...(available
          ? {}
          : {
              reason: surface?.availability === 'feature_gated' ? 'sidecar_feature_unavailable' : 'method_unavailable'
            })
      }
    ] as const
  })
  const advertised = Object.fromEntries(entries) as UarDurableWorkspaceSnapshot['operations']
  const starterRequired: UarDurableOperation[] = [
    'collaboration.capabilities',
    'collaboration.packages.list',
    'collaboration.packages.preflight',
    'collaboration.packages.install',
    'collaboration.deployment_bindings.preflight',
    'collaboration.deployment_bindings.install',
    'collaboration.deployment_bindings.list',
    'agent-instances.create'
  ]
  const starterAvailable = starterRequired.every((id) => advertised[id].available)
  return {
    generation: snapshot.generation,
    surfaces: snapshot.surfaces,
    operations: {
      ...advertised,
      'starter.setup': {
        available: starterAvailable,
        ...(starterAvailable ? {} : { reason: 'method_unavailable' })
      }
    }
  }
}

function requireOperation(state: Awaited<ReturnType<typeof capabilityState>>, id: UarDurableOperation): void {
  if (!state.operations[id].available) throw new Error(`UAR operation ${id} is unavailable`)
}

const pendingScopedReads = new Map<string, Promise<unknown>>()

export async function scopedRequest(
  workspaceId: string,
  pathname: string,
  generation: number,
  method = 'GET',
  payload?: object,
  endpoint?: UarSidecarEndpoint
): Promise<unknown> {
  if (endpoint && (method.toUpperCase() !== 'GET' || payload !== undefined)) {
    throw new Error('Explicit UAR administration targets support read requests only')
  }
  if (method.toUpperCase() !== 'GET' || payload !== undefined) {
    return sendScopedRequest(workspaceId, pathname, generation, method, payload)
  }
  const key = JSON.stringify([endpoint?.instanceId ?? null, workspaceId, generation, pathname])
  const pending = pendingScopedReads.get(key)
  if (pending) return structuredClone(await pending)
  const request = sendScopedRequest(workspaceId, pathname, generation, method, undefined, endpoint).finally(() => {
    if (pendingScopedReads.get(key) === request) pendingScopedReads.delete(key)
  })
  pendingScopedReads.set(key, request)
  return structuredClone(await request)
}

async function sendScopedRequest(
  workspaceId: string,
  pathname: string,
  generation: number,
  method = 'GET',
  payload?: object,
  endpoint?: UarSidecarEndpoint
): Promise<unknown> {
  const sidecar = application.get('UarSidecarService')
  const init = {
    method,
    headers: {
      'x-uar-workspace-id': workspaceId,
      ...(payload ? { 'content-type': 'application/json' } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  }
  const response = endpoint
    ? await sidecar.requestInstance(endpoint, pathname, uarPrincipalForSession('durable-administration'), init)
    : await sidecar.request(pathname, uarPrincipalForSession('durable-administration'), init, generation)
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(await response.json().catch(() => null))
    throw new Error(
      `UAR request ${method} ${pathname} failed with HTTP ${response.status}${error.success ? ` (${error.data.error.code})` : ''}`
    )
  }
  return response.json()
}

async function scopedBindings(
  workspaceId: string,
  generation: number,
  endpoint?: UarSidecarEndpoint
): Promise<UarDurableBinding[]> {
  const bindings = z
    .array(rawBinding)
    .parse(await scopedRequest(workspaceId, bindingPath, generation, 'GET', undefined, endpoint))
  return bindings.map((binding) => {
    if (binding.workspaceId !== workspaceId) throw new Error('UAR binding workspace scope mismatch')
    if (endpoint) return projectBinding(binding)
    return { id: binding.id, revision: binding.revision, activationSupported: binding.activationSupported }
  })
}

async function scopedInstances(
  workspaceId: string,
  generation: number,
  endpoint?: UarSidecarEndpoint
): Promise<UarDurableInstance[]> {
  return z
    .array(z.unknown())
    .parse(await scopedRequest(workspaceId, instancePath, generation, 'GET', undefined, endpoint))
    .map((value) => projectInstance(value, workspaceId))
}

export async function readUarDurableWorkspace(
  workspaceId: string,
  endpoint?: UarSidecarEndpoint
): Promise<UarDurableWorkspaceSnapshot> {
  const resolved = workspace(workspaceId)
  const state = await capabilityState(endpoint)
  const bindings = state.operations['collaboration.deployment_bindings.list'].available
    ? await scopedBindings(resolved, state.generation, endpoint)
    : []
  const instances = state.operations['agent-instances.list'].available
    ? await scopedInstances(resolved, state.generation, endpoint)
    : []
  const observers = state.operations['observers.list'].available
    ? z
        .array(z.unknown())
        .parse(await scopedRequest(resolved, observerPath, state.generation, 'GET', undefined, endpoint))
        .map((value) => projectObserver(value, resolved))
    : []
  return {
    schemaVersion: 1,
    workspaceId: resolved,
    generation: state.generation,
    capabilities: {
      instances: state.operations['agent-instances.list'].available,
      observers: state.operations['observers.list'].available
    },
    operations: state.operations,
    bindings,
    instances,
    observers
  }
}

export async function createUarDurableInstance(input: {
  workspaceId: string
  deploymentBindingId: string
  profile: UarInstanceProfile
}): Promise<UarDurableInstance> {
  const resolved = workspace(input.workspaceId)
  const state = await capabilityState()
  requireOperation(state, 'agent-instances.create')
  requireOperation(state, 'collaboration.deployment_bindings.list')
  const binding = (await scopedBindings(resolved, state.generation)).find(
    (candidate) => candidate.id === input.deploymentBindingId
  )
  if (!binding || !binding.activationSupported) throw new Error('Deployment binding is unavailable for this workspace')
  return projectInstance(
    await scopedRequest(resolved, instancePath, state.generation, 'POST', {
      deploymentBindingId: binding.id,
      profile: input.profile
    }),
    resolved
  )
}

export async function actOnUarDurableInstance(input: {
  workspaceId: string
  instanceId: string
  action: UarInstanceAction
  commandId: string
}): Promise<UarDurableInstance> {
  const resolved = workspace(input.workspaceId)
  const state = await capabilityState()
  requireOperation(state, `agent-instances.${input.action}`)
  requireOperation(state, 'agent-instances.read')
  const path = `${instancePath}/${encodeURIComponent(input.instanceId)}`
  projectInstance(await scopedRequest(resolved, path, state.generation), resolved)
  return projectInstance(
    await scopedRequest(resolved, `${path}/${input.action}`, state.generation, 'POST', {
      commandId: input.commandId
    }),
    resolved
  )
}

/** Submit through the native owner/workspace boundary; never accept a renderer endpoint or principal. */
export async function submitUarDurableTurn(input: {
  workspaceId: string
  instanceId: string
  commandId: string
  prompt: string
}): Promise<UarDurableCommand> {
  const resolved = workspace(input.workspaceId)
  const state = await capabilityState()
  requireOperation(state, 'agent-instances.turn')
  requireOperation(state, 'agent-instances.read')
  const path = `${instancePath}/${encodeURIComponent(input.instanceId)}`
  projectInstance(await scopedRequest(resolved, path, state.generation), resolved)
  return z.object({
    commandId: z.string(), kind: z.enum(['turn', 'activate', 'passivate', 'drain', 'disable', 'restart', 'cancel']),
    status: z.enum(['accepted', 'running', 'completed', 'failed', 'cancelled', 'uncertain']),
    attemptId: z.string().nullable(), rootRunId: z.string().nullable(),
    acceptedAt: z.string(), updatedAt: z.string()
  }).parse(await scopedRequest(resolved, `${path}/turns`, state.generation, 'POST', {
    commandId: input.commandId, prompt: input.prompt
  }))
}

export async function createUarDurableObserver(input: {
  workspaceId: string
  observerInstanceId: string
  sourceInstanceIds: string[]
  conversationIds?: string[]
}): Promise<UarDurableObserver> {
  const resolved = workspace(input.workspaceId)
  const state = await capabilityState()
  requireOperation(state, 'observers.create')
  requireOperation(state, 'agent-instances.list')
  const scopedIds = new Set((await scopedInstances(resolved, state.generation)).map((instance) => instance.instanceId))
  if (!scopedIds.has(input.observerInstanceId) || input.sourceInstanceIds.some((id) => !scopedIds.has(id))) {
    throw new Error('Observer or source instance is unavailable for this workspace')
  }
  return projectObserver(
    await scopedRequest(resolved, observerPath, state.generation, 'POST', {
      observerInstanceId: input.observerInstanceId,
      sourceInstanceIds: input.sourceInstanceIds,
      ...(input.conversationIds ? { conversationIds: input.conversationIds } : {})
    }),
    resolved
  )
}

export async function actOnUarDurableObserver(input: {
  workspaceId: string
  subscriptionId: string
  action: UarObserverAction
  expectedRevision: number
}): Promise<UarDurableObserver> {
  const resolved = workspace(input.workspaceId)
  const state = await capabilityState()
  requireOperation(state, `observers.${input.action}`)
  requireOperation(state, 'observers.read')
  const path = `${observerPath}/${encodeURIComponent(input.subscriptionId)}`
  projectObserver(await scopedRequest(resolved, path, state.generation), resolved)
  return projectObserver(
    await scopedRequest(resolved, `${path}/${input.action}`, state.generation, 'POST', {
      expectedRevision: input.expectedRevision
    }),
    resolved
  )
}

export async function acknowledgeUarDurableGap(input: {
  workspaceId: string
  subscriptionId: string
  expectedRevision: number
  sourceInstanceId: string
  missingFrom: number
  missingThrough: number
}): Promise<UarDurableObserver> {
  const resolved = workspace(input.workspaceId)
  const state = await capabilityState()
  requireOperation(state, 'observers.gap.acknowledge')
  requireOperation(state, 'observers.read')
  const path = `${observerPath}/${encodeURIComponent(input.subscriptionId)}`
  projectObserver(await scopedRequest(resolved, path, state.generation), resolved)
  return projectObserver(
    await scopedRequest(resolved, `${path}/gaps/acknowledge`, state.generation, 'POST', {
      expectedRevision: input.expectedRevision,
      sourceInstanceId: input.sourceInstanceId,
      missingFrom: input.missingFrom,
      missingThrough: input.missingThrough
    }),
    resolved
  )
}
