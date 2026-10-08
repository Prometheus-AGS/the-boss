const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pins = require('../build/integration-sources.json')
const [platform, target] = process.argv.slice(2)
const targets = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin'
}
if (targets[platform] !== target) throw new Error(`Unknown UAR packaging target: ${platform} ${target}`)

const source = pins.sources.uar.revision
const directory = path.join(root, 'build/integration-source/uar')
const output = path.join(root, 'build/integration-output')
const release = path.join(directory, 'target', target, 'release')
const executable = `uar-sidecar${platform.startsWith('win32-') ? '.exe' : ''}`
const asset = path.join(output, `uar-sidecar-${platform}${platform.startsWith('win32-') ? '.exe' : ''}`)
const cached = path.join(release, executable)
const records = JSON.parse(fs.readFileSync(path.join(output, `tools-${platform}.json`), 'utf8'))
const record = records.find((entry) => entry.name === 'uar-sidecar' && entry.platform === platform)
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const checkout = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

if (checkout !== source || !record || record.source?.revision !== source || record.version !== pins.tools['uar-sidecar'].version)
  throw new Error('UAR native artifact and source checkout do not match the pinned release')
if (record.sha256 !== hash(asset) || record.size !== fs.statSync(asset).size)
  throw new Error(`Native UAR artifact checksum mismatch: ${platform}`)
if (!fs.existsSync(cached) || hash(cached) !== record.sha256)
  throw new Error(`Exact native build cache is missing or differs from run artifact: ${platform}`)

const environment = { ...process.env, GITHUB_SHA: source, UAR_SIDECAR_FEATURES: record.features.join(',') }
execFileSync('node', [path.join(directory, 'scripts/package-boss-sidecar.mjs'), platform, target], {
  cwd: directory,
  env: environment,
  stdio: 'inherit'
})

const packaged = path.join(directory, 'dist/boss-sidecar')
const packageRecord = JSON.parse(fs.readFileSync(path.join(packaged, `uar-sidecar-${platform}.json`), 'utf8'))
const archive = path.join(packaged, packageRecord.asset)
for (const required of [
  executable,
  'payload-manifest.json',
  'uar-models/config.json',
  'policies/default.cedar',
  'policies/skill-mutation.cedar',
  'policies/tool-approval.cedar'
]) {
  if (!packageRecord.binaries.includes(required)) throw new Error(`UAR payload is incomplete: ${required}`)
}
if (packageRecord.source !== source || packageRecord.platform !== platform || hash(archive) !== packageRecord.sha256)
  throw new Error(`Packaged UAR payload source or checksum mismatch: ${platform}`)
if (platform.startsWith('win32-') && !packageRecord.binaries.some((file) => file.endsWith('.dll')))
  throw new Error(`Cached Windows UAR payload has no runtime DLLs: ${platform}`)

console.log(`Reused exact native build to package ${platform} from ${source}: ${packageRecord.sha256}`)
