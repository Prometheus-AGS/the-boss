import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from './clients.mjs'
import { correctiveScenario } from './corrective-scenario.mjs'
import { digest, requireFact, same, waitFor, write } from './io.mjs'

const priorDirectory = '/Users/gqadonis/Projects/prometheus/worktrees/agent-fabric-c06/librefang/docs/plans/agent-fabric-convergence/.prometheus/cadence/artifacts/c142-1f9c19b4-941c-4b85-be4e-8f3fa5ecc2be'
const profile = '/var/folders/ln/0wnpd96j26z2qhvx9m6hwt2r0000gn/T/cadence-boss-b5vrdX'
const revision = '36f096dbda0f17c6e15c71b284ce89cb04f04502'

export async function resumeCancellation(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    requireFact(['--boss', '--output'].includes(args[index]) && args[index + 1] &&
      !args[index + 1].startsWith('--'), 'C142_ARGUMENTS')
    options[args[index].slice(2)] = path.resolve(args[++index])
  }
  requireFact(options.boss && options.output, 'C142_ARGUMENTS')
  fs.mkdirSync(options.output, { recursive: true })
  const output = path.join(fs.realpathSync(options.output), 'c142-cancellation-' + randomUUID())
  fs.mkdirSync(output)
  const evidence = { schemaVersion: 1, kind: 'approval-cancellation-corrective-operation', creationTaskRef: 'C14.2',
    complete: false, startedAt: new Date().toISOString(), priorDirectory, isolatedProfile: profile,
    scope: 'one new pending write; visible stop; runtime restart; retained decision and cancellation',
    credentialValueRecorded: false, checks: [] }
  const controller = new AbortController()
  const signal = controller.signal
  const timeout = setTimeout(() => controller.abort(), 480000)
  const abort = () => controller.abort()
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)
  let child, connection
  try {
    evidence.stage = 'prerequisites'
    requireFact(process.platform === 'darwin' && fs.statSync(profile).isDirectory(), 'C142_PRESERVED_PROFILE_REQUIRED')
    requireFact(['UAR_TEAM_EXECUTION_PROFILE_STAGE', 'UAR_WORKFLOW_EXECUTION_PROFILE_STAGE', 'BOSS_C094_PUBLIC_QUALIFICATION']
      .every(name => process.env[name] === undefined), 'C142_EXPERIMENTAL_PROFILE_PRESENT')
    const prior = JSON.parse(fs.readFileSync(path.join(priorDirectory, 'evidence.json'), 'utf8'))
    requireFact(prior.failureStage === 'executor-stop' && prior.failureCode === 'C142_EXECUTOR_CANCELLATION_NOT_OBSERVED' &&
      same(prior.selector, { workspaceId: 'ea9ede2f-0308-4980-a7ee-e4af3b1e3984',
        teamInstanceId: '386e6e37-7411-47d1-9c6c-d085c2a8e09a' }), 'C142_EXACT_FAILED_BOUNDARY_REQUIRED')
    const app = path.join(options.boss, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Boss.app')
    const resources = path.join(app, 'Contents/Resources')
    const payload = path.join(resources, 'app.asar.unpacked/resources/binaries', 'darwin-' + process.arch)
    const pin = fs.readFileSync(path.join(options.boss, 'build/local-uar-source.json'))
    requireFact(JSON.parse(pin).revision === revision &&
      JSON.parse(fs.readFileSync(path.join(payload, '.uar-local-payload.json'), 'utf8')).source === revision,
      'C142_SOURCE_PIN_MISMATCH')
    evidence.sourceRefs = { boss: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.boss, encoding: 'utf8' }).trim(),
      bossDiffSha256: digest(execFileSync('git', ['diff', 'HEAD'], { cwd: options.boss })), uar: revision,
      sourcePinSha256: digest(pin), appAsarSha256: digest(fs.readFileSync(path.join(resources, 'app.asar'))),
      sidecarSha256: digest(fs.readFileSync(path.join(payload, 'uar-sidecar'))),
      priorEvidenceSha256: digest(fs.readFileSync(path.join(priorDirectory, 'evidence.json'))),
      scenarioFiles: Object.fromEntries(['resume-cancellation.mjs', 'corrective-scenario.mjs', 'clients.mjs',
        'scenario.mjs', 'io.mjs', '../cadence/uar-team-operation-tools.mjs']
        .map(name => [name, digest(fs.readFileSync(new URL(name, import.meta.url)))])) }
    const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP']
      .filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
    evidence.stage = 'launch-preserved-profile'
    const started = Date.now()
    child = spawn(path.join(app, 'Contents/MacOS/The Boss'), ['--lang=en-US', '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0', '--user-data-dir=' + profile],
      { cwd: options.boss, env, detached: true, shell: false, stdio: 'ignore' })
    let unavailable = false
    child.once('error', () => { unavailable = true })
    child.once('close', () => { unavailable = true })
    const alive = () => requireFact(!unavailable, 'C142_OWNED_APP_PROCESS_EXITED')
    const activePort = path.join(profile, 'DevToolsActivePort')
    const port = await waitFor(signal, () => {
      alive()
      if (!fs.existsSync(activePort) || fs.statSync(activePort).mtimeMs < started) return false
      const value = fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0]
      return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 65535 ? Number(value) : false
    }, 'C142_NEW_LOCAL_CDP_UNAVAILABLE')
    const target = await waitFor(signal, async () => {
      alive()
      const pages = await fetch('http://127.0.0.1:' + port + '/json/list', { signal }).then(response => response.json())
      return pages.find(item => item.type === 'page' && item.url.includes('/windows/main/index.html') &&
        !/^https?:/i.test(item.url) && item.webSocketDebuggerUrl)
    }, 'C142_PACKAGED_MAIN_REQUIRED')
    connection = await connect(target.webSocketDebuggerUrl, signal)
    const evaluate = expression => { alive(); return connection.evaluate(expression) }
    await waitFor(signal, () => evaluate("Boolean(window.api?.ipcApi && document.querySelector('#app-sidebar'))"),
      'C142_PRESERVED_RENDERER_UNAVAILABLE')
    evidence.clientTarget = target.id
    evidence.selector = prior.selector
    await correctiveScenario(evaluate, signal, { prior, workspaceDirectory: path.join(priorDirectory, 'workspace'),
      marker: 'C142-corrective-' + randomUUID() }, evidence)
    alive()
  } catch (error) {
    if (error.code === 'C142_EFFECT_OUTSIDE_EXACT_OPERATION_SCOPE' && error.scopeMismatch)
      evidence.scopeMismatch = error.scopeMismatch
    evidence.complete = false
    evidence.failureCode = signal.aborted ? 'C142_OPERATION_CANCELLED_OR_TIMED_OUT' :
      /^C142_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'C142_CORRECTIVE_OPERATION_UNAVAILABLE'
  } finally {
    connection?.close()
    clearTimeout(timeout)
    process.removeListener('SIGINT', abort)
    process.removeListener('SIGTERM', abort)
    if (child?.pid) {
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
      await delay(300)
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }
    evidence.finishedAt = new Date().toISOString()
    write(path.join(output, 'evidence.json'), evidence)
  }
  return { status: evidence.complete ? 'success' : 'failed', evidence: path.join(output, 'evidence.json'),
    failureCode: evidence.failureCode }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await resumeCancellation()
    process.stdout.write(JSON.stringify(result) + '\n')
    process.exitCode = result.status === 'success' ? 0 : 1
  } catch {
    process.stderr.write('C142 corrective operation arguments unavailable.\n')
    process.exitCode = 1
  }
}
