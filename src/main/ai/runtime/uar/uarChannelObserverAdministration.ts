import * as z from 'zod'

import { IpcError } from '@shared/ipc/errors/IpcError'
import {
  uarChannelDeliveriesSchema,
  uarChannelSubscriptionSchema,
  type UarChannelObserverAction,
  type UarChannelObserversSnapshot
} from '@shared/types/uarChannelObservers'

import { readUarAdministrationSnapshot } from './UarAdministrationAdapter'
import { scopedRequest, workspace } from './UarDurableAdministrationAdapter'

const base = '/api/uar/channel-observers/v1'
const capabilitiesSchema = z.object({ supported: z.boolean(), reason: z.string() })

async function state() {
  const snapshot = await readUarAdministrationSnapshot()
  const available = (id: string) => {
    const surface = snapshot.surfaces.find((candidate) => candidate.methods.some((method) => method.id === id))
    const method = surface?.methods.find((candidate) => candidate.id === id)
    return (
      (surface?.availability === 'available' || surface?.availability === 'host_controlled') &&
      method?.adapter === 'available' &&
      method.apply !== 'unavailable'
    )
  }
  return { generation: snapshot.generation, available }
}

async function request(workspaceId: string, path: string, generation: number, payload?: object) {
  try {
    return await scopedRequest(workspaceId, path, generation, payload ? 'POST' : 'GET', payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const code = /channel_profile_conflict/.test(message)
      ? 'conflict'
      : /HTTP (401|403)/.test(message)
        ? 'authority'
        : /HTTP 404/.test(message)
          ? 'missing'
          : /channel_profile_unavailable|HTTP 503/.test(message)
            ? 'unavailable'
            : 'requestFailed'
    // Transport details and UAR principal/grant material stay in main.
    throw new IpcError(`UAR_CHANNEL_${code}`)
  }
}

async function subscriptions(workspaceId: string, generation: number) {
  const records = z
    .array(uarChannelSubscriptionSchema)
    .parse(await request(workspaceId, `${base}/subscriptions`, generation))
  if (records.some((record) => record.workspaceId !== workspaceId)) throw new IpcError('UAR_CHANNEL_scope')
  return records
}

export async function readUarChannelObservers(workspaceId: string): Promise<UarChannelObserversSnapshot> {
  const resolved = workspace(workspaceId)
  const current = await state()
  const methodsAvailable =
    current.available('channel-observers.capabilities') && current.available('channel-observers.list')
  const capability = methodsAvailable
    ? capabilitiesSchema.parse(await request(resolved, `${base}/capabilities`, current.generation))
    : undefined
  const supported = capability?.supported ?? false
  return {
    schemaVersion: 1,
    workspaceId: resolved,
    generation: current.generation,
    supported,
    ...(supported
      ? {}
      : {
          unavailableReason: !methodsAvailable
            ? ('methodUnavailable' as const)
            : capability?.reason === 'authenticated_gate_binding_missing'
              ? ('gateMissing' as const)
              : ('storageUnavailable' as const)
        }),
    operations: {
      pause: supported && current.available('channel-observers.pause'),
      resume: supported && current.available('channel-observers.resume'),
      revoke: supported && current.available('channel-observers.revoke'),
      deliveries: supported && current.available('channel-observers.deliveries.list')
    },
    subscriptions: supported ? await subscriptions(resolved, current.generation) : []
  }
}

async function requireSubscription(
  input: { workspaceId: string; subscriptionId: string; generation: number },
  id: string
) {
  const resolved = workspace(input.workspaceId)
  const current = await state()
  if (current.generation !== input.generation) throw new IpcError('UAR_CHANNEL_stale')
  if (!current.available(id) || !current.available('channel-observers.list'))
    throw new IpcError('UAR_CHANNEL_unavailable')
  const record = (await subscriptions(resolved, current.generation)).find(
    (candidate) => candidate.subscriptionId === input.subscriptionId
  )
  if (!record) throw new IpcError('UAR_CHANNEL_missing')
  return { resolved, current, record }
}

export async function actOnUarChannelObserver(input: {
  workspaceId: string
  subscriptionId: string
  generation: number
  expectedRevision: number
  action: UarChannelObserverAction
}) {
  const { resolved, current } = await requireSubscription(input, `channel-observers.${input.action}`)
  const record = uarChannelSubscriptionSchema.parse(
    await request(
      resolved,
      `${base}/subscriptions/${encodeURIComponent(input.subscriptionId)}/${input.action}`,
      current.generation,
      { expectedRevision: input.expectedRevision }
    )
  )
  if (record.workspaceId !== resolved || record.subscriptionId !== input.subscriptionId)
    throw new IpcError('UAR_CHANNEL_scope')
  return record
}

export async function readUarChannelDeliveries(input: {
  workspaceId: string
  subscriptionId: string
  generation: number
}) {
  const { resolved, current } = await requireSubscription(input, 'channel-observers.deliveries.list')
  const inventory = uarChannelDeliveriesSchema.parse(
    await request(
      resolved,
      `${base}/subscriptions/${encodeURIComponent(input.subscriptionId)}/deliveries`,
      current.generation
    )
  )
  if (inventory.subscriptionId !== input.subscriptionId) throw new IpcError('UAR_CHANNEL_scope')
  return inventory
}
