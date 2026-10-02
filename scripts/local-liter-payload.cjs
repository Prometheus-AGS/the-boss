const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pins = require('../build/integration-sources.json')
const marker = '.liter-local-payload.json'

function loadLocalLiterRecord(platform) {
  if (process.env.THE_BOSS_UAR_LOCAL !== '1') throw new Error('Local Liter payloads require THE_BOSS_UAR_LOCAL=1')
  if (process.env.CI) throw new Error('Local Liter payloads are forbidden in release CI')
  if (platform !== 'darwin-arm64' || process.platform !== 'darwin' || process.arch !== 'arm64')
    throw new Error('Local Liter payloads require a native Apple Silicon checkpoint')
  const output = path.join(root, 'build', 'integration-output')
  const records = JSON.parse(fs.readFileSync(path.join(output, `tools-${platform}.json`), 'utf8'))
  const matches = records.filter((record) => record.name === 'liter-llm')
  if (matches.length !== 1) throw new Error('Local native build must contain exactly one Liter record')
  const record = matches[0]
  if (
    record.platform !== platform ||
    record.version !== pins.tools['liter-llm'].version ||
    record.source?.repository !== pins.sources['liter-llm'].repository ||
    record.source?.revision !== pins.sources['liter-llm'].revision ||
    record.asset !== `liter-llm-${platform}` ||
    record.archive !== 'none' ||
    JSON.stringify(record.binaries) !== JSON.stringify(['liter-llm']) ||
    !Number.isSafeInteger(record.size) ||
    record.size <= 0 ||
    !/^[a-f0-9]{64}$/.test(record.sha256)
  )
    throw new Error('Local Liter build record does not match its source and platform pins')
  const binary = path.join(output, record.asset)
  const bytes = fs.readFileSync(binary)
  if (bytes.length !== record.size || crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256)
    throw new Error('Local Liter bytes do not match their native build record')
  return { binary, record }
}

function stageLocalLiterPayload(directory, platform) {
  const { binary, record } = loadLocalLiterRecord(platform)
  fs.mkdirSync(directory, { recursive: true })
  fs.copyFileSync(binary, path.join(directory, 'liter-llm'))
  fs.chmodSync(path.join(directory, 'liter-llm'), 0o755)
  fs.writeFileSync(path.join(directory, '.liter-llm-version'), record.version)
  fs.writeFileSync(path.join(directory, marker), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

function assertNoLocalLiterPayload(directory) {
  if (fs.existsSync(path.join(directory, marker)))
    throw new Error('Local Liter payload is present; public packaging requires a clean binary directory')
}

module.exports = { loadLocalLiterRecord, stageLocalLiterPayload, assertNoLocalLiterPayload }
