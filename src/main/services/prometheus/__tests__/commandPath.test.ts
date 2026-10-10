import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ root: '' }))

vi.mock('@application', () => ({
  application: {
    getPath: (key: string) => {
      const map: Record<string, string> = {
        'feature.prometheus.commands': `${paths.root}/commands`,
        'cherry.bin': `${paths.root}/bin`,
        'sys.home': `${paths.root}/home`,
        'app.exe_file': `${paths.root}/app/The Boss`
      }
      return map[key]
    }
  }
}))
vi.mock('../miniCommands', () => ({ installMiniCommands: vi.fn(async () => undefined) }))
vi.mock('../integrationConfig', () => ({ integrationDirectory: () => `${paths.root}/integration` }))
vi.mock('../integrationProcess', () => ({ runIntegrationProcess: vi.fn() }))

import { installCommandPath } from '../commandPath'

const tools = ['compass', 'rust-mcp-filesystem', 'prometheus', 'pk', 'node']

describe.skipIf(process.platform === 'win32')('installCommandPath', () => {
  const originalPath = process.env.PATH

  beforeEach(async () => {
    paths.root = await fs.mkdtemp(path.join(os.tmpdir(), 'boss-command-path-'))
    await fs.mkdir(path.join(paths.root, 'bin'), { recursive: true })
    for (const tool of tools) await fs.writeFile(path.join(paths.root, 'bin', tool), `#!/bin/sh\necho ${tool}\n`)
  })

  afterEach(async () => {
    process.env.PATH = originalPath
    await fs.rm(paths.root, { recursive: true, force: true })
  })

  it('installs every tool as an executable file', async () => {
    await installCommandPath()

    for (const tool of tools) {
      const stat = await fs.stat(path.join(paths.root, 'commands', tool))
      expect(stat.mode & 0o111).not.toBe(0)
    }
  })

  it('gives each reinstalled tool a new inode instead of overwriting it in place', async () => {
    await installCommandPath()
    const before = await Promise.all(tools.map(async (tool) => (await fs.stat(path.join(paths.root, 'commands', tool))).ino))

    await installCommandPath()
    const after = await Promise.all(tools.map(async (tool) => (await fs.stat(path.join(paths.root, 'commands', tool))).ino))

    after.forEach((inode, index) => expect(inode, tools[index]).not.toBe(before[index]))
  })

  it('replaces the installed content with the bundled content on reinstall', async () => {
    await installCommandPath()
    await fs.writeFile(path.join(paths.root, 'bin', 'node'), '#!/bin/sh\necho updated\n')

    await installCommandPath()

    expect(await fs.readFile(path.join(paths.root, 'commands', 'node'), 'utf8')).toContain('updated')
  })

  it('leaves no temporary files in the commands directory', async () => {
    await installCommandPath()
    await installCommandPath()

    const entries = await fs.readdir(path.join(paths.root, 'commands'))
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([])
  })

  it('writes the PATH block into the redirected home directory only', async () => {
    await installCommandPath()

    const zshrc = await fs.readFile(path.join(paths.root, 'home', '.zshrc'), 'utf8')
    expect(zshrc).toContain('# The Boss managed commands')
    expect(zshrc).toContain(path.join(paths.root, 'commands'))
  })
})
