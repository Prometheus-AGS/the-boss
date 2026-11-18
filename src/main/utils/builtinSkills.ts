import fs from 'node:fs/promises'
import path from 'node:path'

import { app } from 'electron'

import { application } from '@application'
import { loggerService } from '@logger'
import { skillService } from '@main/ai/skills/SkillService'

import { toAsarUnpackedPath } from './asar'
import { pathExists } from './legacyFile'

const logger = loggerService.withContext('builtinSkills')

/** Owns the skills the Prometheus pack ships, so a name clash with a Cherry builtin is refused. */
const PROMETHEUS_NAMESPACE = 'prometheus'

async function listSkillDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Copy built-in skills from app resources to the global skills storage
 * directory and register them in the `skills` DB table.
 *
 * Storage:  {userData}/Data/Skills/{folderName}/
 *
 * Per-agent enablement needs no work here: `AgentGlobalSkillService.list()`
 * defaults a builtin skill to enabled for every agent until a user explicitly
 * disables it, so a synced `agent_global_skill` row is enabled everywhere
 * without any `agent_skill` rows.
 *
 * Mini skills use the installed pack and its version after the startup upgrade
 * check. Other builtins use the application version and bundled content hash.
 */
// TODO: v2-backup
export async function installBuiltinSkills(): Promise<void> {
  const resourceSkillsPath = toAsarUnpackedPath(application.getPath('feature.agents.skills.builtin'))
  const appVersion = app.getVersion()

  try {
    await fs.access(resourceSkillsPath)
  } catch {
    return
  }

  const entries = await fs.readdir(resourceSkillsPath, { withFileTypes: true })
  const dirs = entries.filter((e) => {
    if (!e.isDirectory()) return false
    const sourcePath = path.join(resourceSkillsPath, e.name)
    return sourcePath.startsWith(resourceSkillsPath + path.sep)
  })

  const bundledPack = toAsarUnpackedPath(application.getPath('feature.prometheus.pack.builtin'))
  const bundledMiniSkills = new Set(await listSkillDirectories(path.join(bundledPack, 'skills')))
  const sources = new Map(
    dirs
      .filter((entry) => !bundledMiniSkills.has(entry.name))
      .map((entry) => [
        entry.name,
        { path: path.join(resourceSkillsPath, entry.name), version: appVersion, namespace: null as string | null }
      ])
  )
  const runtimePack = application.getPath('feature.prometheus.pack.runtime')
  try {
    if (!(await pathExists(path.join(runtimePack, '.installing.json')))) {
      const metadata = JSON.parse(await fs.readFile(path.join(runtimePack, 'package.json'), 'utf8'))
      const manifest = JSON.parse(await fs.readFile(path.join(runtimePack, 'release-manifest.json'), 'utf8'))
      if (typeof metadata.version !== 'string' || (manifest.version && manifest.version !== metadata.version)) {
        throw new Error('Installed Prometheus pack metadata versions disagree')
      }
      for (const name of await listSkillDirectories(path.join(runtimePack, 'skills'))) {
        sources.set(name, {
          path: path.join(runtimePack, 'skills', name),
          version: metadata.version,
          namespace: PROMETHEUS_NAMESPACE
        })
      }
    }
  } catch (error) {
    logger.warn('Installed Prometheus skills are unavailable for synchronization', { error })
  }

  let installed = 0
  // Process sequentially to avoid interleaved delete+insert on the skills
  // table when multiple builtins require a metadata refresh.
  for (const [folderName, source] of sources) {
    try {
      const filesUpdated = await skillService.syncBuiltinSkill(
        folderName,
        source.path,
        source.version,
        source.namespace
      )
      if (filesUpdated) installed++
    } catch (error) {
      logger.warn('Failed to sync built-in skill to DB', {
        folderName,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (installed > 0) {
    logger.info('Built-in skills installed', { installed, version: appVersion })
  }
}
