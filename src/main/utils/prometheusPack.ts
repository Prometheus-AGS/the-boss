import fs from 'node:fs/promises'
import path from 'node:path'

import { gt, valid } from 'semver'

import { application } from '@application'
import { loggerService } from '@logger'
import { copyDirectoryRecursive } from '@main/utils/fileOperations'
import { pathExists } from '@main/utils/legacyFile'

import { toAsarUnpackedPath } from './asar'

const logger = loggerService.withContext('prometheusPack')
const installations = new Map<string, Promise<void>>()

/** Complete runnable payload: skills load these adjacent scripts and references on demand. */
export const PACK_ENTRIES = [
  'scripts',
  'lib',
  'rules',
  'skills',
  'references',
  'agents',
  'templates',
  'hooks',
  'docker',
  'commands',
  'shared',
  'docs',
  'schemas',
  'assets',
  'config',
  'catalogs',
  '.agents',
  'node_modules'
] as const

/** Single files, copied alongside the directories above. */
const PACK_FILES = [
  'package.json',
  'package-lock.json',
  'versions.toml',
  'skill-system.json',
  'reviewed-skill-closures.json'
] as const

/** Trust the application's packaged baseline, never the writable installed manifest. */
export async function readPackagedSkillInventoryDigest(): Promise<string | undefined> {
  const source = toAsarUnpackedPath(application.getPath('feature.prometheus.pack.builtin'))
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'release-manifest.json'), 'utf8'))
    const digest = manifest.reviewedSkills?.inventoryDigest
    return typeof digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(digest) ? digest : undefined
  } catch (error) {
    logger.warn('Packaged skill review baseline is unavailable', {
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}

/**
 * Install the runnable pack into `{userData}/Data/PrometheusPack`.
 *
 * Why a copy exists at all, rather than spawning from the bundled resources: on Windows the
 * app directory is commonly under `Program Files`, where a non-elevated process cannot write.
 * The doctor's own checks are read-only, but its `--fix copy-skills` path and any future fix
 * resolve paths from the pack root, so the root has to live somewhere writable.
 *
 * Only a newer bundled version replaces an installed pack. Unversioned legacy
 * installs bootstrap once; the manifest is committed after all runtime assets.
 */
export function installPrometheusPack(): Promise<void> {
  const source = toAsarUnpackedPath(application.getPath('feature.prometheus.pack.builtin'))
  const destination = application.getPath('feature.prometheus.pack.runtime')
  const active = installations.get(destination)
  if (active) return active
  const installation = performPrometheusPackInstall(source, destination).finally(() =>
    installations.delete(destination)
  )
  installations.set(destination, installation)
  return installation
}

async function performPrometheusPackInstall(source: string, destination: string): Promise<void> {
  try {
    await fs.access(source)
  } catch {
    // The submodule is not checked out. Expected in a source tree that skipped
    // `git submodule update --init`; not expected in a packaged build.
    logger.warn('Prometheus pack is absent from resources; skipping install', { source })
    return
  }

  try {
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'release-manifest.json'), 'utf8'))
    const bundledVersion = await readPackVersion(path.join(source, 'package.json'))
    if (!bundledVersion) throw new Error('Bundled Prometheus pack has no version')
    if (manifest.version !== undefined && valid(manifest.version) !== bundledVersion) {
      throw new Error('Bundled Prometheus pack metadata versions disagree')
    }

    const installedManifest = path.join(destination, 'release-manifest.json')
    const pending = path.join(destination, '.installing.json')
    const committedVersion = await readPackVersion(installedManifest)
    const pendingExists = await pathExists(pending)
    const installedVersion =
      committedVersion ?? (await readPackVersion(pendingExists ? pending : path.join(destination, 'package.json')))
    if (installedVersion && !gt(bundledVersion, installedVersion)) {
      if (committedVersion && pendingExists) {
        const previousVersion = await readPackVersion(pending)
        if (!previousVersion || gt(committedVersion, previousVersion)) await fs.rm(pending, { force: true })
      }
      return
    }

    if (
      !installedVersion &&
      !pendingExists &&
      (await pathExists(destination)) &&
      (await fs.readdir(destination)).some((entry) => entry !== '.installing.json.tmp')
    ) {
      throw new Error('Installed Prometheus pack has no comparable version; preserving its files')
    }

    await fs.mkdir(destination, { recursive: true })
    // Preserve the old version if package.json copies successfully but a later file fails.
    await fs.writeFile(`${pending}.tmp`, JSON.stringify({ version: installedVersion ?? null }))
    await fs.rename(`${pending}.tmp`, pending)

    for (const entry of PACK_ENTRIES) {
      // Packaged builds ship node_modules as pack_modules; a dev source tree keeps node_modules.
      const bundled =
        entry === 'node_modules' && (await pathExists(path.join(source, 'pack_modules'))) ? 'pack_modules' : entry
      const from = path.join(source, bundled)
      const to = path.join(destination, entry)
      try {
        await fs.access(from)
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'ENOENT' ||
          ['scripts', 'lib', 'skills', 'node_modules'].includes(entry)
        ) {
          throw error
        }
        logger.warn('Optional Prometheus pack entry is missing from the bundle', { entry })
        continue
      }
      // Removed first so a file deleted upstream does not linger and keep being executed.
      await fs.rm(to, { recursive: true, force: true })
      await copyDirectoryRecursive(from, to)
    }

    for (const file of PACK_FILES) {
      await fs.copyFile(path.join(source, file), path.join(destination, file))
    }

    await fs.writeFile(`${installedManifest}.tmp`, JSON.stringify({ ...manifest, version: bundledVersion }) + '\n')
    await fs.rename(`${installedManifest}.tmp`, installedManifest)
    await fs.rm(pending, { force: true })
    logger.info('Prometheus pack installed', { destination, version: bundledVersion })
  } catch (error) {
    logger.error('Failed to install the Prometheus pack', error as Error)
  }
}

async function readPackVersion(filename: string): Promise<string | undefined> {
  try {
    const metadata = JSON.parse(await fs.readFile(filename, 'utf8'))
    if (metadata.version === undefined || metadata.version === null) return undefined
    const version = typeof metadata.version === 'string' ? valid(metadata.version) : null
    if (!version) throw new Error(`Invalid Prometheus pack version in ${filename}`)
    return version
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
