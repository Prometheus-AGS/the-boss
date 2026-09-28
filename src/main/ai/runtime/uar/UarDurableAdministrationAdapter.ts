import * as z from 'zod'

import { application } from '@application'
import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import type {
  UarDurableBinding,
  UarDurableInstance,
  UarDurableObserver,
  UarDurableOperation,
  UarDurableWorkspaceSnapshot,
  UarInstanceAction,
  UarInstanceProfile,
  UarObserverAction
} from '@shared/types/uarDurableAdministration'

import { readUarAdministrationSnapshot } from './UarAdministrationAdapter'
import { uarPrincipalForSession } from './uarPrincipal'

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

export const rawBinding = z.object({
  id: z.string(),
  workspaceId: z.string(),
  revision: z.number().int().nonnegative(),
  activationSupported: z.boolean(),
  package: z.object({ id: z.string(), version: z.string(), digest: z.string() })
})

const rawInstance = z.object({
  instanceId: z.string(),
  workspaceId: z.string(),
  definitionId: z.string(),
  definitionVersion: z.string(),
  bindingId: z.string(),
  bindingRevision: z.number().int().nonnegative(),
  profile: z.enum(['request', 'on_demand', 'resident']),
  lifecycle: z.enum(['dormant', 'active', 'draining', 'disabled', 'failed']),
  recovery: z.enum(['ready', 'pending_reconciliation', 'effect_uncertain']),
  revision: z.number().int().nonnegative(),
  epoch: z.number().int().nonnegative(),
  queueDepth: z.number().int().nonnegative(),
  activeRunId: z.string().nullable(),
  activeCommandId: z.string().nullable(),
  restartAttempts: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
  nextEventSequence: z.number().int().nonnegative(),
  commands: z.array(
    z.object({
      commandId: z.string(),
      kind: z.enum(['turn', 'activate', 'passivate', 'drain', 'disable', 'restart', 'cancel']),
      status: z.enum(['accepted', 'running', 'completed', 'failed', 'cancelled', 'uncertain'])
    })
  )
})

const rawObserver = z.object({
  subscription: z.object({
    subscription_id: z.string(),
    workspace_id: z.string(),
    observer_instance_id: z.string(),
    source_instance_ids: z.array(z.string()),
    conversation_ids: z.array(z.string()).nullable(),
    revision: z.number().int().nonnegative(),
    paused: z.boolean(),
    revoked: z.boolean(),
    gaps: z.array(
      z.object({
        source_instance_id: z.string(),
        missing_from: z.number().int().nonnegative(),
        missing_through: z.number().int().nonnegative(),
        detected_at: z.string(),
        acknowledged_at: z.string().nullable()
      })
    )
  }),
  sources: z.array(
    z.object({
      sourceInstanceId: z.string(),
      cursor: z.number().int().nonnegative().nullable(),
      retainedLow: z.number().int().nonnegative().nullable(),
      sourceHigh: z.number().int().nonnegative().nullable()
    })
  ),
  backlogDepth: z.number().int().nonnegative(),
  deadLetterCount: z.number().int().nonnegative(),
  recoveryActions: z.array(z.string())
})

export function workspace(workspaceId: string): string {
  // The renderer supplies a selector. Main resolves it against Boss's user-workspace store.
  return agentWorkspaceService.getById(workspaceId).id
}

export async function capabilityState() {
  const snapshot = await readUarAdministrationSnapshot()
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

export async function scopedRequest(
  workspaceId: string,
  pathname: string,
  generation: number,
  method = 'GET',
  payload?: object
): Promise<unknown> {
  const response = await application.get('UarSidecarService').request(
    pathname,
    uarPrincipalForSession('durable-administration'),
    {
      method,
      headers: {
        'x-uar-workspace-id': workspaceId,
        ...(payload ? { 'content-type': 'application/json' } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    },
    generation
  )
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(await response.json().catch(() => null))
    throw new Error(
      `UAR request ${method} ${pathname} failed with HTTP ${response.status}${error.success ? ` (${error.data.error.code})` : ''}`
    )
  }
  return response.json()
}

function projectInstance(value: unknown, workspaceId: string): UarDurableInstance {
  const instance = rawInstance.parse(value)
  if (instance.workspaceId !== workspaceId) throw new Error('UAR instance workspace scope mismatch')
  return instance
}

function projectObserver(value: unknown, workspaceId: string): UarDurableObserver {
  const status = rawObserver.parse(value)
  const subscription = status.subscription
  if (subscription.workspace_id !== workspaceId) throw new Error('UAR observer workspace scope mismatch')
  return {
    subscriptionId: subscription.subscription_id,
    workspaceId: subscription.workspace_id,
    observerInstanceId: subscription.observer_instance_id,
    sourceInstanceIds: subscription.source_instance_ids,
    conversationIds: subscription.conversation_ids,
    revision: subscription.revision,
    paused: subscription.paused,
    revoked: subscription.revoked,
    gaps: subscription.gaps.map((gap) => ({
      sourceInstanceId: gap.source_instance_id,
      missingFrom: gap.missing_from,
      missingThrough: gap.missing_through,
      detectedAt: gap.detected_at,
      acknowledgedAt: gap.acknowledged_at
    })),
    sources: status.sources,
    backlogDepth: status.backlogDepth,
    deadLetterCount: status.deadLetterCount,
    recoveryActions: status.recoveryActions
  }
}

async function scopedBindings(workspaceId: string, generation: number): Promise<UarDurableBinding[]> {
  const bindings = z.array(rawBinding).parse(await scopedRequest(workspaceId, bindingPath, generation))
  return bindings.map((binding) => {
    if (binding.workspaceId !== workspaceId) throw new Error('UAR binding workspace scope mismatch')
    return { id: binding.id, revision: binding.revision, activationSupported: binding.activationSupported }
  })
}

async function scopedInstances(workspaceId: string, generation: number): Promise<UarDurableInstance[]> {
  return z
    .array(z.unknown())
    .parse(await scopedRequest(workspaceId, instancePath, generation))
    .map((value) => projectInstance(value, workspaceId))
}

export async function readUarDurableWorkspace(workspaceId: string): Promise<UarDurableWorkspaceSnapshot> {
  const resolved = workspace(workspaceId)
  const state = await capabilityState()
  const bindings = state.operations['collaboration.deployment_bindings.list'].available
    ? await scopedBindings(resolved, state.generation)
    : []
  const instances = state.operations['agent-instances.list'].available
    ? await scopedInstances(resolved, state.generation)
    : []
  const observers = state.operations['observers.list'].available
    ? z
        .array(z.unknown())
        .parse(await scopedRequest(resolved, observerPath, state.generation))
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
