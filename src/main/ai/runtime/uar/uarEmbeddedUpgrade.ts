import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { promisify } from 'node:util'

import { loggerService } from '@logger'
import { isWin } from '@main/core/platform'
import { shouldSilenceFsyncDirError } from '@main/utils/file'
import { crossPlatformSpawn, waitForProcessExit } from '@main/utils/processRunner'

const logger = loggerService.withContext('UarEmbeddedUpgrade')
const run = promisify(execFile)
const manifest = path.join('manifest', '00000000000000000000.manifest')
const stagePrefix = '.runtime-db-upgrade'
const upgradeReceipt = '.boss-surrealdb-4-upgraded'
const maxConversionTime = 30 * 60_000

async function statIfPresent(file: string) {
  try {
    return await lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function manifestVersion(database: string): Promise<number | undefined> {
  const directory = await statIfPresent(database)
  if (!directory) return undefined
  if (!directory.isDirectory()) throw new Error('UAR database path must be a real directory')
  const manifestDirectory = await statIfPresent(path.dirname(path.join(database, manifest)))
  if (!manifestDirectory) return undefined
  if (!manifestDirectory.isDirectory()) throw new Error('UAR database manifest directory is invalid')
  const filename = path.join(database, manifest)
  const status = await statIfPresent(filename)
  if (!status) return undefined
  if (!status.isFile()) throw new Error('UAR database manifest must be a regular file')

  const file = await open(filename, 'r')
  try {
    const bytes = Buffer.alloc(2)
    if ((await file.read(bytes)).bytesRead !== bytes.length) throw new Error('UAR database manifest is truncated')
    return bytes.readUInt16BE()
  } finally {
    await file.close()
  }
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (!shouldSilenceFsyncDirError((error as NodeJS.ErrnoException).code)) throw error
  }
}

async function syncStagedData(directory: string, signal: AbortSignal): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    signal.throwIfAborted()
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await syncStagedData(filename, signal)
    } else if (entry.isFile()) {
      const handle = await open(filename, isWin ? 'r+' : 'r')
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
    } else {
      throw new Error('Converted UAR database contains a link or other unsupported entry')
    }
  }
  await syncDirectory(directory)
}

async function digest(file: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file, { signal })) hash.update(chunk)
  return hash.digest('hex')
}

async function copyDatabase(source: string, destination: string, signal: AbortSignal): Promise<void> {
  await mkdir(destination, { mode: 0o700 })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    signal.throwIfAborted()
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      await copyDatabase(from, to, signal)
    } else if (entry.isFile()) {
      // The lock is owned by the source process. The staging engine creates its own lock.
      if (entry.name === 'LOCK') continue
      await copyFile(from, to, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
      if (!isWin) await chmod(to, 0o600)
      if ((await digest(from, signal)) !== (await digest(to, signal))) {
        throw new Error('UAR database copy failed checksum verification')
      }
    } else {
      throw new Error('UAR database contains a link or other unsupported entry')
    }
  }
}

async function withDatabaseLock(
  executable: string,
  database: string,
  signal: AbortSignal,
  action: (assertLocked: () => void) => Promise<void>
): Promise<void> {
  const child = crossPlatformSpawn(executable, ['--lock-embedded-database', database], {
    env: { ...process.env, ...(isWin ? { UAR_SIDECAR_STDIN_OVERLAPPED: '1' } : {}) },
    stdio: [isWin ? 'overlapped' : 'pipe', 'pipe', 'ignore']
  })
  const lines = readline.createInterface({ input: child.stdout! })
  let closed = false
  const finished = new Promise<boolean>((resolve) => {
    child.once('error', () => resolve(false))
    child.once('close', (code) => {
      closed = true
      resolve(code === 0)
    })
  })
  // A failed lock helper can close the pipe before the host starts copying.
  child.stdin?.on('error', () => undefined)
  const starting = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  try {
    const hasLock = await new Promise<boolean>((resolve) => {
      const stopWaiting = () => resolve(false)
      starting.addEventListener('abort', stopWaiting, { once: true })
      lines.once('line', (line) => resolve(line === 'MIGRATION_LOCKED'))
      void finished.then(stopWaiting)
      if (starting.aborted) stopWaiting()
    })
    if (!hasLock) throw new Error('Could not lock the legacy UAR database. Close other UAR processes and retry.')
    const assertLocked = () => {
      signal.throwIfAborted()
      if (closed || child.exitCode !== null || child.signalCode !== null) {
        throw new Error('The UAR database lock was lost during upgrade')
      }
    }
    await action(assertLocked)
  } finally {
    lines.close()
    child.stdin?.end()
    if (!(await waitForProcessExit(child, 5000))) child.kill('SIGKILL')
    await finished
  }
}

/**
 * The app singleton and sidecar operation mutex serialize this transaction.
 * Keep the previous database by renaming it only after a verified copy can reopen.
 */
export async function upgradeEmbeddedUarDatabase(
  dataRoot: string,
  executable: string,
  signal: AbortSignal
): Promise<void> {
  const root = await realpath(dataRoot)
  const database = path.join(root, 'runtime.db')
  const transaction = path.join(root, stagePrefix)
  const original = path.join(transaction, 'original')
  const existingTransaction = await statIfPresent(transaction)
  if (existingTransaction && !existingTransaction.isDirectory()) {
    throw new Error('UAR database upgrade folder is not a real directory')
  }
  if (existingTransaction && (await statIfPresent(original))) {
    if ((await manifestVersion(original)) !== 1) throw new Error('UAR rollback database is invalid')
    if (await statIfPresent(database)) {
      const receipt = await statIfPresent(path.join(database, upgradeReceipt))
      if (!receipt?.isFile() || (await manifestVersion(database)) !== 3) {
        throw new Error(
          'UAR upgrade recovery found an unexpected live database. The original is retained in .runtime-db-upgrade/original.'
        )
      }
      return
    }
    // A prior process stopped between the two renames. Restore before retrying.
    await withDatabaseLock(executable, original, signal, async (assertLocked) => {
      assertLocked()
      if (await statIfPresent(database)) throw new Error('UAR database path became occupied during recovery')
      await rename(original, database)
      await syncDirectory(transaction)
      await syncDirectory(root)
    })
  }
  if ((await manifestVersion(database)) !== 1) return
  signal.throwIfAborted()
  await mkdir(transaction, { recursive: true, mode: 0o700 })
  await syncDirectory(root)
  if (await statIfPresent(original)) {
    throw new Error('An earlier UAR database backup already exists. Restore or relocate it before retrying.')
  }

  let stage: string | undefined
  try {
    await withDatabaseLock(executable, database, signal, async (assertLocked) => {
      const stagingDirectory = path.join(transaction, 'stage-' + randomUUID())
      await mkdir(stagingDirectory, { mode: 0o700 })
      stage = stagingDirectory
      const stagedDatabase = path.join(stagingDirectory, 'runtime.db')
      if ((await manifestVersion(database)) !== 1) throw new Error('The UAR database format changed before copy')
      await copyDatabase(database, stagedDatabase, signal)
      assertLocked()
      const { stdout } = await run(executable, ['--migrate-embedded-database', stagedDatabase], {
        timeout: maxConversionTime,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        signal
      })
      if (stdout.trim() !== 'MIGRATION_COMPLETE' || (await manifestVersion(stagedDatabase)) !== 3) {
        throw new Error('UAR migration failed to verify the converted database')
      }
      await syncStagedData(stagedDatabase, signal)
      const receipt = await open(path.join(stagedDatabase, upgradeReceipt), 'wx', 0o600)
      try {
        await receipt.sync()
      } finally {
        await receipt.close()
      }
      await syncDirectory(stagedDatabase)
      await syncDirectory(stagingDirectory)
      assertLocked()
      await rename(database, original)
      try {
        await syncDirectory(transaction)
        await syncDirectory(root)
        assertLocked()
        if (await statIfPresent(database)) throw new Error('UAR database path became occupied during cutover')
        await rename(stagedDatabase, database)
      } catch (error) {
        if (!(await statIfPresent(database))) {
          await rename(original, database)
          await syncDirectory(transaction)
          await syncDirectory(root)
        }
        throw error
      }
      await syncDirectory(root)
      await syncDirectory(stagingDirectory)
    })
  } catch (error) {
    throw new Error(
      'Could not upgrade the embedded UAR database to SurrealDB 4.0. The original data is retained. Restart The Boss to retry.',
      { cause: error }
    )
  } finally {
    if (stage) {
      await rm(stage, { recursive: true, force: true }).catch(() =>
        logger.warn('UAR upgrade staging could not be removed')
      )
    }
  }
  logger.info('UAR embedded database upgraded to SurrealDB 4.0', { backupDirectory: original })
}
