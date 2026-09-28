import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

import type {
  UarDurableBinding,
  UarDurableInstance,
  UarDurableObserver,
  UarDurableWorkspaceSnapshot
} from '../../../src/shared/types/uarDurableAdministration'

const appPath = process.env.D01_APP_PATH
const evidencePath = process.env.D01_EVIDENCE_PATH
const ollamaBaseUrl = 'http://127.0.0.1:11434'
const ollamaModel = 'llama3.2:1b'

type AppInfo = { isPackaged: boolean; appDataPath: string; homePath: string }
type Operation = { id: string; status: string; output: string; error?: string }
type IntegrationSnapshot = {
  operations: Operation[]
  uar: {
    state: string
    binarySource?: string
    binaryVersion?: string
    binarySourceCommit?: string
    binaryArchiveSha256?: string
    appliedPort: number
    effectivePort?: number
  }
}

function packagedExecutable(): string {
  if (!appPath?.trim()) throw new Error('D01_APP_PATH must point to the packaged Mac .app')
  const bundle = resolve(appPath)
  if (!bundle.endsWith('.app') || !statSync(bundle).isDirectory()) {
    throw new Error('D01_APP_PATH must point to a packaged Mac .app directory')
  }
  const macOS = join(bundle, 'Contents', 'MacOS')
  const executables = readdirSync(macOS).filter((name) => {
    const stat = statSync(join(macOS, name))
    return stat.isFile() && Boolean(stat.mode & 0o111)
  })
  if (executables.length !== 1) throw new Error(`Expected one packaged app executable in ${macOS}`)
  return join(macOS, executables[0])
}

async function mainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => {
      try {
        return new URL(candidate.url()).pathname.endsWith('/windows/main/index.html')
      } catch {
        return false
      }
    })
    if (page) {
      await page.locator('#root').waitFor({ state: 'visible', timeout: 60_000 })
      return page
    }
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error('Packaged Boss main window did not become ready')
}

async function launch(executablePath: string, home: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_CACHE_HOME: join(home, '.cache'),
    NODE_ENV: 'production',
    THE_BOSS_UAR_SIDECAR_PATH: ''
  }
  const app = await electron.launch({ executablePath, args: [], env, timeout: 60_000 })
  return { app, page: await mainWindow(app) }
}

async function closeApp(app: ElectronApplication): Promise<void> {
  const child = app.process()
  await Promise.race([app.close(), new Promise<void>((done) => setTimeout(done, 10_000))]).catch(() => undefined)
  if (child?.exitCode === null) child.kill('SIGTERM')
}

async function ipcResult<T>(page: Page, route: string, input?: unknown) {
  return (await page.evaluate(({ route, input }) => window.api.ipcApi.request(route, input), { route, input })) as {
    ok: boolean
    data?: T
    error?: { message?: string }
  }
}

async function ipc<T>(page: Page, route: string, input?: unknown): Promise<T> {
  const result = await ipcResult<T>(page, route, input)
  if (!result.ok) throw new Error(result.error?.message ?? `${route} failed`)
  return result.data as T
}

async function workspace(page: Page, path: string): Promise<{ id: string }> {
  const result = (await page.evaluate(
    (workspacePath) =>
      window.api.dataApi.request({
        id: crypto.randomUUID(),
        method: 'POST',
        path: '/agent-workspaces',
        body: { path: workspacePath }
      }),
    path
  )) as { data?: { id: string }; error?: { message?: string } }
  if (result.error || !result.data?.id) throw new Error(result.error?.message ?? 'Creating user workspace failed')
  return result.data
}

async function integration(page: Page): Promise<IntegrationSnapshot> {
  return ipc<IntegrationSnapshot>(page, 'prometheus.integration.snapshot', {})
}

async function runOperation(page: Page, action: 'uar-check' | 'uar-restart'): Promise<Operation> {
  const started = await ipc<Operation>(page, 'prometheus.integration.start', { action })
  let result: Operation | undefined
  await expect
    .poll(
      async () => {
        result = (await integration(page)).operations.find((item) => item.id === started.id)
        return result?.status
      },
      { timeout: 2 * 60_000 }
    )
    .toMatch(/^(succeeded|failed|cancelled|interrupted)$/)
  if (result?.status !== 'succeeded')
    throw new Error(`${action} failed: ${result?.error ?? result?.output ?? 'no result'}`)
  return result
}

async function durable(page: Page, workspaceId: string): Promise<UarDurableWorkspaceSnapshot> {
  return ipc(page, 'prometheus.uar.durable.read', { workspaceId })
}

async function createInstance(
  page: Page,
  workspaceId: string,
  binding: UarDurableBinding,
  profile: 'on_demand' | 'resident'
) {
  return ipc<UarDurableInstance>(page, 'prometheus.uar.durable.create_instance', {
    workspaceId,
    deploymentBindingId: binding.id,
    profile
  })
}

async function activate(page: Page, workspaceId: string, instanceId: string): Promise<void> {
  await ipc<UarDurableInstance>(page, 'prometheus.uar.durable.instance_action', {
    workspaceId,
    instanceId,
    action: 'activate',
    commandId: crypto.randomUUID()
  })
  await expect
    .poll(
      async () =>
        (await durable(page, workspaceId)).instances.find((item) => item.instanceId === instanceId)?.lifecycle,
      { timeout: 90_000 }
    )
    .toBe('active')
}

async function requireOllamaModel(): Promise<void> {
  const response = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Local Ollama is unavailable (HTTP ${response.status})`)
  const catalog = (await response.json()) as { models?: Array<{ name?: string }> }
  if (!catalog.models?.some((model) => model.name === ollamaModel || model.name?.startsWith(`${ollamaModel}:`))) {
    throw new Error(`Local Ollama model ${ollamaModel} is required for the D01 gate`)
  }
}

test('D01 packaged Mac: starter instances and local observer survive restart within isolated workspaces', async () => {
  test.setTimeout(20 * 60_000)
  const executable = packagedExecutable()
  await requireOllamaModel()
  const root = mkdtempSync(join(tmpdir(), 'the-boss-d01-'))
  const home = join(root, 'home')
  mkdirSync(home, { recursive: true })
  const isolatedData = join(root, 'app-data')
  mkdirSync(isolatedData)
  const bootConfigDirectory = join(home, '.the-boss')
  mkdirSync(bootConfigDirectory)
  writeFileSync(
    join(bootConfigDirectory, 'boot-config.json'),
    JSON.stringify({ 'app.user_data_path': { [executable]: isolatedData } })
  )
  const workspaceAPath = join(root, 'workspace-a')
  const workspaceBPath = join(root, 'workspace-b')
  mkdirSync(workspaceAPath)
  mkdirSync(workspaceBPath)

  let app: ElectronApplication | undefined
  try {
    let launched = await launch(executable, home)
    app = launched.app
    const info = await ipc<AppInfo>(launched.page, 'app.get_info')
    expect(info.isPackaged).toBe(true)
    expect(info.appDataPath).toBe(isolatedData)
    await launched.page.evaluate(() =>
      window.api.preference.setMultiple({
        'app.language': 'en-US',
        'app.onboarding.provider_setup.status': 'skipped',
        'app.privacy.data_collection.enabled': false
      })
    )
    await closeApp(app)

    launched = await launch(executable, home)
    app = launched.app
    let page = launched.page
    await runOperation(page, 'uar-check')
    const before = await integration(page)
    expect(before.uar.state).toBe('running')
    expect(before.uar.binarySource).toBe('packaged')
    expect(before.uar.binaryVersion).toBeTruthy()
    expect(before.uar.binarySourceCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(before.uar.binaryArchiveSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(before.uar.effectivePort).toBeGreaterThan(0)

    const providerId = 'd01-local-ollama'
    await ipc(page, 'prometheus.uar.providers.save', {
      mode: 'create',
      id: providerId,
      displayName: 'D01 local Ollama',
      baseUrl: `${ollamaBaseUrl}/v1`,
      protocol: 'chat',
      defaultModel: ollamaModel,
      models: [
        { id: ollamaModel, displayName: ollamaModel, enabled: true, supportsTools: true, supportsStreaming: true }
      ],
      enabled: true,
      credential: { operation: 'unchanged' }
    })
    await ipc(page, 'prometheus.uar.providers.default', { id: providerId })

    const workspaceA = await workspace(page, workspaceAPath)
    const workspaceB = await workspace(page, workspaceBPath)
    expect(workspaceA.id).not.toBe(workspaceB.id)
    const initialA = await durable(page, workspaceA.id)
    const initialB = await durable(page, workspaceB.id)
    expect(initialA.operations['starter.setup'].available).toBe(true)
    expect(initialB.operations['starter.setup'].available).toBe(true)
    const bindingA = await ipc<UarDurableBinding>(page, 'prometheus.uar.durable.setup_starter', {
      workspaceId: workspaceA.id
    })
    const bindingB = await ipc<UarDurableBinding>(page, 'prometheus.uar.durable.setup_starter', {
      workspaceId: workspaceB.id
    })
    expect(bindingA.activationSupported).toBe(true)
    expect(bindingB.activationSupported).toBe(true)
    expect(bindingA.id).not.toBe(bindingB.id)

    const sourceA = await createInstance(page, workspaceA.id, bindingA, 'on_demand')
    const observerA = await createInstance(page, workspaceA.id, bindingA, 'resident')
    const sourceB = await createInstance(page, workspaceB.id, bindingB, 'on_demand')
    await activate(page, workspaceA.id, sourceA.instanceId)
    await activate(page, workspaceA.id, observerA.instanceId)
    await activate(page, workspaceB.id, sourceB.instanceId)

    const scopedA = await durable(page, workspaceA.id)
    const scopedB = await durable(page, workspaceB.id)
    expect(scopedA.instances.map((item) => item.instanceId)).toEqual(
      expect.arrayContaining([sourceA.instanceId, observerA.instanceId])
    )
    expect(scopedA.instances.some((item) => item.instanceId === sourceB.instanceId)).toBe(false)
    expect(scopedB.instances.map((item) => item.instanceId)).toContain(sourceB.instanceId)
    expect(scopedB.instances.some((item) => item.instanceId === sourceA.instanceId)).toBe(false)
    expect(scopedA.bindings.some((item) => item.id === bindingB.id)).toBe(false)
    expect(scopedB.bindings.some((item) => item.id === bindingA.id)).toBe(false)

    const crossWorkspace = await ipcResult<UarDurableObserver>(page, 'prometheus.uar.durable.create_observer', {
      workspaceId: workspaceA.id,
      observerInstanceId: observerA.instanceId,
      sourceInstanceIds: [sourceB.instanceId]
    })
    expect(crossWorkspace.ok).toBe(false)
    const subscription = await ipc<UarDurableObserver>(page, 'prometheus.uar.durable.create_observer', {
      workspaceId: workspaceA.id,
      observerInstanceId: observerA.instanceId,
      sourceInstanceIds: [sourceA.instanceId]
    })
    expect(subscription.workspaceId).toBe(workspaceA.id)
    const paused = await ipc<UarDurableObserver>(page, 'prometheus.uar.durable.observer_action', {
      workspaceId: workspaceA.id,
      subscriptionId: subscription.subscriptionId,
      action: 'pause',
      expectedRevision: subscription.revision
    })
    expect(paused.paused).toBe(true)
    const resumed = await ipc<UarDurableObserver>(page, 'prometheus.uar.durable.observer_action', {
      workspaceId: workspaceA.id,
      subscriptionId: subscription.subscriptionId,
      action: 'resume',
      expectedRevision: paused.revision
    })
    expect(resumed.paused).toBe(false)
    expect(
      (await durable(page, workspaceB.id)).observers.some((item) => item.subscriptionId === subscription.subscriptionId)
    ).toBe(false)

    await runOperation(page, 'uar-restart')
    await closeApp(app)
    launched = await launch(executable, home)
    app = launched.app
    page = launched.page
    await runOperation(page, 'uar-check')
    const after = await integration(page)
    const persistedA = await durable(page, workspaceA.id)
    const persistedB = await durable(page, workspaceB.id)
    expect(after.uar.binarySource).toBe('packaged')
    expect(after.uar.binarySourceCommit).toBe(before.uar.binarySourceCommit)
    expect(after.uar.binaryArchiveSha256).toBe(before.uar.binaryArchiveSha256)
    expect(after.uar.effectivePort).toBeGreaterThan(0)
    expect(persistedA.bindings.some((item) => item.id === bindingA.id)).toBe(true)
    expect(persistedB.bindings.some((item) => item.id === bindingB.id)).toBe(true)
    expect(persistedA.instances.some((item) => item.instanceId === sourceA.instanceId)).toBe(true)
    expect(persistedA.instances.some((item) => item.instanceId === observerA.instanceId)).toBe(true)
    expect(persistedB.instances.some((item) => item.instanceId === sourceB.instanceId)).toBe(true)
    expect(persistedA.observers.some((item) => item.subscriptionId === subscription.subscriptionId)).toBe(true)
    expect(persistedB.observers.some((item) => item.subscriptionId === subscription.subscriptionId)).toBe(false)

    const evidence = {
      gate: 'D01',
      app: basename(resolve(appPath!)),
      binary: {
        source: after.uar.binarySource,
        version: after.uar.binaryVersion,
        sourceCommit: after.uar.binarySourceCommit,
        archiveSha256: after.uar.binaryArchiveSha256
      },
      ports: { before: before.uar.effectivePort, after: after.uar.effectivePort, preferred: after.uar.appliedPort },
      workspaceIsolation: 'observed',
      instances: {
        a: persistedA.instances
          .filter((item) => [sourceA.instanceId, observerA.instanceId].includes(item.instanceId))
          .map((item) => ({ profile: item.profile, lifecycle: item.lifecycle, recovery: item.recovery })),
        b: persistedB.instances
          .filter((item) => item.instanceId === sourceB.instanceId)
          .map((item) => ({ profile: item.profile, lifecycle: item.lifecycle, recovery: item.recovery }))
      },
      observer: {
        pausedAndResumed: true,
        persisted: true,
        backlogDepth: persistedA.observers.find((item) => item.subscriptionId === subscription.subscriptionId)
          ?.backlogDepth
      }
    }
    if (evidencePath) {
      mkdirSync(dirname(evidencePath), { recursive: true })
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
    }
    console.log(`D01_RESULT ${JSON.stringify(evidence)}`)
  } finally {
    if (app) await closeApp(app)
  }
})
