import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { application } from '@application'
import { toAsarUnpackedPath } from '@main/utils/asar'
import { readPackagedSkillInventoryDigest } from '@main/utils/prometheusPack'

/** Sources are host-owned launch configuration; neither portable bindings nor renderer data can add one. */
export async function reviewedSkillSources(): Promise<string> {
  const root = application.getPath('feature.prometheus.pack.runtime')
  const inventoryDigest = await readPackagedSkillInventoryDigest()
  const home = application.getPath('sys.home')
  const pluginRoot = path.join(home, '.prometheus', 'plugins', 'prometheus-skill-pack')
  const trustStore = path.join(pluginRoot, 'trust', 'allowed-signers.json')
  const sources: Array<Record<string, unknown>> = []
  if (inventoryDigest)
    sources.push({
      source: 'boss-packaged-mini',
      root,
      inventoryPath: path.join(root, 'reviewed-skill-closures.json'),
      inventoryDigest
    })
  try {
    const trustRootDigest = `sha256:${createHash('sha256').update(await readFile(trustStore)).digest('hex')}`
    sources.push({
      source: 'signed-full-generation',
      root: path.join(pluginRoot, 'pointers', 'current'),
      verifier: {
        executable: process.execPath,
        script: toAsarUnpackedPath(
          path.join(
            application.getPath('feature.prometheus.pack.builtin'),
            'reviewed-verifier',
            'scripts',
            'verify-reviewed-skill-coverage.js'
          )
        ),
        pluginRoot,
        home,
        trustStore,
        trustRootDigest
      }
    })
  } catch {
    // An absent or unreadable trusted full-pack source remains unreviewed.
  }
  return JSON.stringify({ schemaVersion: 1, sources })
}
