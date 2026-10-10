import { randomUUID } from 'node:crypto'
import { constants, type BigIntStats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { ensureShellRcBackup, shellRcHash, syncShellRcDirectory } from './shellRcBackup'
import { containsManagedBlock, replaceManagedBlocks } from './shellRcBlocks'
import { resolveShellRcTarget, withShellRcLock } from './shellRcLock'

export { withShellRcLock } from './shellRcLock'

type Snapshot = { bytes: Buffer; stat: BigIntStats | null; fingerprint: string }

function sameStat(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

async function snapshot(target: string): Promise<Snapshot> {
  let entry: BigIntStats
  try {
    entry = await fs.lstat(target, { bigint: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { bytes: Buffer.alloc(0), stat: null, fingerprint: shellRcHash(Buffer.alloc(0)) }
  }
  if (!entry.isFile()) throw new Error('Shell startup target is not a regular file; no changes made')
  const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat({ bigint: true })
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    if (!sameStat(entry, before) || !sameStat(before, after) || BigInt(bytes.length) !== after.size) {
      throw new Error('Shell startup file changed while being read; no changes made')
    }
    const fingerprint = shellRcHash(bytes)
    if (!sameStat(after, await fs.lstat(target, { bigint: true }))) {
      throw new Error('Shell startup path changed while being read; no changes made')
    }
    return { bytes, stat: after, fingerprint }
  } finally {
    await handle.close()
  }
}

async function assertUnchanged(file: string, target: string, original: Snapshot): Promise<void> {
  if ((await resolveShellRcTarget(file)) !== target)
    throw new Error('Shell startup symlink target changed; no changes made')
  const current = await snapshot(target)
  if (
    current.fingerprint !== original.fingerprint ||
    (original.stat === null ? current.stat !== null : current.stat === null || !sameStat(original.stat, current.stat))
  ) {
    throw new Error('Shell startup file changed before replacement; retry without overwriting it')
  }
  if ((await resolveShellRcTarget(file)) !== target)
    throw new Error('Shell startup symlink target changed; no changes made')
  if (current.stat !== null && !sameStat(current.stat, await fs.lstat(target, { bigint: true }))) {
    throw new Error('Shell startup path changed before replacement; retry without overwriting it')
  }
}

/** Update only complete managed blocks, retaining an immutable first-change backup. */
export async function updateShellRcFile(file: string, block: string | null, backupDirectory: string): Promise<void> {
  await withShellRcLock(file, async (target) => {
    const original = await snapshot(target)
    const updated = replaceManagedBlocks(original.bytes, block)
    if (updated.equals(original.bytes)) return
    const mode = original.stat === null ? null : Number(original.stat.mode & 0o7777n)
    await ensureShellRcBackup(target, original.stat === null ? null : original.bytes, mode, backupDirectory)
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.the-boss-${randomUUID()}.tmp`)
    const handle = await fs.open(temporary, 'wx', 0o600)
    let replaced = false
    try {
      await handle.writeFile(updated)
      await handle.chmod(mode ?? 0o600)
      await handle.sync()
      await handle.close()
      await assertUnchanged(file, target, original)
      await fs.rename(temporary, target)
      replaced = true
      await syncShellRcDirectory(path.dirname(target))
    } finally {
      await handle.close()
      if (!replaced) await fs.unlink(temporary)
    }
  })
}

export async function shellRcContainsBlock(file: string, block: string): Promise<boolean> {
  try {
    const target = await resolveShellRcTarget(file)
    const current = await snapshot(target)
    return current.stat !== null && containsManagedBlock(current.bytes, block)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
