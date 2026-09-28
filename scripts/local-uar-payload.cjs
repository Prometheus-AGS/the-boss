const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const pin = require('../build/local-uar-source.json')
const MARKER = '.uar-local-payload.json'
const PACKAGE = `uar-sidecar-${pin.platform}`

function sha256(filename) {
  const digest = crypto.createHash('sha256')
  const file = fs.openSync(filename, 'r')
  const chunk = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead
    while ((bytesRead = fs.readSync(file, chunk, 0, chunk.length, null)) > 0) {
      digest.update(chunk.subarray(0, bytesRead))
    }
  } finally {
    fs.closeSync(file)
  }
  return digest.digest('hex')
}

function isSafePath(filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\\') || path.posix.isAbsolute(filename))
    return false
  const normalized = path.posix.normalize(filename)
  return normalized === filename && normalized !== '..' && !normalized.startsWith('../')
}

function requireFile(filename) {
  const stat = fs.lstatSync(filename, { throwIfNoEntry: false })
  if (!stat?.isFile() || stat.size === 0) throw new Error(`Local UAR payload file is missing or empty: ${filename}`)
  return stat
}

function inspectLocalUarRecord() {
  if (process.env.CI) throw new Error('Local UAR payloads are forbidden in release CI')
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Local UAR payloads require a native Apple Silicon host')
  }
  const sourceDir = process.env.THE_BOSS_LOCAL_UAR_SOURCE_DIR?.trim()
  if (!sourceDir) throw new Error('Set THE_BOSS_LOCAL_UAR_SOURCE_DIR to the clean, pinned UAR checkout')
  const root = fs.realpathSync(sourceDir)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  if (fs.realpathSync(git('rev-parse', '--show-toplevel')) !== root) {
    throw new Error('THE_BOSS_LOCAL_UAR_SOURCE_DIR must name the UAR checkout root')
  }
  const source = git('rev-parse', 'HEAD')
  if (source !== pin.revision) throw new Error(`Local UAR source ${source} does not match ${pin.revision}`)
  if (git('status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude)dist/boss-sidecar')) {
    throw new Error('Local UAR source checkout has uncommitted or untracked changes')
  }

  const output = path.join(root, 'dist', 'boss-sidecar')
  const recordFile = path.join(output, `${PACKAGE}.json`)
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'))
  if (
    record.name !== 'uar-sidecar' ||
    record.version !== pin.version ||
    record.platform !== pin.platform ||
    record.source !== pin.revision ||
    record.asset !== `${PACKAGE}.tar.gz` ||
    record.archive !== 'tar.gz' ||
    !Array.isArray(record.binaries) ||
    record.binaries.length === 0 ||
    !/^[a-f0-9]{64}$/.test(record.sha256)
  ) {
    throw new Error('Local UAR payload record does not match the pinned source and platform')
  }
  const archive = path.join(output, record.asset)
  requireFile(archive)
  if (sha256(archive) !== record.sha256) throw new Error('Local UAR archive checksum does not match its record')
  return { archive, record }
}

function loadLocalUarPayload() {
  const { archive, record } = inspectLocalUarRecord()
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'the-boss-local-uar-'))
  try {
    const archiveEntries = execFileSync('tar', ['tzf', archive], { encoding: 'utf8' }).trim().split('\n')
    if (
      archiveEntries.some(
        (name) =>
          name !== `${PACKAGE}/` && (!name.startsWith(`${PACKAGE}/`) || !isSafePath(name.slice(PACKAGE.length + 1)))
      )
    ) {
      throw new Error('Local UAR archive contains an unexpected path')
    }
    execFileSync('tar', ['xzf', archive, '-C', packageRoot, '--strip-components=1'])
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'payload-manifest.json'), 'utf8'))
    if (
      manifest.schema !== 1 ||
      manifest.name !== 'uar-sidecar' ||
      manifest.version !== pin.version ||
      manifest.platform !== pin.platform ||
      manifest.source !== pin.revision ||
      !Array.isArray(manifest.files) ||
      !Array.isArray(record.binaries)
    ) {
      throw new Error('Local UAR file manifest does not match the pinned source and platform')
    }
    const files = manifest.files
    const names = files.map((entry) => entry.path)
    if (
      new Set(names).size !== names.length ||
      !names.includes('uar-sidecar') ||
      !names.includes('uar-models/config.json')
    ) {
      throw new Error('Local UAR file manifest has missing or duplicate files')
    }
    if (JSON.stringify([...names, 'payload-manifest.json'].sort()) !== JSON.stringify([...record.binaries].sort())) {
      throw new Error('Local UAR file manifest does not match its archive record')
    }
    for (const entry of files) {
      if (
        !isSafePath(entry.path) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size <= 0 ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      ) {
        throw new Error(`Invalid local UAR file record: ${entry.path || '<missing path>'}`)
      }
      const filename = path.join(packageRoot, ...entry.path.split('/'))
      const stat = requireFile(filename)
      if (stat.size !== entry.size || sha256(filename) !== entry.sha256) {
        throw new Error(`Local UAR file checksum does not match its manifest: ${entry.path}`)
      }
    }

    return {
      packageRoot,
      marker: {
        schema: 1,
        name: 'uar-sidecar',
        version: pin.version,
        platform: pin.platform,
        source: pin.revision,
        archiveSha256: record.sha256,
        files
      },
      cleanup: () => fs.rmSync(packageRoot, { recursive: true, force: true })
    }
  } catch (error) {
    fs.rmSync(packageRoot, { recursive: true, force: true })
    throw error
  }
}

function stageLocalUarPayload(binaryDirectory) {
  const { packageRoot, marker, cleanup } = loadLocalUarPayload()
  try {
    const priorMarker = path.join(binaryDirectory, MARKER)
    const priorFiles = fs.existsSync(priorMarker) ? JSON.parse(fs.readFileSync(priorMarker, 'utf8')).files : []
    const canonical = require('../build/integration-artifacts.json').tools.find((tool) => tool.name === 'uar-sidecar')
    const owned = [
      ...(canonical?.packages?.[pin.platform]?.binaries || []),
      ...(priorFiles || []).map((entry) => entry.path)
    ]
    for (const filename of owned) {
      if (!isSafePath(filename)) throw new Error(`Invalid prior UAR payload path: ${filename}`)
      fs.rmSync(path.join(binaryDirectory, ...filename.split('/')), { force: true })
    }
    fs.rmSync(path.join(binaryDirectory, 'uar-models'), { recursive: true, force: true })
    for (const entry of marker.files) {
      const destination = path.join(binaryDirectory, ...entry.path.split('/'))
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(packageRoot, ...entry.path.split('/')), destination)
    }
    fs.copyFileSync(
      path.join(packageRoot, 'payload-manifest.json'),
      path.join(binaryDirectory, 'payload-manifest.json')
    )
    fs.chmodSync(path.join(binaryDirectory, 'uar-sidecar'), 0o755)
    fs.writeFileSync(path.join(binaryDirectory, '.uar-sidecar-version'), pin.version)
    fs.writeFileSync(priorMarker, `${JSON.stringify(marker, null, 2)}\n`)
  } finally {
    cleanup()
  }
}

function assertNoLocalUarPayload(binaryDirectory) {
  if (fs.existsSync(path.join(binaryDirectory, MARKER))) {
    throw new Error('Local UAR payload is present; public or non-UAR packaging requires a clean binary directory')
  }
}

module.exports = { MARKER, assertNoLocalUarPayload, inspectLocalUarRecord, loadLocalUarPayload, stageLocalUarPayload }
