import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const lockTimeoutMs = 30_000

export async function resolveShellRcTarget(file: string, createParent = false): Promise<string> {
  const absolute = path.resolve(file)
  try {
    const entry = await fs.lstat(absolute)
    if (!entry.isFile() && !entry.isSymbolicLink()) throw new Error('Shell startup target is not a regular file')
    // realpath must fail for a dangling symlink instead of replacing that link.
    return await fs.realpath(absolute)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    try {
      await fs.lstat(absolute)
      throw new Error('Shell startup target is a dangling symlink; no changes made')
    } catch (entryError) {
      if ((entryError as NodeJS.ErrnoException).code !== 'ENOENT') throw entryError
    }
    if (createParent) await fs.mkdir(path.dirname(absolute), { recursive: true })
    return path.join(await fs.realpath(path.dirname(absolute)), path.basename(absolute))
  }
}

async function readLock(file: string): Promise<{ pid: number; nonce: string } | null> {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 1_024) return null
    const value: unknown = JSON.parse(await handle.readFile('utf8'))
    if (!value || typeof value !== 'object') return null
    const owner = value as { pid?: unknown; nonce?: unknown }
    return typeof owner.pid === 'number' &&
      Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      typeof owner.nonce === 'string' &&
      /^[a-f0-9-]{36}$/.test(owner.nonce)
      ? { pid: owner.pid, nonce: owner.nonce }
      : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  } finally {
    await handle.close()
  }
}

function ownerIsDead(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

export async function withShellRcLock<T>(file: string, work: (resolvedPath: string) => Promise<T>): Promise<T> {
  const target = await resolveShellRcTarget(file, true)
  const lock = `${target}.the-boss.lock`
  const nonce = randomUUID()
  const deadline = Date.now() + lockTimeoutMs
  let acquired = false
  while (!acquired) {
    if (Date.now() >= deadline) throw new Error(`Shell startup lock acquisition timed out; retry or inspect: ${lock}`)
    try {
      const handle = await fs.open(lock, 'wx', 0o600)
      acquired = true
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, nonce }))
        await handle.sync()
      } finally {
        await handle.close()
      }
    } catch (error) {
      if (acquired) {
        await fs.unlink(lock)
        throw error
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let owner: Awaited<ReturnType<typeof readLock>> = null
      try {
        owner = await readLock(lock)
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw new Error(`Cannot inspect shell startup lock; inspect manually: ${lock}`)
      }
      if (owner && ownerIsDead(owner.pid)) {
        throw new Error(`Shell startup lock has a dead owner; inspect and remove it manually: ${lock}`)
      }
      if (Date.now() >= deadline) throw new Error(`Shell startup lock is busy or incomplete; retry or inspect: ${lock}`)
      await delay(50)
    }
  }
  try {
    if ((await resolveShellRcTarget(file)) !== target)
      throw new Error('Shell startup target changed while acquiring its lock')
    return await work(target)
  } finally {
    const owner = await readLock(lock)
    if (owner?.pid !== process.pid || owner.nonce !== nonce) {
      throw new Error(`Shell startup lock ownership changed; inspect manually: ${lock}`)
    }
    await fs.unlink(lock)
  }
}
