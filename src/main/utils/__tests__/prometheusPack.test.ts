import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installPrometheusPack, PACK_ENTRIES } from '../prometheusPack'

/**
 * These tests use a REAL temp filesystem rather than a mocked `node:fs`. What is under test
 * is filesystem behaviour — that a tree is copied, that a stale file is replaced, that nothing
 * escapes the destination. Asserting those against a mock would assert that the mock was
 * called, which is the vacuous-pass defect this repo has been bitten by before.
 */

let sourceRoot: string
let runtimeRoot: string

vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory()
})

vi.mock('../asar', () => ({
  toAsarUnpackedPath: vi.fn((filePath: string) => filePath)
}))

const { mockGetPath } = vi.hoisted(() => ({ mockGetPath: vi.fn() }))

vi.mock('@logger', () => ({
  loggerService: { withContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }
}))

/** Builds a miniature pack: the directories the runtime needs, plus a stray one it does not. */
async function writeSourcePack(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true })
  await fs.writeFile(path.join(root, 'scripts', 'doctor.mjs'), 'export const version = 1\n')
  await fs.mkdir(path.join(root, 'lib', 'doctor'), { recursive: true })
  await fs.writeFile(path.join(root, 'lib', 'doctor', 'registry.mjs'), 'export const checks = []\n')
  await fs.mkdir(path.join(root, 'rules'), { recursive: true })
  await fs.writeFile(path.join(root, 'rules', 'build.conf'), 'x\n')
  await fs.mkdir(path.join(root, 'skills'), { recursive: true })
  await fs.mkdir(path.join(root, 'node_modules'), { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"prometheus-skills-mini","version":"1.17.0"}\n')
  await fs.writeFile(path.join(root, 'release-manifest.json'), '{"version":"1.17.0"}\n')
  for (const file of ['package-lock.json', 'versions.toml', 'skill-system.json', 'reviewed-skill-closures.json']) {
    await fs.writeFile(path.join(root, file), '{}\n')
  }
  // Present in the submodule, deliberately NOT part of the runnable pack.
  await fs.mkdir(path.join(root, 'openspec'), { recursive: true })
  await fs.writeFile(path.join(root, 'openspec', 'config.yaml'), 'y\n')
}

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pack-test-'))
  sourceRoot = path.join(base, 'source')
  runtimeRoot = path.join(base, 'runtime')
  await writeSourcePack(sourceRoot)

  const { application } = await import('@application')
  mockGetPath.mockImplementation((key: string) => {
    if (key === 'feature.prometheus.pack.builtin') return sourceRoot
    if (key === 'feature.prometheus.pack.runtime') return runtimeRoot
    return `/mock/${key}`
  })
  vi.mocked(application.getPath).mockImplementation(mockGetPath as never)
})

afterEach(async () => {
  vi.clearAllMocks()
  await fs.rm(path.dirname(sourceRoot), { recursive: true, force: true })
})

describe('installPrometheusPack', () => {
  it('copies every runnable entry into the runtime root', async () => {
    await installPrometheusPack()

    // The gate for prometheus-003: the doctor must be spawnable from here.
    await expect(fs.access(path.join(runtimeRoot, 'scripts', 'doctor.mjs'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(runtimeRoot, 'lib', 'doctor', 'registry.mjs'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(runtimeRoot, 'rules', 'build.conf'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(runtimeRoot, 'package.json'))).resolves.toBeUndefined()
  })

  it('copies only the runnable entries, not the whole submodule', async () => {
    await installPrometheusPack()

    // `openspec/` is 100+ files of specs that nothing at runtime reads. Copying the whole
    // submodule on every launch would be slow and would ship spec churn into userData.
    await expect(fs.access(path.join(runtimeRoot, 'openspec'))).rejects.toThrow()
    expect(PACK_ENTRIES).not.toContain('openspec')
  })

  it('replaces a stale file from a previous app version', async () => {
    await fs.mkdir(path.join(runtimeRoot, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'STALE\n')
    await fs.writeFile(path.join(runtimeRoot, 'package.json'), '{"version":"1.16.0"}')

    await installPrometheusPack()

    const content = await fs.readFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'utf8')
    expect(content).toBe('export const version = 1\n')
  })

  it('removes a file the pack no longer ships', async () => {
    await fs.mkdir(path.join(runtimeRoot, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(runtimeRoot, 'scripts', 'removed-upstream.mjs'), 'old\n')
    await fs.writeFile(path.join(runtimeRoot, 'package.json'), '{"version":"1.16.0"}')

    await installPrometheusPack()

    // Otherwise a script deleted upstream keeps running from userData forever.
    await expect(fs.access(path.join(runtimeRoot, 'scripts', 'removed-upstream.mjs'))).rejects.toThrow()
  })

  it('is idempotent across repeated launches', async () => {
    await installPrometheusPack()
    await installPrometheusPack()

    const entries = await fs.readdir(path.join(runtimeRoot, 'scripts'))
    expect(entries).toEqual(['doctor.mjs'])
  })

  it.each(['1.16.9', '1.17.0-rc.1'])('upgrades an older installed version %s', async (version) => {
    await fs.mkdir(path.join(runtimeRoot, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'OLD\n')
    await fs.writeFile(path.join(runtimeRoot, 'release-manifest.json'), JSON.stringify({ version }))

    await installPrometheusPack()

    expect(await fs.readFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'utf8')).toBe(
      'export const version = 1\n'
    )
    expect(JSON.parse(await fs.readFile(path.join(runtimeRoot, 'release-manifest.json'), 'utf8')).version).toBe(
      '1.17.0'
    )
  })

  it.each(['1.17.0', '1.17.0+local', '1.18.0'])('preserves an equal or newer installed version %s', async (version) => {
    await fs.mkdir(path.join(runtimeRoot, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'KEEP\n')
    const manifest = JSON.stringify({ version, revision: 'different-build' })
    await fs.writeFile(path.join(runtimeRoot, 'release-manifest.json'), manifest)

    await installPrometheusPack()

    expect(await fs.readFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'utf8')).toBe('KEEP\n')
    expect(await fs.readFile(path.join(runtimeRoot, 'release-manifest.json'), 'utf8')).toBe(manifest)
  })

  it.each(['1.17.0', '1.18.0'])('preserves legacy installs identified by package version %s', async (version) => {
    await fs.mkdir(path.join(runtimeRoot, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'KEEP\n')
    await fs.writeFile(path.join(runtimeRoot, 'release-manifest.json'), '{"revision":"legacy"}')
    await fs.writeFile(path.join(runtimeRoot, 'package.json'), JSON.stringify({ version }))

    await installPrometheusPack()

    expect(await fs.readFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'utf8')).toBe('KEEP\n')
  })

  it.each(['invalid', null])('preserves an installed pack with uncomparable version %s', async (version) => {
    await fs.mkdir(runtimeRoot, { recursive: true })
    const metadata = JSON.stringify({ version })
    await fs.writeFile(path.join(runtimeRoot, 'package.json'), metadata)

    await installPrometheusPack()

    expect(await fs.readFile(path.join(runtimeRoot, 'package.json'), 'utf8')).toBe(metadata)
    await expect(fs.access(path.join(runtimeRoot, 'scripts'))).rejects.toThrow()
  })

  it('retries a failed legacy upgrade after package.json has already copied', async () => {
    await fs.mkdir(runtimeRoot, { recursive: true })
    await fs.writeFile(path.join(runtimeRoot, 'package.json'), '{"version":"1.16.0"}')
    await fs.writeFile(path.join(runtimeRoot, 'release-manifest.json'), '{"revision":"legacy"}')
    await fs.rm(path.join(sourceRoot, 'reviewed-skill-closures.json'))

    await installPrometheusPack()

    expect(JSON.parse(await fs.readFile(path.join(runtimeRoot, 'package.json'), 'utf8')).version).toBe('1.17.0')
    expect(await fs.readFile(path.join(runtimeRoot, 'release-manifest.json'), 'utf8')).toBe('{"revision":"legacy"}')
    await fs.writeFile(path.join(sourceRoot, 'reviewed-skill-closures.json'), '{}\n')
    await fs.writeFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'INCOMPLETE\n')

    await installPrometheusPack()

    expect(await fs.readFile(path.join(runtimeRoot, 'scripts', 'doctor.mjs'), 'utf8')).toBe(
      'export const version = 1\n'
    )
    expect(JSON.parse(await fs.readFile(path.join(runtimeRoot, 'release-manifest.json'), 'utf8')).version).toBe(
      '1.17.0'
    )
    await expect(fs.access(path.join(runtimeRoot, '.installing.json'))).rejects.toThrow()
  })

  it('does not throw when the submodule is not checked out', async () => {
    await fs.rm(sourceRoot, { recursive: true, force: true })

    // A missing submodule must degrade, never block the launch.
    await expect(installPrometheusPack()).resolves.toBeUndefined()
  })

  it('never follows a symlink out of the source tree', async () => {
    const outside = path.join(path.dirname(sourceRoot), 'outside-secret.txt')
    await fs.writeFile(outside, 'SECRET\n')
    await fs.symlink(outside, path.join(sourceRoot, 'scripts', 'escape.mjs'))

    await installPrometheusPack()

    // The copy must not materialise content from outside the pack root.
    const copied = path.join(runtimeRoot, 'scripts', 'escape.mjs')
    await expect(fs.readFile(copied, 'utf8')).rejects.toThrow()
  })
})
