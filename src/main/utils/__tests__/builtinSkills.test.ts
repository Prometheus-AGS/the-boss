import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installBuiltinSkills } from '../builtinSkills'

vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    readlink: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/app'),
    getPath: vi.fn(() => '/userData'),
    getVersion: vi.fn(() => '2.0.0')
  }
}))

vi.mock('../legacyFile', () => ({
  pathExists: vi.fn().mockResolvedValue(false)
}))

vi.mock('../asar', () => ({
  toAsarUnpackedPath: vi.fn((filePath: string) => filePath)
}))

const { mockSyncBuiltinSkill } = vi.hoisted(() => ({
  mockSyncBuiltinSkill: vi.fn()
}))

vi.mock('@main/ai/skills/SkillService', () => ({
  skillService: { syncBuiltinSkill: mockSyncBuiltinSkill }
}))

// Matches the stub in tests/main.setup.ts → mockApplicationFactory().getPath
const resourceSkillsPath = path.resolve('/mock/feature.agents.skills.builtin')
const runtimeSkillsPath = path.resolve('/mock/feature.prometheus.pack.runtime/skills')
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fs.readdir).mockReset().mockResolvedValue([])
  vi.mocked(fs.readFile).mockReset().mockResolvedValue('{"version":"1.18.0"}')
  mockSyncBuiltinSkill.mockResolvedValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('installBuiltinSkills', () => {
  it('delegates builtin publication to SkillService with the resource path and app version', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)
    vi.mocked(fs.readdir).mockResolvedValueOnce([{ name: 'my-skill', isDirectory: () => true }] as any)

    await installBuiltinSkills()

    // Fourth argument is the namespace: `null` for Cherry's own builtins.
    expect(mockSyncBuiltinSkill).toHaveBeenCalledWith(
      'my-skill',
      path.join(resourceSkillsPath, 'my-skill'),
      '2.0.0',
      null
    )
  })

  it('publishes Mini skills from the retained runtime pack and other builtins from resources', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)
    // First readdir: resources/skills — both sets live here after the sync script runs.
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'from-the-pack', isDirectory: () => true },
      { name: 'cherry-own', isDirectory: () => true }
    ] as any)
    // Second readdir: bundled Mini names distinguish them from app-owned builtins.
    vi.mocked(fs.readdir).mockResolvedValueOnce([{ name: 'from-the-pack', isDirectory: () => true }] as any)
    // Third readdir: the retained runtime pack supplies Mini content.
    vi.mocked(fs.readdir).mockResolvedValueOnce([{ name: 'from-the-pack', isDirectory: () => true }] as any)

    await installBuiltinSkills()

    expect(mockSyncBuiltinSkill).toHaveBeenCalledWith(
      'from-the-pack',
      path.join(runtimeSkillsPath, 'from-the-pack'),
      '1.18.0',
      'prometheus'
    )
    expect(mockSyncBuiltinSkill).toHaveBeenCalledWith(
      'cherry-own',
      path.join(resourceSkillsPath, 'cherry-own'),
      '2.0.0',
      null
    )
  })

  it('falls back to the default namespace for every skill when the submodule cannot be read', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)
    vi.mocked(fs.readdir).mockResolvedValueOnce([{ name: 'from-the-pack', isDirectory: () => true }] as any)
    // An absent submodule checkout must degrade, never block the launch.
    vi.mocked(fs.readdir).mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    await installBuiltinSkills()

    expect(mockSyncBuiltinSkill).toHaveBeenCalledWith(
      'from-the-pack',
      path.join(resourceSkillsPath, 'from-the-pack'),
      '2.0.0',
      null
    )
  })

  it('should skip entries with path traversal in name', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: '..', isDirectory: () => true },
      { name: '../etc', isDirectory: () => true }
    ] as any)

    await installBuiltinSkills()

    expect(mockSyncBuiltinSkill).not.toHaveBeenCalled()
  })

  it('should skip non-directory entries', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined)
    vi.mocked(fs.readdir).mockResolvedValueOnce([{ name: 'README.md', isDirectory: () => false }] as any)

    await installBuiltinSkills()

    expect(mockSyncBuiltinSkill).not.toHaveBeenCalled()
  })
})
