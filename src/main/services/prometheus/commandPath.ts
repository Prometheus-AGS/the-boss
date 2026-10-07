import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { application } from '@application'
import { loggerService } from '@logger'
import { mergePathPrefixes } from '@main/utils/binaryEnv'
import { atomicWriteFile } from '@main/utils/file'
import { AbsoluteFilePathSchema } from '@shared/types/file'

import { integrationDirectory } from './integrationConfig'
import { runIntegrationProcess } from './integrationProcess'
import { installMiniCommands } from './miniCommands'
import { shellRcContainsBlock, updateShellRcFile, withShellRcLock } from './shellRcFile'

const logger = loggerService.withContext('CommandPath')
const marker = '# The Boss managed commands'
const endMarker = '# End The Boss managed commands'
const registrationFile = () => application.getPath('feature.prometheus.commands.registration_file')
const legacyRegistrationFile = () => path.join(integrationDirectory(), 'path-registration.json')
type Registration = { directory: string; added: boolean; files: string[] }

async function readRegistration(file: string): Promise<Registration | undefined> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    const record = value as Partial<Registration> | null
    const expected = application.getPath(
      file === registrationFile() ? 'feature.prometheus.commands' : 'feature.prometheus.commands.legacy'
    )
    const normalize = (directory: string) =>
      process.platform === 'win32' ? path.resolve(directory).toLowerCase() : path.resolve(directory)
    if (
      !record ||
      typeof record.directory !== 'string' ||
      !path.isAbsolute(record.directory) ||
      normalize(record.directory) !== normalize(expected) ||
      typeof record.added !== 'boolean' ||
      !Array.isArray(record.files) ||
      !record.files.every((entry) => typeof entry === 'string')
    ) {
      throw new Error('Managed command registration has an invalid or foreign directory; no cleanup performed')
    }
    return { directory: expected, added: record.added, files: record.files }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function shellBlocks(directory: string): Map<string, string> {
  const quoted = `'${directory.replace(/'/g, `'"'"'`)}'`
  const shell = `if [ -d ${quoted} ]; then\n  _boss_commands=${quoted}\n  case ":$PATH:" in *":$_boss_commands:"*) ;; *) export PATH="$_boss_commands:$PATH" ;; esac\n  unset _boss_commands\nfi`
  const home = application.getPath('external.shell.home')
  return new Map(
    [
      ['.profile', shell],
      ['.bashrc', shell],
      ['.bash_profile', shell],
      ['.zprofile', shell],
      ['.zshrc', shell],
      [
        path.join('.config', 'fish', 'conf.d', 'the-boss.fish'),
        `if test -d ${quoted}\n  fish_add_path --path ${quoted}\nend`
      ]
    ].map(([relative, command]) => [path.join(home, relative), `${marker}\n${command}\n${endMarker}`])
  )
}

async function retireLegacyCleanup(directory: string): Promise<void> {
  const file = path.join(directory, 'remove-registration.cjs')
  let content: string
  try {
    content = await fs.readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (
    !content.startsWith("const fs=require('node:fs');") ||
    !content.includes('registration.files') ||
    !content.includes('fs.writeFileSync(filename,text.slice')
  )
    return
  await atomicWriteFile(
    AbsoluteFilePathSchema.parse(file),
    '// Retired: shell startup must never modify user shell files.\nprocess.exit(0);\n',
    { mode: 0o600 }
  )
}

export async function commandPathInstalled(): Promise<boolean> {
  try {
    const value = await readRegistration(registrationFile())
    const directory = application.getPath('feature.prometheus.commands')
    if (!value || value.directory !== directory) return false
    await fs.access(path.join(directory, process.platform === 'win32' ? 'compass.exe' : 'compass'))
    if (process.platform === 'win32') {
      const script = "[Environment]::GetEnvironmentVariable('Path', 'User')"
      const output = await runIntegrationProcess('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ])
      return output
        .trim()
        .split(';')
        .some((entry) => entry.replace(/\\$/, '').toLowerCase() === directory.replace(/\\$/, '').toLowerCase())
    }
    return (
      await Promise.all([...shellBlocks(directory)].map(([file, block]) => shellRcContainsBlock(file, block)))
    ).every(Boolean)
  } catch {
    return false
  }
}

export async function installCommandPath(options: { strict?: boolean } = {}): Promise<void> {
  const file = registrationFile()
  await withShellRcLock(file, async () => {
    const directory = application.getPath('feature.prometheus.commands')
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const legacy = await readRegistration(legacyRegistrationFile())
    await retireLegacyCleanup(directory)
    if (legacy && legacy.directory !== directory) await retireLegacyCleanup(legacy.directory)
    for (const tool of ['compass', 'rust-mcp-filesystem', 'prometheus', 'pk', 'node']) {
      const filename = process.platform === 'win32' ? `${tool}.exe` : tool
      const target = path.join(directory, filename)
      const temporary = `${target}.tmp-${randomUUID()}`
      try {
        await fs.copyFile(path.join(application.getPath('cherry.bin'), filename), temporary)
        if (process.platform !== 'win32') await fs.chmod(temporary, 0o755)
        await fs.rename(temporary, target)
      } finally {
        await fs.rm(temporary, { force: true })
      }
    }
    await installMiniCommands(directory)
    const registration = (await readRegistration(file)) ?? { directory, added: false, files: [] }
    registration.directory = directory
    const failures: Error[] = []
    if (process.platform === 'win32') {
      const script = `$ErrorActionPreference = 'Stop'
$directory = $env:BOSS_COMMAND_DIRECTORY
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @($current -split ';' | Where-Object { $_ })
if ($env:BOSS_LEGACY_COMMAND_DIRECTORY) { $entries = @($entries | Where-Object { $_.TrimEnd('\\') -ine $env:BOSS_LEGACY_COMMAND_DIRECTORY.TrimEnd('\\') }) }
if (-not ($entries | Where-Object { $_.TrimEnd('\\') -ieq $directory.TrimEnd('\\') })) {
  $entries += $directory
  Write-Output 'added'
}
[Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
Add-Type -Namespace Boss -Name Environment -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);'
$result = [UIntPtr]::Zero
[void][Boss.Environment]::SendMessageTimeout([IntPtr]0xffff, 0x001a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)`
      const output = await runIntegrationProcess(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(script, 'utf16le').toString('base64')
        ],
        {
          env: {
            BOSS_COMMAND_DIRECTORY: directory,
            BOSS_LEGACY_COMMAND_DIRECTORY: legacy?.added && legacy.directory !== directory ? legacy.directory : ''
          }
        }
      )
      registration.added ||= output.includes('added')
    } else {
      registration.files = [...shellBlocks(directory).keys()]
      for (const [shellFile, block] of shellBlocks(directory)) {
        try {
          await updateShellRcFile(shellFile, block, application.getPath('feature.prometheus.commands.rc_backups'))
        } catch (error) {
          const failure = error as Error
          logger.warn('Shell PATH registration refused; user file left intact', {
            file: shellFile,
            error: failure.message
          })
          failures.push(failure)
        }
      }
      registration.added = failures.length === 0
    }
    const serialized = JSON.stringify(registration)
    let current: string | undefined
    try {
      current = await fs.readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (current !== serialized) await atomicWriteFile(AbsoluteFilePathSchema.parse(file), serialized, { mode: 0o600 })
    if (failures.length === 0) await fs.rm(legacyRegistrationFile(), { force: true })
    Object.assign(
      process.env,
      mergePathPrefixes(
        Object.fromEntries(
          Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
        ),
        [directory]
      )
    )
    if (options.strict && failures.length)
      throw new AggregateError(failures, 'Shell PATH registration requires repair; user files were preserved')
  })
}

export async function removeCommandPath(): Promise<void> {
  await withShellRcLock(registrationFile(), async () => {
    const registrations = (
      await Promise.all([registrationFile(), legacyRegistrationFile()].map(readRegistration))
    ).filter((value): value is Registration => value !== undefined)
    for (const registration of registrations) {
      if (process.platform === 'win32' && registration.added) {
        const script = `$value = [Environment]::GetEnvironmentVariable('Path', 'User'); [Environment]::SetEnvironmentVariable('Path', (($value -split ';' | Where-Object { $_.TrimEnd('\\') -ine $env:BOSS_COMMAND_DIRECTORY.TrimEnd('\\') }) -join ';'), 'User')`
        await runIntegrationProcess(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
          { env: { BOSS_COMMAND_DIRECTORY: registration.directory } }
        )
      }
      await retireLegacyCleanup(registration.directory)
    }
    if (process.platform !== 'win32' && registrations.length) {
      for (const shellFile of shellBlocks(application.getPath('feature.prometheus.commands')).keys()) {
        await updateShellRcFile(shellFile, null, application.getPath('feature.prometheus.commands.rc_backups'))
      }
    }
    await fs.rm(registrationFile(), { force: true })
    await fs.rm(legacyRegistrationFile(), { force: true })
  })
}
