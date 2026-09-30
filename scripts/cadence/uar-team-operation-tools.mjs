import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const route = (operation) => `prometheus.uar.teams.${operation}`
export const terminal = (attempt) => ['succeeded', 'failed', 'cancelled', 'uncertain'].includes(attempt.status)

export async function response(evaluate, name, input) {
  return evaluate(`window.api.ipcApi.request(${JSON.stringify(name)}, ${JSON.stringify(input)})`)
}

export async function ipc(evaluate, name, input) {
  const result = await response(evaluate, name, input)
  if (!result?.ok) throw new Error(`${name} refused the operation; inspect isolated application logs`)
  return result.data
}

export async function waitFor(signal, read, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const value = await read()
    if (value) return value
    await delay(250, undefined, { signal })
  }
  throw new Error(`${description} did not finish within its delivery window`)
}

export async function workspace(evaluate, label) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'boss-c09-runtime-'))
  const result = await evaluate(`window.api.dataApi.request({
    id: ${JSON.stringify(randomUUID())}, method: 'POST', path: '/agent-workspaces',
    body: ${JSON.stringify({ path: directory, name: label })}
  })`)
  if (result?.error || !result?.data?.id) throw new Error('Boss could not create an isolated team workspace')
  return result.data.id
}

export async function team(evaluate, workspaceId, model, label) {
  const binding = await ipc(evaluate, route('setup_starter'), { workspaceId, model })
  const state = await ipc(evaluate, route('snapshot'), { workspaceId })
  if (!state.capabilities.execution || !binding.activationSupported) {
    throw new Error('The packaged UAR does not advertise executable team bindings')
  }
  const definition = state.definitions.find((item) => item.package.digest === binding.package.digest)
  if (!definition) throw new Error('The selected starter binding has no immutable team definition')
  const instance = await ipc(evaluate, route('create'), {
    workspaceId,
    commandId: randomUUID(),
    deploymentBindingId: binding.id,
    teamDefinition: { id: definition.id, version: definition.version, digest: definition.digest },
    input: { brief: label }
  })
  return { workspaceId, teamInstanceId: instance.id }
}

export async function current(evaluate, selector) {
  const snapshot = await ipc(evaluate, route('snapshot'), { workspaceId: selector.workspaceId })
  const instance = snapshot.instances.find((item) => item.id === selector.teamInstanceId)
  if (!instance) throw new Error('The team disappeared from its authoritative workspace')
  return instance
}

export async function task(evaluate, selector, role, title, instruction, marker) {
  const instance = await current(evaluate, selector)
  const taskId = randomUUID()
  const updated = await ipc(evaluate, route('add_task'), {
    ...selector,
    commandId: randomUUID(),
    taskId,
    expectedTeamRevision: instance.revision,
    title,
    role,
    input: { instruction },
    outputContract: marker ? { type: 'string', const: marker } : { type: 'string' },
    dependsOn: []
  })
  const member = updated.members.find((item) => item.role === role && item.status !== 'revoked')
  const created = updated.tasks.find((item) => item.id === taskId)
  if (!member || !created) throw new Error('The starter team did not materialize its task and member')
  await ipc(evaluate, route('claim_task'), {
    ...selector,
    taskId,
    commandId: randomUUID(),
    expectedTeamRevision: updated.revision,
    expectedTaskRevision: created.revision,
    memberId: member.id
  })
  return { taskId, memberId: member.id }
}

export async function admission(evaluate, selector, assignment, reservation, contextArtifactIds = []) {
  const instance = await current(evaluate, selector)
  const assigned = instance.tasks.find((item) => item.id === assignment.taskId)
  return {
    ...selector,
    ...assignment,
    commandId: randomUUID(),
    expectedTeamRevision: instance.revision,
    expectedTaskRevision: assigned.revision,
    reservation,
    contextArtifactIds
  }
}

export async function summary(evaluate, selector) {
  return ipc(evaluate, route('execution'), selector)
}

export function truthfulUsage(state) {
  const unresolved = state.attempts.filter((item) => item.usage == null)
  const sums = { tokens: 0, costMicrounits: 0, elapsedSeconds: 0 }
  for (const item of unresolved) {
    for (const name of Object.keys(sums)) sums[name] += item.reservation[name]
    if (item.status === 'uncertain' && !state.uncertainAttempts.includes(item.id)) {
      throw new Error('Unknown team usage is absent from the uncertainty projection')
    }
  }
  for (const name of Object.keys(sums)) {
    if (state.reserved[name] !== sums[name])
      throw new Error('An unresolved reservation was silently released or counted twice')
  }
  if (
    state.committed.tokens + state.reserved.tokens > state.budget.maxTokens ||
    state.committed.costMicrounits + state.reserved.costMicrounits > state.budget.maxCostMicrounits ||
    state.committed.elapsedSeconds + state.reserved.elapsedSeconds > state.budget.maxElapsedSeconds
  ) {
    throw new Error('Aggregate team usage exceeds its authoritative budget')
  }
}

export async function expectDenied(evaluate, selector, input, description) {
  const before = await summary(evaluate, selector)
  const result = await response(evaluate, route('admit_task'), input)
  if (result?.ok || !result?.error) throw new Error(`${description} was admitted`)
  const after = await summary(evaluate, selector)
  if (
    after.attempts.length !== before.attempts.length ||
    JSON.stringify(after.reserved) !== JSON.stringify(before.reserved)
  ) {
    throw new Error(`${description} created an attempt or reservation`)
  }
}
