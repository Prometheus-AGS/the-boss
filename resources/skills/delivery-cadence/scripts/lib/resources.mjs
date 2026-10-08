import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { withLock, atomicJson } from './storage.mjs';

export const defaultRegistry = () => path.join(os.homedir(), '.prometheus', 'cadence', 'resources-v1');
export async function physicalPath(value) {
  let current = path.resolve(value); const missing = [];
  while (true) {
    try {
      const real = await fs.realpath(current);
      const alternate = path.join(path.dirname(real), path.basename(real).replace(/[a-zA-Z]/, ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()));
      let insensitive = false;
      if (alternate !== real) {
        const [original, changed] = await Promise.all([fs.stat(real), fs.stat(alternate).catch(() => null)]);
        insensitive = changed && original.ino === changed.ino && original.dev === changed.dev;
      }
      const physical = path.join(real, ...missing.reverse());
      return insensitive ? physical.toLowerCase() : physical;
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.push(path.basename(current)); current = parent;
    }
  }
}
const overlaps = (a, b) => a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
export async function claimResources(paths, owner, registry = defaultRegistry()) {
  registry = await physicalPath(registry);
  const roots = [...new Set(await Promise.all(paths.map(physicalPath)))].sort();
  return withLock(registry, async () => {
    const directory = path.join(registry, 'claims'); await fs.mkdir(directory, { recursive: true });
    const claims = await Promise.all((await fs.readdir(directory)).filter(n => n.endsWith('.json')).map(async n => JSON.parse(await fs.readFile(path.join(directory, n), 'utf8'))));
    for (const root of roots) {
      const collision = claims.find(c => c.operationToken !== owner.operationToken && overlaps(c.physicalPath, root));
      if (collision) throw new Error(`Physical output ${root} is reserved by ${collision.runId}/${collision.attemptId}; reconcile that owner before reuse`);
    }
    const created = [];
    try {
      for (const root of roots) {
        const key = createHash('sha256').update(root).digest('hex');
        const claim = { schemaVersion: 1, key, physicalPath: root, ...owner, hostname: os.hostname(), registry, claimedAt: new Date().toISOString() };
        await atomicJson(path.join(directory, `${key}.json`), claim); created.push(claim);
      }
    } catch (error) {
      for (const claim of created) await fs.unlink(path.join(directory, `${claim.key}.json`));
      throw error;
    }
    return created;
  });
}
export async function releaseResources(claims, operationToken) {
  for (const registry of new Set(claims.map(c => c.registry))) await withLock(registry, async () => {
    for (const claim of claims.filter(c => c.registry === registry)) {
      const file = path.join(registry, 'claims', `${claim.key}.json`);
      let current; try { current = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      if (current.operationToken !== operationToken) throw new Error('Resource ownership changed; refusing release');
      await fs.unlink(file);
    }
  });
}

export async function findResourceClaims(operationToken, registry = defaultRegistry()) {
  const directory = path.join(registry, 'claims');
  let files; try { files = await fs.readdir(directory); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const result = [];
  for (const file of files.filter(n => n.endsWith('.json'))) {
    let claim; try { claim = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (claim.operationToken === operationToken) result.push(claim);
  }
  return result;
}
