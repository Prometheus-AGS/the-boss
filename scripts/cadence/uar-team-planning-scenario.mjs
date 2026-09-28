import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

function requestExpression(route, input) {
  return `(async () => {
    const result = await window.api.ipcApi.request(${JSON.stringify(route)}, ${JSON.stringify(input)});
    return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
  })()`
}

async function request(evaluate, route, input) {
  const result = await evaluate(requestExpression(route, input))
  if (!result?.ok) throw new Error(`${route}: ${JSON.stringify(result?.error ?? 'no response')}`)
  return result.data
}

async function waitFor(evaluate, signal, expression, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    if (await evaluate(expression)) return
    await delay(200, undefined, { signal })
  }
  throw new Error(`${description} did not become available in The Boss`)
}

export default async function run({ evaluate, signal }) {
  signal.throwIfAborted()
  const directory = mkdtempSync(path.join(os.tmpdir(), 'boss-c09-team-'))
  const workspaceResult = await evaluate(`(async () => window.api.dataApi.request({
    id: ${JSON.stringify(randomUUID())}, method: 'POST', path: '/agent-workspaces',
    body: { path: ${JSON.stringify(directory)}, name: 'Cadence team planning' }
  }))()`)
  if (workspaceResult?.error || !workspaceResult?.data?.id) {
    throw new Error(`Could not create a Boss workspace: ${JSON.stringify(workspaceResult?.error ?? 'empty response')}`)
  }
  const workspaceId = workspaceResult.data.id
  const binding = await request(evaluate, 'prometheus.uar.teams.setup_starter', { workspaceId })
  if (binding.activationSupported) throw new Error('Starter team unexpectedly advertises execution support')
  const snapshot = await request(evaluate, 'prometheus.uar.teams.snapshot', { workspaceId })
  if (!snapshot.capabilities.planning) throw new Error('UAR did not advertise durable team planning')
  const definition = snapshot.definitions.find((item) => item.package.digest === binding.package.digest)
  if (!definition) throw new Error('Installed starter team definition is missing from the catalog')
  const team = await request(evaluate, 'prometheus.uar.teams.create', {
    workspaceId,
    commandId: randomUUID(),
    deploymentBindingId: binding.id,
    teamDefinition: { id: definition.id, version: definition.version, digest: definition.digest },
    input: { brief: 'Prepare a local delivery plan' }
  })
  if (team.status !== 'inactive' || team.members.length !== 2) {
    throw new Error('UAR did not materialize the two-member planning team')
  }
  const firstId = randomUUID()
  const first = await request(evaluate, 'prometheus.uar.teams.add_task', {
    workspaceId,
    teamInstanceId: team.id,
    commandId: randomUUID(),
    taskId: firstId,
    expectedTeamRevision: team.revision,
    title: 'Draft the implementation plan',
    role: 'coordinator',
    input: { brief: 'Outline the delivery' },
    outputContract: { type: 'object' },
    dependsOn: []
  })
  const secondId = randomUUID()
  const second = await request(evaluate, 'prometheus.uar.teams.add_task', {
    workspaceId,
    teamInstanceId: team.id,
    commandId: randomUUID(),
    taskId: secondId,
    expectedTeamRevision: first.revision,
    title: 'Prepare the implementation',
    role: 'worker',
    input: { brief: 'Use the approved plan' },
    outputContract: { type: 'object' },
    dependsOn: [firstId]
  })
  const leftId = randomUUID()
  const left = await request(evaluate, 'prometheus.uar.teams.add_task', {
    workspaceId,
    teamInstanceId: team.id,
    commandId: randomUUID(),
    taskId: leftId,
    expectedTeamRevision: second.revision,
    title: 'Map part A',
    role: 'worker',
    input: { partition: 'A' },
    outputContract: { type: 'object' },
    dependsOn: []
  })
  const rightId = randomUUID()
  const right = await request(evaluate, 'prometheus.uar.teams.add_task', {
    workspaceId,
    teamInstanceId: team.id,
    commandId: randomUUID(),
    taskId: rightId,
    expectedTeamRevision: left.revision,
    title: 'Map part B',
    role: 'worker',
    input: { partition: 'B' },
    outputContract: { type: 'object' },
    dependsOn: []
  })
  const reduceId = randomUUID()
  await request(evaluate, 'prometheus.uar.teams.add_task', {
    workspaceId,
    teamInstanceId: team.id,
    commandId: randomUUID(),
    taskId: reduceId,
    expectedTeamRevision: right.revision,
    title: 'Reduce mapped parts',
    role: 'coordinator',
    input: { combine: ['A', 'B'] },
    outputContract: { type: 'object' },
    dependsOn: [leftId, rightId]
  })
  const peer = await request(evaluate, 'prometheus.uar.teams.create', {
    workspaceId,
    commandId: randomUUID(),
    deploymentBindingId: binding.id,
    teamDefinition: { id: definition.id, version: definition.version, digest: definition.digest },
    input: { brief: 'Record independent peer work' }
  })
  const peerLeft = await request(evaluate, 'prometheus.uar.teams.add_task', {
    workspaceId,
    teamInstanceId: peer.id,
    commandId: randomUUID(),
    taskId: randomUUID(),
    expectedTeamRevision: peer.revision,
    title: 'Peer research',
    role: 'coordinator',
    input: {},
    outputContract: { type: 'object' },
    dependsOn: []
  })
  await request(evaluate, 'prometheus.uar.teams.add_task', {
    workspaceId,
    teamInstanceId: peer.id,
    commandId: randomUUID(),
    taskId: randomUUID(),
    expectedTeamRevision: peerLeft.revision,
    title: 'Peer design',
    role: 'worker',
    input: {},
    outputContract: { type: 'object' },
    dependsOn: []
  })
  const saved = await request(evaluate, 'prometheus.uar.teams.snapshot', { workspaceId })
  const persisted = saved.instances.find((item) => item.id === team.id)
  const savedPeer = saved.instances.find((item) => item.id === peer.id)
  if (
    persisted?.tasks.length !== 5 ||
    !persisted.tasks[1].dependsOn.includes(firstId) ||
    !persisted.tasks[4].dependsOn.includes(leftId) ||
    !persisted.tasks[4].dependsOn.includes(rightId) ||
    savedPeer?.tasks.length !== 2 ||
    savedPeer.tasks.some((item) => item.dependsOn.length)
  ) {
    throw new Error('The saved boards lost supervisor, map/reduce, or peer task dependencies')
  }
  const secondDirectory = mkdtempSync(path.join(os.tmpdir(), 'boss-c09-isolated-'))
  const secondWorkspaceResult = await evaluate(`(async () => window.api.dataApi.request({
    id: ${JSON.stringify(randomUUID())}, method: 'POST', path: '/agent-workspaces',
    body: { path: ${JSON.stringify(secondDirectory)}, name: 'Cadence isolated team workspace' }
  }))()`)
  if (secondWorkspaceResult?.error || !secondWorkspaceResult?.data?.id) {
    throw new Error('Could not create a second Boss workspace')
  }
  const otherWorkspaceId = secondWorkspaceResult.data.id
  const beforeRestart = await request(evaluate, 'prometheus.uar.teams.snapshot', { workspaceId: otherWorkspaceId })
  if (beforeRestart.instances.some((item) => item.id === team.id)) {
    throw new Error('The first team leaked into another workspace')
  }
  const restart = await request(evaluate, 'prometheus.integration.start', { action: 'uar-restart' })
  const deadline = Date.now() + 90_000
  let restartStatus
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const state = await request(evaluate, 'prometheus.integration.snapshot', {})
    restartStatus = state.operations.find((item) => item.id === restart.id)?.status
    if (restartStatus === 'succeeded') break
    if (['failed', 'cancelled', 'interrupted'].includes(restartStatus)) {
      throw new Error(`UAR restart finished with status ${restartStatus}`)
    }
    await delay(250, undefined, { signal })
  }
  if (restartStatus !== 'succeeded') throw new Error('UAR restart did not finish within the delivery window')
  const recovered = await request(evaluate, 'prometheus.uar.teams.snapshot', { workspaceId })
  const restoredTeam = recovered.instances.find((item) => item.id === team.id)
  const restoredPeer = recovered.instances.find((item) => item.id === peer.id)
  if (
    restoredTeam?.tasks.length !== 5 ||
    !restoredTeam.tasks[1].dependsOn.includes(firstId) ||
    !restoredTeam.tasks[4].dependsOn.includes(leftId) ||
    !restoredTeam.tasks[4].dependsOn.includes(rightId) ||
    restoredPeer?.tasks.length !== 2
  ) {
    throw new Error('Team planning state did not survive UAR restart')
  }
  const isolated = await request(evaluate, 'prometheus.uar.teams.snapshot', { workspaceId: otherWorkspaceId })
  if (isolated.instances.some((item) => item.id === team.id)) {
    throw new Error('Team planning scope changed after UAR restart')
  }
  await waitFor(
    evaluate,
    signal,
    `(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Set up later');
    if (!button) return false; button.click(); return true;
  })()`,
    'Skip onboarding action'
  )
  await waitFor(evaluate, signal, `Boolean(document.querySelector('#app-sidebar'))`, 'Main app sidebar')
  await request(evaluate, 'navigation.open_route_in_main', { path: '/settings/uar?panel=teams' })
  await waitFor(
    evaluate,
    signal,
    `(() => {
    const button = document.querySelector('button[aria-label="Workspace"]');
    if (!button) return false; button.click(); return true;
  })()`,
    'UAR workspace selector'
  )
  await waitFor(
    evaluate,
    signal,
    `(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.innerText.includes('Cadence team planning'));
    if (!option) return false; option.click(); return true;
  })()`,
    'Cadence workspace option'
  )
  await waitFor(evaluate, signal, `document.body.innerText.includes('Team instances')`, 'UAR Teams settings')
  await waitFor(
    evaluate,
    signal,
    `Boolean(document.querySelector('button[aria-label="Choose a team instance"]'))`,
    'Team instance selector'
  )
  await waitFor(
    evaluate,
    signal,
    `(() => {
    const button = document.querySelector('button[aria-label="Choose a team instance"]');
    if (!button) return false; button.click(); return true;
  })()`,
    'Team instance selector action'
  )
  await waitFor(
    evaluate,
    signal,
    `(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.innerText.includes(${JSON.stringify(team.id)}));
    if (!option) return false; option.click(); return true;
  })()`,
    'Saved team option'
  )
  await waitFor(
    evaluate,
    signal,
    `document.body.innerText.includes('Draft the implementation plan') &&
    document.body.innerText.includes('Prepare the implementation')`,
    'Saved task board in Teams settings'
  )
  return {
    passed: true,
    observedBehavior: `Packaged Boss installed planning-only UAR teams ${team.id} and ${peer.id}, saved supervisor, bounded map/reduce and independent peer task graphs, restarted its sidecar, kept workspace ${otherWorkspaceId} isolated, and displayed the recovered board in Teams settings.`
  }
}
