import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

export const shellRcHash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

export async function syncShellRcDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function privateFile(file: string): Promise<Buffer> {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('Shell startup backup is not a private regular file')
    }
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

async function createPrivateFile(file: string, bytes: Buffer): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  const handle = await fs.open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    // A hard link publishes the complete backup without replacing an original.
    await fs.link(temporary, file)
    await syncShellRcDirectory(path.dirname(file))
  } finally {
    await handle.close()
    await fs.unlink(temporary)
  }
}

export async function ensureShellRcBackup(
  target: string,
  original: Buffer | null,
  mode: number | null,
  backupDirectory: string
): Promise<void> {
  await fs.mkdir(backupDirectory, { recursive: true, mode: 0o700 })
  const directory = await fs.lstat(backupDirectory)
  if (
    !directory.isDirectory() ||
    (directory.mode & 0o077) !== 0 ||
    (process.getuid && directory.uid !== process.getuid())
  ) {
    throw new Error('Shell startup backup directory must be private and owned by the current user')
  }
  const key = shellRcHash(target)
  const metadataFile = path.join(backupDirectory, `${key}.json`)
  const backupFile = path.join(backupDirectory, `${key}.bak`)
  let metadataBytes: Buffer | null = null
  try {
    metadataBytes = await privateFile(metadataFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (metadataBytes !== null) {
    let metadata: unknown
    try {
      metadata = JSON.parse(metadataBytes.toString('utf8'))
    } catch {
      throw new Error('Shell startup backup metadata is incomplete; no changes made')
    }
    const record = metadata as Record<string, unknown> | null
    if (!record || record.version !== 1 || record.target !== target || typeof record.existed !== 'boolean') {
      throw new Error('Shell startup backup identity is invalid; no changes made')
    }
    if (record.existed) {
      if (
        typeof record.mode !== 'number' ||
        !Number.isInteger(record.mode) ||
        record.mode < 0 ||
        record.mode > 0o7777 ||
        typeof record.sha256 !== 'string' ||
        shellRcHash(await privateFile(backupFile)) !== record.sha256
      ) {
        throw new Error('Shell startup backup fingerprint is invalid; no changes made')
      }
    } else if (record.mode !== null || record.sha256 !== null) {
      throw new Error('Shell startup missing-file backup is invalid; no changes made')
    }
    return
  }
  if (original !== null) {
    try {
      await createPrivateFile(backupFile, original)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!(await privateFile(backupFile)).equals(original)) {
        throw new Error('Shell startup backup is incomplete or differs from the current file; inspect manually')
      }
    }
  }
  const metadata = {
    version: 1,
    target,
    existed: original !== null,
    mode,
    sha256: original === null ? null : shellRcHash(original)
  }
  await createPrivateFile(metadataFile, Buffer.from(JSON.stringify(metadata, null, 2) + '\n'))
}
