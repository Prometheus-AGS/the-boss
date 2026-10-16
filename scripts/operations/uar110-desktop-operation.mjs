import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function digestFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
const requireFact = (condition, code) => {
  if (!condition) throw Object.assign(new Error(code), { code })
}
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
const safeFailure = error => ({ code: /^[A-Z][A-Z0-9_]+$/.test(error?.code ?? '')
  ? error.code : 'UAR110_APPLICATION_OPERATION_UNCONFIRMED' })
const failedStages = ['workspace-managed-mcp-registration-and-index',
  'available-owned-workspace-mcp-connections-and-tool-inventory', 'isolated-unreachable-service-endpoint-feedback']
let configuration

async function waitFor(signal, read, code, timeout = 90000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    signal.throwIfAborted()
    const value = await read()
    if (value) return value
    await delay(300, undefined, { signal })
  }
  requireFact(false, code)
}
async function ipc(evaluate, channel, input = {}) {
  const value = await evaluate(`window.api.ipcApi.request(${JSON.stringify(channel)},${JSON.stringify(input)})`)
  requireFact(value?.ok, 'UAR110_IPC_REFUSED')
  return value.data
}
async function data(evaluate, method, resource, body) {
  const value = await evaluate(`window.api.dataApi.request(${JSON.stringify({ id: randomUUID(), method,
    path: resource, ...(body === undefined ? {} : { body }) })})`)
  requireFact(!value?.error && value?.data !== undefined, 'UAR110_DATA_API_REFUSED')
  return value.data
}
async function cache(evaluate, serverId) {
  return evaluate(`(async()=>{const all=await window.api.cache.getAllShared();
    const tools=all[${JSON.stringify('mcp.tools.' + serverId)}]?.value??[];
    const status=all[${JSON.stringify('mcp.status.' + serverId)}]?.value;
    return {tools:tools.map(tool=>({name:tool.name,inputSchema:tool.inputSchema})),
      status:status?.state??null,hasError:Boolean(status?.error)};})()`)
}
function descriptor(root, folder) {
  const filename = path.join(root, folder, 'SKILL.md')
  return { folder, present: fs.existsSync(filename),
    ...(fs.existsSync(filename) ? { sha256: digest(fs.readFileSync(filename)) } : {}) }
}
async function startup(evaluate, signal, evidence) {
  const infoResult = await evaluate('window.api.ipcApi.request("app.get_info")')
  requireFact(infoResult?.ok, 'UAR110_APP_INFO_REFUSED')
  const info = infoResult.data
  requireFact(info.isPackaged && info.version === configuration.version, 'UAR110_INSTALLED_VERSION_MISMATCH')
  requireFact(fs.realpathSync(info.appDataPath) === fs.realpathSync(path.join(configuration.profile, 'user-data')),
    'UAR110_PRIVATE_PROFILE_NOT_EFFECTIVE')
  const skills = await waitFor(signal, async () => {
    const rows = await data(evaluate, 'GET', '/skills')
    return configuration.skillNames.every(name => rows.some(row => row.folderName === name)) ? rows : false
  }, 'UAR110_BUILTIN_STARTUP_INCOMPLETE')
  const library = path.join(info.appDataPath, 'Data', 'Skills')
  const mirror = path.join(info.appDataPath, 'Data', 'Agents', '.claude', 'skills')
  const copies = await waitFor(signal, async () => {
    const rows = skills.filter(row => row.source === 'builtin').map(row => ({
      id: row.id, namespace: row.namespace, library: descriptor(library, row.folderName),
      mirror: descriptor(mirror, row.folderName)
    }))
    return rows.every(row => row.library.present && row.mirror.present &&
      row.library.sha256 === row.mirror.sha256) ? rows : false
  }, 'UAR110_CLAUDE_MIRROR_INCOMPLETE')
  const snapshot = await ipc(evaluate, 'prometheus.integration.snapshot')
  requireFact(snapshot.commandDirectory.startsWith(configuration.profile + path.sep),
    'UAR110_COMMAND_DIRECTORY_NOT_ISOLATED')
  const shellHome = fs.realpathSync(path.join(configuration.profile, 'home'))
  requireFact(shellHome.startsWith(configuration.profile + path.sep), 'UAR110_SHELL_HOME_NOT_ISOLATED')
  const registration = JSON.parse(fs.readFileSync(path.join(configuration.profile, 'config', 'config', 'path-registration.json'), 'utf8'))
  requireFact(registration.directory === snapshot.commandDirectory && registration.files.length > 0 &&
    registration.files.every(file => path.resolve(file).startsWith(shellHome + path.sep)), 'UAR110_SHELL_REGISTRATION_ESCAPED_PROFILE')
  const pack = path.join(info.appDataPath, 'Data', 'PrometheusPack')
  const entries = ['scripts/doctor.mjs', 'lib', 'rules', 'node_modules/@fission-ai/openspec/bin/openspec.js']
    .map(name => ({ path: name, present: fs.existsSync(path.join(pack, name)) }))
  requireFact(entries.every(entry => entry.present), 'UAR110_WRITABLE_PACK_INCOMPLETE')
  const shims = ['boss-mini', 'openspec', 'mini-runner.cjs'].map(name => {
    const file = path.join(snapshot.commandDirectory, name)
    requireFact(fs.existsSync(file), 'UAR110_PACKAGED_SHIM_MISSING')
    return { name, sha256: digest(fs.readFileSync(file)) }
  })
  evidence.startup = { version: info.version, profile: info.appDataPath, commandDirectory: snapshot.commandDirectory,
    catalog: copies, writablePack: entries, shims,
    shellRegistration: { home: shellHome, files: registration.files, added: registration.added } }
  return { snapshot, info, skills }
}
async function terminal(evaluate, signal, operation) {
  return waitFor(signal, async () => {
    const page = await ipc(evaluate, 'prometheus.integration.operation_events', { id: operation.id, limit: 200 })
    return ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(page.operation.status) ? page : false
  }, 'UAR110_OPERATION_DID_NOT_TERMINATE', 150000)
}
const operationSummary = page => ({ id: page.operation.id, action: page.operation.action,
  status: page.operation.status, errorCode: page.operation.errorCode,
  recoveryAction: page.operation.recoveryAction,
  stages: [...new Set(page.events.filter(event => event.stage).map(event => event.stage))],
  diagnostics: page.operation.diagnostics?.map(item => ({ id: item.id, state: item.state })) })

async function stopOwnedApp(launch, app, profile) {
  requireFact(launch.keptOpen && Number.isInteger(launch.pid) && launch.pid > 0 &&
    launch.app === app && launch.isolatedProfileRoot === profile &&
    launch.isolatedUserData === path.join(profile, 'user-data') &&
    launch.isolatedSessionData === path.join(profile, 'session-data'), 'UAR110_OWNED_APP_IDENTITY_UNAVAILABLE')
  const command = execFileSync('ps', ['-p', String(launch.pid), '-o', 'command='], { encoding: 'utf8' }).trim()
  requireFact(command.includes(path.join(app, 'Contents', 'MacOS', 'The Boss')) &&
    command.includes('--user-data-dir=' + path.join(profile, 'user-data')), 'UAR110_OWNED_APP_PID_NO_LONGER_MATCHES')
  const portFile = path.join(launch.isolatedSessionData, 'DevToolsActivePort')
  const beforeStat = fs.existsSync(portFile) ? fs.lstatSync(portFile) : null
  requireFact(!beforeStat || beforeStat.isFile(), 'UAR110_PRIVATE_DEVTOOLS_PORT_NOT_REGULAR')
  const beforePort = beforeStat ? { stat: beforeStat, bytes: fs.readFileSync(portFile) } : null
  process.kill(launch.pid, 'SIGTERM')
  const end = Date.now() + 8000
  while (Date.now() < end) {
    try { process.kill(launch.pid, 0) }
    catch (error) {
      if (error.code === 'ESRCH') {
        let removed = false
        if (fs.existsSync(portFile)) {
          const current = fs.lstatSync(portFile)
          requireFact(beforePort && current.isFile() && current.dev === beforePort.stat.dev &&
            current.ino === beforePort.stat.ino && current.mtimeMs === beforePort.stat.mtimeMs &&
            fs.readFileSync(portFile).equals(beforePort.bytes), 'UAR110_PRIVATE_DEVTOOLS_PORT_CHANGED_AFTER_STOP')
          fs.unlinkSync(portFile)
          removed = true
        }
        return { pid: launch.pid, signal: 'SIGTERM', exited: true,
          devToolsPortFile: { path: portFile, removedAfterConfirmedExit: removed } }
      }
      throw error
    }
    await delay(200)
  }
  requireFact(false, 'UAR110_OWNED_APP_GRACEFUL_STOP_PENDING_NO_FORCE')
}

function publicPayloadIdentity(bundled) {
  const directory = path.join(bundled, 'binaries', 'darwin-arm64')
  const payloadFile = path.join(directory, 'payload-manifest.json')
  const integrationFile = path.join(bundled, 'prometheus-skills-mini', 'release-manifest.json')
  const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'))
  const integration = JSON.parse(fs.readFileSync(integrationFile, 'utf8'))
  const expected = 'd815ef72ac7d2c57a9bd18b23fcc58ffb224f326'
  const platformSource = pin => pin?.platformRevisions?.['darwin-arm64'] ?? pin?.revision
  requireFact(!fs.existsSync(path.join(directory, '.uar-local-payload.json')), 'UAR110_PUBLIC_PACKAGE_HAS_LOCAL_MARKER')
  requireFact(payload.schema === 1 && payload.name === 'uar-sidecar' && payload.version === '1.1.0' &&
    payload.platform === 'darwin-arm64' && payload.source === expected && payload.features?.includes('server-full') &&
    Array.isArray(payload.files) && payload.files.some(file => file.path === 'uar-sidecar'),
  'UAR110_PUBLIC_PAYLOAD_MANIFEST_IDENTITY_MISMATCH')
  requireFact(integration.schema === 1 && integration.tools?.['uar-sidecar'] === '1.1.0' &&
    platformSource(integration.sources?.uar) === expected && platformSource(integration.sourceIntent?.uar) === expected &&
    !integration.localNativePayloads?.['uar-sidecar'], 'UAR110_PACKAGED_INTEGRATION_SOURCE_MISMATCH')
  const version = fs.readFileSync(path.join(directory, '.uar-sidecar-version'), 'utf8').trim()
  requireFact(version === '1.1.0', 'UAR110_PACKAGED_NATIVE_VERSION_MISMATCH')
  return { payloadManifest: { path: payloadFile, sha256: digest(fs.readFileSync(payloadFile)), identity: payload },
    packagedIntegration: { path: integrationFile, sha256: digest(fs.readFileSync(integrationFile)),
      toolVersion: integration.tools['uar-sidecar'], source: integration.sources.uar, sourceIntent: integration.sourceIntent.uar },
    actualExecutable: { path: path.join(directory, 'uar-sidecar'),
      sha256: digest(fs.readFileSync(path.join(directory, 'uar-sidecar'))) }, version }
}

export default async function scenario({ evaluate, signal }) {
  requireFact(configuration, 'UAR110_RUN_THROUGH_OPERATION_WRAPPER')
  const evidence = { schemaVersion: 1, kind: 'uar110-installed-desktop-operation', phase: configuration.phase,
    sourceRefs: configuration.sourceRefs, startedAt: new Date().toISOString(), complete: false,
    checks: [], failures: [], pending: [], credentialValuesRecorded: false }
  if (configuration.resume) {
    evidence.retained = configuration.resume
    evidence.pending = configuration.resume.pending
    evidence.workspaceId = configuration.resume.workspaceId
  }
  const pending = (clause, reason) => { if (!configuration.resume) evidence.pending.push({ clause, reason }) }
  const step = async (name, action) => {
    if (configuration.resume && !failedStages.includes(name) && name !== 'restore-owned-service-configuration') return
    try { await action(); evidence.checks.push(name) }
    catch (error) { evidence.failures.push({ stage: name, ...safeFailure(error) }) }
  }
  let originalServices, createdMissingServer
  try {
    await waitFor(signal, () => evaluate(`(()=>{const skip=[...document.querySelectorAll('button')]
      .find(node=>node.getClientRects().length&&node.innerText.trim()==='Set up later');
      if(skip)skip.click();return Boolean(document.querySelector('#app-sidebar,[data-ui="settings.view"]'));})()`), 'UAR110_ONBOARDING_UNAVAILABLE')
    let initial
    if (configuration.resume) {
      const response = await evaluate('window.api.ipcApi.request("app.get_info")')
      requireFact(response?.ok, 'UAR110_RESUME_APP_INFO_REFUSED')
      const info = response.data
      requireFact(info.isPackaged && info.version === configuration.version &&
        fs.realpathSync(info.appDataPath) === fs.realpathSync(path.join(configuration.profile, 'user-data')),
      'UAR110_RESUME_APP_IDENTITY_CHANGED')
    } else {
      initial = await startup(evaluate, signal, evidence)
      evidence.checks.push('actual-installed-private-profile-startup-catalog-library-mirror-pack-shims')
    }
    if (configuration.phase === 'reopen') {
      const before = JSON.parse(fs.readFileSync(configuration.firstEvidence, 'utf8'))
      requireFact(JSON.stringify(before.startup.shims) === JSON.stringify(evidence.startup.shims),
        'UAR110_UNCHANGED_LAUNCH_SHIMS_CHANGED')
      const owned = initial.skills.find(row => row.folderName === configuration.userSkillName)
      requireFact(owned && owned.source !== 'builtin', 'UAR110_USER_SKILL_NOT_PRESERVED')
      requireFact(descriptor(path.join(initial.info.appDataPath, 'Data', 'Skills'), configuration.userSkillName).sha256 ===
        configuration.userSkillDigest, 'UAR110_USER_SKILL_BYTES_CHANGED')
      evidence.checks.push('whole-owned-app-relaunch-preserves-user-skill-and-shims')
      pending('retained-native-mcp-policy', 'Boss renderer exposes no native MCP catalog settings namespace; SQLite workspace MCP records are not native hydration proof.')
    } else {
      await step('doctor-through-existing-installed-ipc', async () => {
        const report = await ipc(evaluate, 'prometheus.doctor.run')
        evidence.doctor = { available: report.available, complete: report.complete,
          results: report.results.map(row => ({ id: row.id, status: row.status, fixId: row.fixId })) }
        requireFact(report.available !== false && report.complete, 'UAR110_DOCTOR_COULD_NOT_COMPLETE')
      })
      await step('user-owned-skill-install-and-reconcile', async () => {
        const installed = await ipc(evaluate, 'skill.install_from_directory', { directoryPath: configuration.userSkill })
        requireFact(installed.success, 'UAR110_USER_SKILL_INSTALL_REFUSED')
        await ipc(evaluate, 'skill.reconcile')
      })
      await step('workspace-managed-mcp-registration-and-index', async () => {
        if (!configuration.resume) {
          const registered = await data(evaluate, 'POST', '/agent-workspaces', { path: configuration.workspace,
            name: 'UAR 1.1 desktop operation' })
          evidence.workspaceId = registered.id
          let snapshot = await ipc(evaluate, 'prometheus.integration.snapshot')
          await ipc(evaluate, 'prometheus.integration.configure', { updates: [
            { feature: 'compass', expectedRevision: snapshot.revisions.compass,
              value: { ...snapshot.config.compass, storage: 'json', enabled: true } },
            { feature: 'filesystem', expectedRevision: snapshot.revisions.filesystem,
              value: { enabled: true, allowWrite: false, additionalRoots: [] } }
          ], secrets: {} })
          await ipc(evaluate, 'prometheus.integration.workspace_enabled', { workspacePath: configuration.workspace, enabled: true })
        }
        const indexed = await terminal(evaluate, signal, await ipc(evaluate, 'prometheus.integration.start',
          { action: 'index', workspacePath: configuration.workspace }))
        evidence.index = operationSummary(indexed)
        requireFact(indexed.operation.status === 'succeeded', 'UAR110_WORKSPACE_INDEX_FAILED')
      })
      await step('available-owned-workspace-mcp-connections-and-tool-inventory', async () => {
        const servers = (await data(evaluate, 'GET', '/mcp-servers')).items.filter(server =>
          server.tags?.includes('the-boss:workspace-managed') && server.cwd === configuration.workspace && server.isActive)
        requireFact(servers.some(server => server.reference?.startsWith('filesystem:')) &&
          servers.some(server => server.reference?.startsWith('compass:')), 'UAR110_ADVERTISED_WORKSPACE_SERVERS_MISSING')
        evidence.mcp = []
        for (const server of servers) {
          requireFact(server.type === 'stdio' && server.cwd === configuration.workspace, 'UAR110_MCP_SCOPE_MISMATCH')
          if (server.reference.startsWith('filesystem:')) requireFact(server.env?.ALLOW_WRITE === 'false' &&
            !server.args?.includes('--allow-write'), 'UAR110_FILESYSTEM_WRITE_DEFAULT_CHANGED')
          await ipc(evaluate, 'mcp.server.refresh_tools', { serverId: server.id })
          const connected = await ipc(evaluate, 'mcp.server.check_connectivity', { serverId: server.id })
          const inventory = await cache(evaluate, server.id)
          evidence.mcp.push({ id: server.id, reference: server.reference, transport: server.type,
            command: server.command, cwd: server.cwd, connected, ...inventory })
          requireFact(connected && inventory.tools.length > 0, 'UAR110_MCP_CONNECT_OR_TOOL_LIST_FAILED')
        }
      })
      await step('readonly-fixture-file-through-existing-file-ipc', async () => {
        const read = await ipc(evaluate, 'file.read', { handle: { kind: 'path', path: configuration.readme },
          options: { mode: 'full', encoding: 'binary' } })
        const bytes = Buffer.from(Object.values(read.content))
        requireFact(digest(bytes) === configuration.markerDigest, 'UAR110_FILE_IPC_BYTES_DIFFER')
        evidence.readonlyFile = { boundary: 'file.read IPC; not an MCP tool invocation', sha256: digest(bytes) }
      })
      pending('filesystem-mcp-tool-invocation', 'No direct renderer MCP tool-call API exists; file.read IPC proves only that separate boundary. No inference or approval bypass added.')
      pending('shared-memory-connection', 'Fresh private profile has no operator-configured memory connection; retain earlier memory operation without recreating authorization cycles.')
      await step('owned-missing-executable-refusal', async () => {
        const server = await data(evaluate, 'POST', '/mcp-servers', { name: 'UAR110 missing fixture',
          type: 'stdio', command: path.join(configuration.workspace, 'does-not-exist'),
          cwd: configuration.workspace, args: [], isActive: true })
        createdMissingServer = server.id
        const response = await evaluate(`window.api.ipcApi.request('mcp.server.refresh_tools',${JSON.stringify({ serverId: server.id })})`)
        const state = await cache(evaluate, server.id)
        requireFact(!response?.ok && state.tools.length === 0, 'UAR110_MISSING_COMMAND_NOT_REFUSED')
        evidence.missingExecutable = { serverId: server.id, refused: true, state: state.status,
          refusalCode: response.error?.code, hasError: state.hasError }
        await ipc(evaluate, 'navigation.open_route_in_main', { path: '/settings/mcp/servers' })
        evidence.missingExecutable.visible = await waitFor(signal, () => evaluate(`document.body.innerText.includes('UAR110 missing fixture')`),
          'UAR110_MISSING_SERVER_NOT_VISIBLE', 15000)
      })
      await step('isolated-unreachable-service-endpoint-feedback', async () => {
        await ipc(evaluate, 'navigation.open_route_in_main', { path: '/settings/mcp/servers' })
        const snapshot = await ipc(evaluate, 'prometheus.integration.snapshot')
        originalServices = snapshot.config.services
        const down = { ownership: 'external', source: 'manual', endpoint: 'http://127.0.0.1:1' }
        await ipc(evaluate, 'prometheus.integration.configure', { updates: [{ feature: 'services',
          expectedRevision: snapshot.revisions.services, value: { ...originalServices,
            surrealdb: down, memory: down, liter: down } }], secrets: {} })
        const result = await terminal(evaluate, signal, await ipc(evaluate, 'prometheus.integration.start', { action: 'status' }))
        evidence.degradedServices = operationSummary(result)
        requireFact(result.operation.diagnostics?.filter(row => ['surrealdb', 'memory', 'gateway'].includes(row.id))
          .every(row => row.state === 'failed') && result.operation.diagnostics.some(row => row.id === 'memory'),
        'UAR110_UNREACHABLE_ENDPOINT_NOT_REPORTED')
        await ipc(evaluate, 'navigation.open_route_in_main', { path: '/settings/services' })
        const ui = await waitFor(signal, () => evaluate(`(()=>{
          const group=document.querySelector('#setting-services-service-management');
          const visible=node=>Boolean(node?.getClientRects().length);
          if(!visible(document.querySelector('[data-ui="settings.navigation"]'))||!visible(group))return false;
          const diagnostics=[...group.querySelectorAll('dl dt')].filter(visible).map(node=>({
            id:node.textContent,stateLabel:node.parentElement.nextElementSibling?.textContent?.trim()}));
          return [...group.querySelectorAll('button')].some(node=>visible(node)&&!node.disabled)&&
            ['surrealdb','memory','gateway'].every(id=>diagnostics.some(row=>row.id===id&&row.stateLabel))
            ?{diagnostics}:false;
        })()`), 'UAR110_DEGRADED_UI_UNAVAILABLE')
        evidence.degradedServices.usableUi = true
        evidence.degradedServices.ui = ui
      })
      if (!configuration.resume) {
        const nativeResponse = await evaluate('window.api.ipcApi.request("prometheus.uar.operations.read",{})')
        if (nativeResponse?.ok) {
          const snapshot = nativeResponse.data
          evidence.nativeInventory = { generation: snapshot.generation, runCount: snapshot.runs.length,
            nativeMcp: snapshot.tools.mcpServers.map(server => ({ name: server.name, status: server.status, toolCount: server.toolCount })) }
        }
        pending('native-runs-cancel-reopen', nativeResponse?.ok
          ? 'No new inference or arbitrary run is admitted by this driver. A normal Work-created owned run is required before cancellation can qualify.'
          : 'Native operations IPC is unavailable in this fresh profile; no owner or run is fabricated.')
        pending('native-mcp-retained-and-empty-catalog-hydration', 'No existing renderer namespace mutates the native catalog; do not replace it with Boss SQLite records or raw native requests.')
        pending('openspec-command-execution', 'Existing shims and JS closure captured; no supported renderer IPC executes the openspec shim directly.')
        pending('doctor-streaming-repair-and-docker-absent-down', 'Buffered doctor, actual offered repairs and distinct Docker installation/daemon states are not simulated.')
      }
    }
  } catch (error) { evidence.failures.push({ stage: 'startup', ...safeFailure(error) }) }
  finally {
    if (originalServices) await step('restore-owned-service-configuration', async () => {
      const current = await ipc(evaluate, 'prometheus.integration.snapshot')
      await ipc(evaluate, 'prometheus.integration.configure', { updates: [{ feature: 'services',
        expectedRevision: current.revisions.services, value: originalServices }], secrets: {} })
    })
    if (createdMissingServer) await step('remove-only-owned-missing-command-record', () =>
      ipc(evaluate, 'mcp.server.remove', { serverId: createdMissingServer }))
    evidence.complete = evidence.failures.length === 0 && evidence.pending.length === 0
    evidence.status = evidence.failures.length ? 'failed' : evidence.pending.length ? 'partial' : 'passed'
    evidence.finishedAt = new Date().toISOString()
    save(configuration.evidence, evidence)
  }
  return { passed: evidence.failures.length === 0, observedBehavior: JSON.stringify({ status: evidence.status,
    evidence: configuration.evidence, checks: evidence.checks, pending: evidence.pending.map(item => item.clause) }) }
}

async function main(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    requireFact(['--boss', '--app', '--launcher', '--output', '--version', '--resume'].includes(args[index]) && args[index + 1], 'UAR110_ARGUMENTS')
    options[args[index].slice(2)] = args[index + 1]
  }
  requireFact(process.platform === 'darwin' && process.arch === 'arm64' &&
    ['boss', 'app', 'launcher', 'output'].every(name => options[name]), 'UAR110_EXPLICIT_MAC_INPUTS_REQUIRED')
  const repository = fs.realpathSync(options.boss), app = fs.realpathSync(options.app), launcher = fs.realpathSync(options.launcher)
  options.version ??= JSON.parse(fs.readFileSync(path.join(repository, 'package.json'), 'utf8')).version
  requireFact(options.version === '2.2.39', 'UAR110_ONLY_NEW_2239_CANDIDATE_ALLOWED')
  requireFact(app.startsWith('/Applications/') && app.endsWith('/The Boss.app'), 'UAR110_INSTALLED_APP_REQUIRED')
  const launcherSource = fs.readFileSync(launcher, 'utf8')
  requireFact(launcherSource.includes('THE_BOSS_PROFILE_ROOT'), 'UAR110_MAINTAINED_LAUNCHER_PRIVATE_PROFILE_SUPPORT_REQUIRED')
  const retainAt = launcherSource.indexOf("retain = Boolean(args['keep-open'])")
  requireFact(retainAt >= 0 && retainAt < launcherSource.indexOf('const receipt ='),
    'UAR110_LAUNCHER_MUST_RETAIN_OWNED_APP_ON_FAILURE')
  const registrySource = fs.readFileSync(path.join(repository, 'src/main/core/paths/pathRegistry.ts'), 'utf8')
  const shellHomeEntry = registrySource.split("'external.shell.home':")[1]?.split(/\n\s*'[^']+':/)[0]
  requireFact(shellHomeEntry?.includes('PRIVATE_PROFILE_PATHS'), 'UAR110_PRIVATE_SHELL_HOME_SOURCE_FIX_REQUIRED')
  const output = fs.realpathSync(path.dirname(path.resolve(options.output)))
  const destination = path.join(output, path.basename(options.output))
  fs.mkdirSync(destination)
  const priorFile = options.resume && fs.realpathSync(options.resume)
  const prior = priorFile && JSON.parse(fs.readFileSync(priorFile, 'utf8'))
  const priorPhase = prior?.phases?.[0]
  const priorEvidence = prior && JSON.parse(fs.readFileSync(priorPhase.evidence, 'utf8'))
  if (prior) {
    requireFact(prior.kind === 'uar110-bounded-installed-operation' && prior.phases.length === 1 &&
      priorPhase.phase === 'initial' && priorPhase.shutdown?.exited && priorPhase.shutdown.signal === 'SIGTERM' &&
      prior.sourceRefs.installedApp === app && prior.profile === path.join(path.dirname(priorFile), 'profile') &&
      prior.workspace === path.join(path.dirname(priorFile), 'workspace') &&
      priorEvidence.failures.length === 3 && failedStages.every(stage => priorEvidence.failures.some(row => row.stage === stage)),
    'UAR110_RESUME_REQUIRES_OWNED_THREE_FAILURE_RECEIPT')
    try { process.kill(priorPhase.pid, 0); requireFact(false, 'UAR110_PRIOR_OWNED_PID_STILL_PRESENT') }
    catch (error) { if (error.code !== 'ESRCH') throw error }
    requireFact(!fs.existsSync(path.join(prior.profile, 'session-data', 'DevToolsActivePort')),
      'UAR110_PRIOR_OWNED_PORT_CLEANUP_REQUIRED')
  }
  const profile = prior?.profile ?? path.join(destination, 'profile'), workspace = prior?.workspace ?? path.join(destination, 'workspace')
  if (!prior) { fs.mkdirSync(profile); fs.mkdirSync(workspace) }
  const readme = path.join(workspace, 'README.md'), marker = 'UAR110-' + randomUUID()
  if (!prior) fs.writeFileSync(readme, '# Owned UAR 1.1 operation\n\n' + marker + '\n', { flag: 'wx' })
  const userSkillName = 'uar110-owned-user-skill', userSkill = path.join(prior ? path.dirname(priorFile) : destination, userSkillName)
  const userBytes = Buffer.from('---\nname: uar110-owned-user-skill\ndescription: Owned operation fixture.\n---\n\nRead the owned README only.\n')
  if (!prior) { fs.mkdirSync(userSkill); fs.writeFileSync(path.join(userSkill, 'SKILL.md'), userBytes) }
  const resources = path.join(app, 'Contents', 'Resources'), asar = path.join(resources, 'app.asar')
  const bundled = path.join(resources, 'app.asar.unpacked', 'resources')
  const skillNames = fs.readdirSync(path.join(bundled, 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  requireFact(skillNames.length > 0, 'UAR110_BUNDLED_SKILL_INVENTORY_ABSENT')
  const sourceRefs = { bossCheckoutHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    installedBossSourceRelationship: 'Lead must bind installed ASAR hash to frozen built candidate; checkout HEAD alone is not that proof.',
    installedApp: app, appAsarSha256: await digestFile(asar), launcherSha256: digest(Buffer.from(launcherSource)),
    scenarioSha256: digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    uarPayload: publicPayloadIdentity(bundled) }
  if (prior) requireFact(sourceRefs.appAsarSha256 === prior.sourceRefs.appAsarSha256 &&
    sourceRefs.uarPayload.actualExecutable.sha256 === prior.sourceRefs.uarPayload.actualExecutable.sha256,
  'UAR110_RESUME_INSTALLED_CANDIDATE_CHANGED')
  const fixture = path.join(workspace, 'operation-fixture.js')
  const fixtureBytes = Buffer.from('function show(value) { return value; }\nmodule.exports = { show };\n')
  if (prior && fs.existsSync(fixture)) requireFact(fs.readFileSync(fixture).equals(fixtureBytes),
    'UAR110_OWNED_SOURCE_FIXTURE_CHANGED')
  else fs.writeFileSync(fixture, fixtureBytes, { flag: 'wx' })
  const previousProfile = process.env.THE_BOSS_PROFILE_ROOT
  requireFact(previousProfile === undefined, 'UAR110_CALLER_PROFILE_OVERRIDE_PRESENT')
  process.env.THE_BOSS_PROFILE_ROOT = profile
  const operation = { schemaVersion: 1, kind: 'uar110-bounded-installed-operation', sourceRefs,
    profile, workspace, ...(prior ? { priorReceipt: { path: priorFile, sha256: digest(fs.readFileSync(priorFile)) } } : {}),
    startedAt: new Date().toISOString(), phases: [], complete: false }
  try {
    const { launchBoss } = await import(pathToFileURL(launcher).href)
    for (const phase of prior ? ['failed-only'] : ['initial', 'reopen']) {
      const evidence = path.join(destination, phase + '-evidence.json')
      configuration = { version: options.version, profile, workspace, readme, markerDigest: digest(fs.readFileSync(readme)),
        userSkillName, userSkill, userSkillDigest: digest(userBytes), skillNames, sourceRefs, phase, evidence,
        firstEvidence: path.join(destination, 'initial-evidence.json'),
        resume: prior && { evidence: priorPhase.evidence, sha256: digest(fs.readFileSync(priorPhase.evidence)),
          checks: priorEvidence.checks, pending: priorEvidence.pending, workspaceId: priorEvidence.workspaceId } }
      const launch = await launchBoss({ repository, app, scenario: fileURLToPath(import.meta.url),
        'require-scenario': true, 'keep-open': true, 'timeout-ms': 600000,
        receipt: path.join(destination, phase + '-launch.json') })
      const record = { phase, launchStatus: launch.status, launchReceipt: launch.receiptFile,
        evidence: fs.existsSync(evidence) ? evidence : null, pid: launch.pid }
      operation.phases.push(record)
      try { record.shutdown = await stopOwnedApp(launch, app, profile) }
      catch (error) {
        record.shutdown = { pid: launch.pid, exited: false, ...safeFailure(error) }
        operation.status = 'failed'
        break
      }
      if (launch.status !== 'success') break
    }
    operation.complete = operation.phases.length === 2 && operation.phases.every(phase =>
      phase.evidence && JSON.parse(fs.readFileSync(phase.evidence, 'utf8')).complete)
    operation.status ??= operation.phases.some(phase => phase.launchStatus !== 'success') ? 'failed' : operation.complete ? 'passed' : 'partial'
  } finally {
    delete process.env.THE_BOSS_PROFILE_ROOT
    operation.finishedAt = new Date().toISOString()
    save(path.join(destination, 'operation.json'), operation)
  }
  process.stdout.write(JSON.stringify({ status: operation.status, receipt: path.join(destination, 'operation.json') }) + '\n')
  process.exitCode = operation.status === 'failed' ? 1 : operation.complete ? 0 : 2
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(JSON.stringify(safeFailure(error)) + '\n')
    process.exitCode = 1
  })
}
