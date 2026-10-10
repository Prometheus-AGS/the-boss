import { spawn, execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { ipc, waitFor } from './uar-team-operation-tools.mjs'

async function freePort() {
  const socket = net.createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  return port
}

function launch(binary, args, cwd, env) {
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
  child.stderr.resume()
  let failed = false
  child.on('error', () => {
    failed = true
  })
  return { child, output: () => output, failed: () => failed }
}

async function stopProcess(owned, graceful = true) {
  if (!owned?.child.pid || owned.child.exitCode !== null || owned.child.signalCode !== null) return
  const child = owned.child
  if (graceful) {
    child.stdin.end()
    const deadline = Date.now() + 20_000
    while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delay(100)
    if (child.exitCode !== null || child.signalCode !== null) return
  }
  if (process.platform === 'win32') {
    await new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], resolve))
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  if (child.exitCode === null && child.signalCode === null) await new Promise((resolve) => child.once('exit', resolve))
}

/** Trusted completed-boundary fixture. Credentials never enter the receipt. */
export async function startCooperationHost({ evaluate, signal, repository, selectInstance = true, experimentalStage = true,
  durableStorage = false }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'boss-c094-host-'))
  const platform = `${process.platform}-${process.arch}`
  const { getPackagedBinaryDirectory } = createRequire(import.meta.url)(
    path.join(repository, 'scripts', 'uar-payload-integrity.cjs')
  )
  const payload = getPackagedBinaryDirectory(
    path.join(repository, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app', 'Contents', 'Resources'),
    platform
  )
  const binary = path.join(payload, process.platform === 'win32' ? 'uar-sidecar.exe' : 'uar-sidecar')
  const surrealBinary =
    process.env.BOSS_CADENCE_SURREAL_BINARY ?? path.join(os.homedir(), '.prometheus', 'bin', 'surreal-3.3.0')
  const instanceId = 'cadence-c094-' + randomUUID().slice(0, 8)
  const databasePort = await freePort()
  const databaseStoragePath = durableStorage ? path.join(root, 'database') : null
  const databaseStorage = durableStorage ? 'surrealkv://' + databaseStoragePath : 'memory'
  const port = await freePort()
  const endpoint = `http://127.0.0.1:${port}`
  const token = randomBytes(32).toString('hex')
  const admin = randomBytes(32).toString('hex')
  const password = randomBytes(32).toString('hex')
  const encryptionKey = randomBytes(32).toString('hex')
  let principal = 'cadence-c094-host'
  let sidecar,
    database,
    previousSelection,
    selected = false
  const cwd = path.join(root, 'runtime')
  await cp(path.join(payload, 'policies'), path.join(cwd, 'policies'), { recursive: true })
  await writeFile(path.join(cwd, 'config.json'), '{}\n', { mode: 0o600 })
  await writeFile(path.join(cwd, '.env'), '', { mode: 0o600 })
  const env = {
    ...process.env,
    ...(experimentalStage ? { UAR_TEAM_EXECUTION_PROFILE_STAGE: 'operation' } : {}),
    UAR_TEAM_EXECUTION_MAX_ACTIVE: '1',
    UAR_SERVICE_INSTANCE__INSTANCE_ID: instanceId,
    UAR_SERVICE_INSTANCE__OWNERSHIP: 'external',
    UAR_SERVICE_INSTANCE__WORKSPACE_LOCATION: 'local',
    UAR_SERVICE_INSTANCE__CREDENTIAL_REF: `uar-instance://${instanceId}`,
    UAR_SERVICE_INSTANCE__RUNTIME_ENDPOINT: endpoint,
    UAR_SERVICE_INSTANCE__ADMINISTRATION_ENDPOINT: endpoint,
    UAR_SERVICE_INSTANCE__MODELS_ENDPOINT: endpoint,
    UAR_SECURITY__JWT_REQUIRED: 'false',
    UAR_SECURITY__SETTINGS_MUTATION_AUTH_REQUIRED: 'true',
    UAR_SECURITY__SETTINGS_ADMIN_KEY: admin,
    CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
    UAR_PERSISTENCE__PROVIDER: 'surreal',
    UAR_PERSISTENCE__DATABASE_URL: `ws://127.0.0.1:${databasePort}`,
    UAR_REMOTE_SURREAL_DURABILITY_ATTESTED: durableStorage ? '1' : '0',
    UAR_PERSISTENCE__SURREAL_USER: 'root',
    UAR_PERSISTENCE__SURREAL_PASS: password,
    UAR_PERSISTENCE__SURREAL_AUTH_LEVEL: 'root',
    UAR_PERSISTENCE__SURREAL_NS: 'cadence',
    UAR_PERSISTENCE__SURREAL_DB: 'cooperation',
    UAR_MODELS_DIR: path.join(payload, 'uar-models'),
    UAR_MEMORY__ENABLED: 'false',
    UAR_SKILLS__EVOLUTION_ENABLED: 'false',
    UAR_NATIVE_TOOLS__FILE_TOOLS_ENABLED: 'false',
    UAR_NATIVE_TOOLS__WEB_FETCH_ENABLED: 'false',
    UAR_NATIVE_TOOLS__TERMINAL_EXEC_ENABLED: 'false'
  }
  async function launchSidecar() {
    sidecar = launch(binary, ['--config', path.join(cwd, 'config.json'), '--port', String(port)], cwd, env)
    sidecar.child.stdin.write(token + '\n')
    await waitFor(
      signal,
      () => {
        if (sidecar.failed() || sidecar.child.exitCode !== null)
          throw new Error('Packaged C09.4 sidecar failed to initialize')
        return sidecar.output().includes(`READY:${port}`)
      },
      'Packaged C09.4 sidecar readiness',
      90_000
    )
  }
  async function trustedRequest({ workspaceId, method = 'GET', path: pathname, body }) {
    if (!pathname.startsWith('/api/v1/collaboration/') && !pathname.startsWith('/api/uar/')) {
      throw new Error('C09.4 fixture request is outside the declared runtime interfaces')
    }
    const response = await fetch(endpoint + pathname, {
      method,
      headers: {
        authorization: 'Bearer ' + token,
        'x-uar-admin-key': admin,
        'x-uar-principal': principal,
        ...(workspaceId ? { 'x-uar-workspace-id': workspaceId } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)])
    })
    const value = await response.json().catch(() => null)
    if (!response.ok) {
      const raw = value?.error?.code
      const code =
        typeof raw === 'string' && /^[a-zA-Z_][a-zA-Z0-9_-]{0,127}$/.test(raw) ? raw : 'protected-runtime-error'
      const error = new Error(`C09.4 fixture request refused: HTTP ${response.status}, ${code}`)
      error.status = response.status
      error.code = code
      throw error
    }
    return value
  }
  async function stop() {
    try {
      if (selected) {
        const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
        await ipc(evaluate, 'prometheus.uar.instances.select', {
          expectedRevision: inventory.revision,
          instanceId: previousSelection
        })
      }
    } finally {
      await stopProcess(sidecar)
      await stopProcess(database, false)
    }
  }
  try {
    database = launch(surrealBinary, ['start', '--bind', `127.0.0.1:${databasePort}`, databaseStorage], root, {
      ...process.env,
      SURREAL_USER: 'root',
      SURREAL_PASS: password,
      SURREAL_LOG: 'warn'
    })
    database.child.stdin.end()
    await waitFor(
      signal,
      async () => {
        if (database.failed() || database.child.exitCode !== null)
          throw new Error('Disposable SurrealDB failed to launch')
        return fetch(`http://127.0.0.1:${databasePort}/health`, { signal: AbortSignal.timeout(1000) })
          .then((r) => r.ok)
          .catch(() => false)
      },
      'Disposable SurrealDB readiness',
      30_000
    )
    const version = await fetch(`http://127.0.0.1:${databasePort}/version`, { signal }).then((r) => r.text())
    if (!version.includes('3.3.0')) throw new Error('C09.4 fixture requires the pinned SurrealDB 3.3.0 binary')
    await launchSidecar()
    const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
    previousSelection = inventory.selectedInstanceId
    const installed = await ipc(evaluate, 'prometheus.uar.instances.save', {
      expectedRevision: inventory.revision,
      instance: {
        id: instanceId,
        name: 'C09.4 packaged cooperation',
        enabled: true,
        ownership: 'external',
        expectedRuntimeId: instanceId,
        profile: 'uar.service-instance/1',
        minimumVersion: '',
        workspaceLocation: 'local',
        workspaceRoots: [],
        requiredCapabilities: [],
        endpoints: { runtime: endpoint, administration: endpoint, models: endpoint, console: null },
        runtimeCredentialRef: `uar-instance://${instanceId}`,
        adminCredentialRef: `uar-instance://${instanceId}/admin`
      },
      runtimeCredential: { operation: 'set', value: token },
      adminCredential: { operation: 'set', value: admin }
    })
    const inventoryAfterSelection = selectInstance
      ? await ipc(evaluate, 'prometheus.uar.instances.select', {
          expectedRevision: installed.revision,
          instanceId
        })
      : installed
    selected = selectInstance
    const tested = await ipc(evaluate, 'prometheus.uar.instances.test', { instanceId })
    if (!tested.instances.some((item) => item.id === instanceId && item.checks.operational)) {
      throw new Error('The packaged cooperation instance did not pass actual Boss connection negotiation')
    }
    return {
      instanceId,
      endpoint,
      trustedRequest,
      stop,
      setOwner(ownerId) {
        const match = /^v1:s:([0-9]+):(.+)$/.exec(ownerId)
        if (!match || Buffer.byteLength(match[2], 'utf8') !== Number(match[1])) {
          throw new Error('The disposable binding has an unsupported principal storage identity')
        }
        principal = match[2]
      },
      async restart({ graceful = true } = {}) {
        await stopProcess(sidecar, graceful)
        await launchSidecar()
        const value = await ipc(evaluate, 'prometheus.uar.instances.test', { instanceId })
        if (!value.instances.some((item) => item.id === instanceId && item.checks.operational)) {
          throw new Error('The restarted cooperation instance did not renegotiate in The Boss')
        }
      },
      evidence: {
        instanceId,
        platform,
        payload,
        databaseVersion: version.trim(),
        databaseStorageBackend: durableStorage ? 'surrealkv' : 'memory',
        databaseStoragePath,
        databaseDurabilityAttested: durableStorage,
        configuredTeamCapacity: 1,
        stage: experimentalStage ? 'operation' : 'normal',
        selectionRevision: inventoryAfterSelection.revision
      }
    }
  } catch (error) {
    await stop()
    throw error
  }
}
