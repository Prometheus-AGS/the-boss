import { spawn, execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const prefix = '/api/v1/collaboration'

async function freePort() {
  const listener = net.createServer()
  await new Promise((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  return port
}

async function until(signal, read, name, milliseconds = 60_000) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const result = await read()
    if (result) return result
    await delay(250, undefined, { signal })
  }
  throw new Error(`${name} did not complete; remote ownership operation remains unqualified`)
}

function childProcess(binary, args, cwd, env) {
  const child = spawn(binary, args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (value) => {
    output = (output + value.toString()).slice(-64_000)
  })
  child.stderr.resume() // Runtime output may contain private configuration; it never enters the public receipt.
  child.spawnError = false
  child.on('error', () => {
    child.spawnError = true
  })
  return { child, output: () => output }
}

async function stop(owned, clean = true) {
  if (!owned || owned.child.exitCode !== null || owned.child.signalCode !== null) return
  const child = owned.child
  if (clean) {
    child.stdin.end()
    const deadline = Date.now() + 20_000
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delay(100)
    if (child.exitCode !== null || child.signalCode !== null) return
  }
  if (process.platform === 'win32') {
    await new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], resolve))
  } else {
    processKillGroup(child.pid)
  }
  await new Promise((resolve) =>
    child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)
  )
}

function processKillGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

async function request(server, suffix, input, { privileged = true, authenticated = true, method } = {}) {
  const response = await fetch(server.endpoint + (suffix.startsWith('/api/') ? suffix : prefix + suffix), {
    method: method ?? (input === undefined ? 'GET' : 'POST'),
    headers: {
      ...(authenticated ? { authorization: 'Bearer ' + server.token, 'x-uar-principal': 'cadence-c093-owner' } : {}),
      ...(privileged ? { 'x-uar-admin-key': server.admin } : {}),
      'x-uar-workspace-id': server.workspace,
      ...(input !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
    signal: AbortSignal.timeout(12_000)
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}

async function accepted(server, suffix, input, options) {
  const result = await request(server, suffix, input, options)
  if (!result.ok) throw new Error(`Remote owner operation ${suffix} refused with HTTP ${result.status}`)
  return result.body
}

async function denied(server, suffix, input, options) {
  const result = await request(server, suffix, input, options)
  if (result.ok) throw new Error(`Remote owner operation ${suffix} accepted excluded authority`)
  return { status: result.status, code: result.body?.error?.code ?? null }
}

async function fixtureDocuments() {
  const source = await readFile(path.join(repository, 'src/main/ai/runtime/uar/uarStarterDocuments.ts'), 'utf8')
  const javascript = stripTypeScriptTypes(source, { mode: 'strip' })
  return import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'))
}

async function assignedTeam(server) {
  const documents = await fixtureDocuments()
  const packageRecord = documents.starterTeamPackage()
  await accepted(server, '/packages:install', {
    commandId: randomUUID(),
    manifest: packageRecord.manifest,
    files: packageRecord.files
  })
  const capabilities = await accepted(server, '/capabilities')
  const alias = process.env.BOSS_CADENCE_LITER_ALIAS ?? 'kimi-for-coding'
  const endpoint = process.env.BOSS_CADENCE_LITER_ENDPOINT ?? 'http://127.0.0.1:4000'
  await accepted(server, '/api/uar/providers', {
    id: 'cadence-remote-gateway',
    display_name: 'Isolated ownership operation',
    base_url: endpoint.replace(/\/$/, '') + '/v1',
    protocol: 'chat',
    enabled: true,
    default_model: alias,
    api_key: process.env.BOSS_CADENCE_LITER_KEY ?? process.env.LITER_LLM_MASTER_KEY,
    models: [
      {
        id: alias,
        enabled: true,
        pricing_identity: {
          provider_id: process.env.BOSS_CADENCE_LITER_SOURCE_PROVIDER ?? 'kimi-code-plan-cn',
          model_id: process.env.BOSS_CADENCE_LITER_SOURCE_MODEL ?? 'kimi-for-coding'
        },
        execution_profile: {
          profile: { id: 'uar.openai-compatible-chat.settings-v1', revision: 1 },
          settingsRevision: 1,
          reasoning: { mode: 'off' }
        }
      }
    ]
  })
  const binding = documents.starterBinding({
    ownerId: capabilities.bindingOwnerId,
    workspaceId: server.workspace,
    runtimeInstanceId: capabilities.instance.id,
    providerId: 'cadence-remote-gateway',
    modelId: alias,
    profile: { id: 'uar.openai-compatible-chat.settings-v1', revision: 1 },
    settingsRevision: 1,
    storageBackend: 'remote',
    packageIdentity: packageRecord.identity,
    effectiveLimits: { concurrentTurns: 1, maxMembers: 3, maxDepth: 0, maxPendingTasks: 8 }
  })
  await accepted(server, '/deployment-bindings', { commandId: randomUUID(), expectedRevision: 0, binding })
  let team = await accepted(server, '/team-instances', {
    commandId: randomUUID(),
    deploymentBindingId: binding.id,
    teamDefinition: packageRecord.definition,
    input: { brief: 'Observe fenced mutations without dispatching model work' }
  })
  const taskId = randomUUID()
  team = await accepted(server, `/team-instances/${team.id}/tasks`, {
    commandId: randomUUID(),
    taskId,
    expectedTeamRevision: team.revision,
    role: 'coordinator',
    title: 'Bounded owner admission',
    input: { instruction: 'Reply with one word.' },
    outputContract: { type: 'string' },
    dependsOn: []
  })
  const member = team.members.find((item) => item.role === 'coordinator')
  team = await accepted(server, `/team-instances/${team.id}/tasks/${taskId}/claim`, {
    commandId: randomUUID(),
    expectedTeamRevision: team.revision,
    expectedTaskRevision: team.tasks.find((item) => item.id === taskId).revision,
    memberId: member.id
  })
  return { team, taskId, memberId: member.id }
}

export async function operateRemoteOwnership({ signal }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'boss-c093-remote-owner-'))
  const { getPackagedBinaryDirectory } = createRequire(import.meta.url)(
    path.join(repository, 'scripts/uar-payload-integrity.cjs')
  )
  const platform = `${process.platform}-${process.arch}`
  const payload = getPackagedBinaryDirectory(
    path.join(repository, 'dist/mac-arm64/The Boss.app/Contents/Resources'),
    platform
  )
  const binary = path.join(payload, platform.startsWith('win32') ? 'uar-sidecar.exe' : 'uar-sidecar')
  const surrealBinary =
    process.env.BOSS_CADENCE_SURREAL_BINARY ?? path.join(os.homedir(), '.prometheus/bin/surreal-3.3.0')
  const metadata = JSON.parse(await readFile(path.join(payload, 'payload-manifest.json'), 'utf8'))
  const admin = randomBytes(32).toString('hex'),
    password = randomBytes(32).toString('hex')
  const credentialKey = randomBytes(32).toString('hex')
  const databasePort = await freePort(),
    workspace = 'cadence-owner-' + randomUUID()
  const processes = []
  const db = childProcess(surrealBinary, ['start', '--bind', `127.0.0.1:${databasePort}`, 'memory'], root, {
    ...process.env,
    SURREAL_USER: 'root',
    SURREAL_PASS: password,
    SURREAL_LOG: 'warn'
  })
  processes.push(db)
  try {
    await until(
      signal,
      async () => {
        if (db.child.spawnError || db.child.exitCode !== null)
          throw new Error('Pinned disposable Surreal process could not start')
        return fetch(`http://127.0.0.1:${databasePort}/health`, { signal: AbortSignal.timeout(1000) })
          .then((r) => r.ok)
          .catch(() => false)
      },
      'Isolated Surreal readiness'
    )
    const version = await fetch(`http://127.0.0.1:${databasePort}/version`).then((r) => r.text())
    if (!version.includes('3.3.0')) throw new Error('Isolated catalog server is not pinned SurrealDB 3.3.0')
    async function launch(label) {
      const cwd = await mkdtemp(path.join(root, label + '-'))
      await cp(path.join(payload, 'policies'), path.join(cwd, 'policies'), { recursive: true })
      await writeFile(path.join(cwd, 'config.json'), '{}\n', { mode: 0o600 })
      await writeFile(path.join(cwd, '.env'), '', { mode: 0o600 })
      const token = randomBytes(32).toString('hex')
      const owned = childProcess(
        binary,
        ['--config', path.join(cwd, 'config.json'), '--port', String(await freePort())],
        cwd,
        {
          ...process.env,
          UAR_SERVICE_INSTANCE__INSTANCE_ID: 'cadence-c093-shared-runtime',
          UAR_SECURITY__JWT_REQUIRED: 'false',
          UAR_SECURITY__SETTINGS_MUTATION_AUTH_REQUIRED: 'true',
          UAR_SECURITY__SETTINGS_ADMIN_KEY: admin,
          CREDENTIAL_ENCRYPTION_KEY: credentialKey,
          UAR_PERSISTENCE__PROVIDER: 'surreal',
          UAR_PERSISTENCE__DATABASE_URL: `ws://127.0.0.1:${databasePort}`,
          UAR_PERSISTENCE__SURREAL_USER: 'root',
          UAR_PERSISTENCE__SURREAL_PASS: password,
          UAR_PERSISTENCE__SURREAL_AUTH_LEVEL: 'root',
          UAR_PERSISTENCE__SURREAL_NS: 'cadence',
          UAR_PERSISTENCE__SURREAL_DB: 'ownership',
          UAR_MODELS_DIR: path.join(payload, 'uar-models'),
          UAR_MEMORY__ENABLED: 'false',
          UAR_SKILLS__EVOLUTION_ENABLED: 'false'
        }
      )
      processes.push(owned)
      owned.child.stdin.write(token + '\n')
      const port = await until(
        signal,
        () => {
          if (owned.child.spawnError || owned.child.exitCode !== null)
            throw new Error('Packaged isolated sidecar could not initialize')
          return owned.output().match(/READY:(\d+)/)?.[1]
        },
        'Packaged isolated sidecar readiness'
      )
      return { ...owned, endpoint: `http://127.0.0.1:${port}`, token, admin, workspace }
    }
    const owner = await launch('owner')
    const assignment = await assignedTeam(owner)
    const contender = await launch('contender')
    const first = await accepted(owner, '/execution-owner'),
      second = await accepted(contender, '/execution-owner')
    if (
      !first.ownsExecution ||
      second.ownsExecution ||
      first.claim.epoch !== second.claim.epoch ||
      first.claim.state !== 'held'
    ) {
      throw new Error('Two executors failed single-winner catalog ownership')
    }
    const control = {
      commandId: randomUUID(),
      expectedTeamRevision: assignment.team.revision,
      reason: 'Exercise excluded executor'
    }
    const budget = await accepted(owner, `/team-instances/${assignment.team.id}/execution`)
    const admission = {
      commandId: randomUUID(),
      expectedTeamRevision: assignment.team.revision,
      expectedTaskRevision: assignment.team.tasks.find((item) => item.id === assignment.taskId).revision,
      memberId: assignment.memberId,
      reservation: {
        tokens: budget.budget.maxTokens - budget.committed.tokens - budget.reserved.tokens,
        costMicrounits:
          budget.budget.maxCostMicrounits - budget.committed.costMicrounits - budget.reserved.costMicrounits,
        elapsedSeconds: Math.min(
          60,
          budget.budget.maxElapsedSeconds - budget.committed.elapsedSeconds - budget.reserved.elapsedSeconds
        )
      },
      contextArtifactIds: []
    }
    const excludedAdmission = await denied(
      contender,
      `/team-instances/${assignment.team.id}/tasks/${assignment.taskId}/admit`,
      admission
    )
    const excludedRecovery = await denied(contender, `/team-instances/${assignment.team.id}/recover`, control)
    const queued = await accepted(
      owner,
      `/team-instances/${assignment.team.id}/tasks/${assignment.taskId}/admit-queued`,
      admission
    )
    if (queued.status !== 'queued')
      throw new Error('Privileged durable admission did not retain an undispatched intent')
    const replacement = {
      commandId: randomUUID(),
      catalogId: first.claim.catalogId,
      expectedEpoch: first.claim.epoch,
      replacementServiceInstanceId: second.currentFence.serviceInstanceId,
      reason: 'Replace a mechanically quiesced disposable executor',
      fencingEvidenceRef: 'untrusted-operator-assertion'
    }
    const unauthorized = await denied(contender, '/execution-owner/reclaim', replacement, { privileged: false })
    const unauthenticated = await denied(contender, '/execution-owner/reclaim', replacement, { authenticated: false })
    const arbitraryEvidence = await denied(contender, '/execution-owner/reclaim', replacement)
    const quiet = await accepted(owner, '/execution-owner/quiesce', undefined, { method: 'POST' })
    if (!quiet.fencingEvidenceRef || quiet.claim.state !== 'draining')
      throw new Error('Quiesce did not record exact stopped-root evidence')
    const reclaimed = await accepted(contender, '/execution-owner/reclaim', {
      ...replacement,
      commandId: randomUUID(),
      fencingEvidenceRef: quiet.fencingEvidenceRef
    })
    if (
      reclaimed.previousFence.epoch !== first.claim.epoch ||
      reclaimed.replacementFence.epoch !== first.claim.epoch + 1 ||
      reclaimed.fencingEvidenceRef !== quiet.fencingEvidenceRef
    )
      throw new Error('Authorized reclaim did not advance and audit the exact fence')
    if (reclaimed.transferredQueuedAttemptIds.length !== 1 || reclaimed.transferredQueuedAttemptIds[0] !== queued.id) {
      throw new Error('Authorized reclaim did not transfer the one queued intent')
    }
    const staleEpoch = await denied(contender, '/execution-owner/reclaim', {
      ...replacement,
      commandId: randomUUID(),
      fencingEvidenceRef: quiet.fencingEvidenceRef
    })
    await denied(owner, `/team-instances/${assignment.team.id}/tasks/${assignment.taskId}/admit`, {
      ...admission,
      commandId: randomUUID()
    })
    const teamAfterReclaim = await accepted(contender, `/team-instances/${assignment.team.id}`)
    const dispatchInput = { commandId: randomUUID(), expectedTeamRevision: teamAfterReclaim.revision }
    await denied(owner, `/team-instances/${assignment.team.id}/attempts/${queued.id}/dispatch`, dispatchInput)
    const started = await accepted(
      contender,
      `/team-instances/${assignment.team.id}/attempts/${queued.id}/dispatch`,
      dispatchInput
    )
    const replayed = await accepted(
      contender,
      `/team-instances/${assignment.team.id}/attempts/${queued.id}/dispatch`,
      dispatchInput
    )
    if (
      started.id !== queued.id ||
      replayed.id !== queued.id ||
      started.runId !== queued.runId ||
      replayed.runId !== queued.runId
    ) {
      throw new Error('Transferred queued intent duplicated its original attempt or run')
    }
    const dispatched = await until(
      signal,
      async () => {
        const state = await accepted(contender, `/team-instances/${assignment.team.id}/execution`)
        const attempt = state.attempts.find((item) => item.id === queued.id)
        return attempt && ['succeeded', 'failed', 'cancelled', 'uncertain'].includes(attempt.status) ? attempt : null
      },
      'Reclaimed queued member turn',
      75_000
    )
    if (dispatched.executionOutcome !== 'succeeded' || dispatched.output == null)
      throw new Error('The transferred queued intent did not operate its actual selected model')
    await stop(owner)
    if (!(await accepted(contender, '/execution-owner')).ownsExecution)
      throw new Error('Old executor shutdown released the replacement claim')
    await stop(contender)
    const clean = await launch('clean-replacement')
    const cleanClaim = await accepted(clean, '/execution-owner')
    if (!cleanClaim.ownsExecution || cleanClaim.claim.epoch !== reclaimed.replacementFence.epoch + 1) {
      throw new Error('Clean joined shutdown did not permit a new monotonic claim')
    }
    await stop(clean, false)
    const afterCrash = await launch('after-crash')
    const crashClaim = await accepted(afterCrash, '/execution-owner')
    await delay(2000, undefined, { signal })
    if (
      crashClaim.ownsExecution ||
      crashClaim.claim.epoch !== cleanClaim.claim.epoch ||
      (await accepted(afterCrash, '/execution-owner')).ownsExecution
    )
      throw new Error('A crashed owner was replaced by elapsed-time takeover')
    await stop(db, false)
    let storageLost = false
    try {
      storageLost = !(await request(afterCrash, '/execution-owner')).ok
    } catch {
      storageLost = true
    }
    if (!storageLost) throw new Error('Disconnected catalog storage retained an advertised execution authority')
    return {
      source: metadata.source,
      platform,
      surrealVersion: version,
      catalogIsolation: workspace,
      singleWinner: first.currentFence,
      excludedAdmission,
      excludedRecovery,
      unauthorized,
      unauthenticated,
      arbitraryEvidence,
      staleEpoch,
      reclaim: reclaimed,
      transferredAttempt: {
        id: dispatched.id,
        runId: dispatched.runId,
        executionOutcome: dispatched.executionOutcome,
        accountingState: dispatched.accountingState
      },
      cleanReleaseEpoch: cleanClaim.claim.epoch,
      crashHoldEpoch: crashClaim.claim.epoch,
      storageLoss: 'ownership lookup refused; no execution initiated',
      unsupported: ['external crash takeover without a host-verified process-tree exclusion receipt'],
      effectBoundaryEvidence:
        'The old incarnation refused dispatch before creating a root; reclaim consumed the runtime-owned joined-root receipt.',
      settlementEvidence:
        'Joined-root replacement and original output/accounting preservation operated; no raw external settlement injection endpoint exists.'
    }
  } finally {
    for (const owned of processes.reverse()) await stop(owned, owned !== db)
  }
}
