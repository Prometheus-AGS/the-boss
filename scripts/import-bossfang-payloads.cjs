const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const manifestPath = path.join(root, 'build', 'integration-artifacts.json')
const sourcesPath = path.join(root, 'build', 'integration-sources.json')
const [tag, ...recordPaths] = process.argv.slice(2)
const platforms = {
  'aarch64-apple-darwin': { platform: 'darwin-arm64', executable: 'bossfang' },
  'x86_64-pc-windows-msvc': { platform: 'win32-x64', executable: 'bossfang.exe' }
}

if (!/^bossfang-sidecar-[0-9a-f]{8,40}$/.test(tag ?? '') || recordPaths.length === 0) {
  throw new Error('usage: node scripts/import-bossfang-payloads.cjs <bossfang-sidecar-commit-tag> <native-manifest.json>...')
}

const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'))
const integration = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const source = sources.sources.bossfang
const tool = integration.tools.find((entry) => entry.name === 'bossfang')
if (!source || !/^[0-9a-f]{40}$/.test(source.revision) || !tool) {
  throw new Error('BossFang source and tool must be pinned before importing native payloads')
}
if (!tool.version?.endsWith(`+${source.revision.slice(0, 9)}`)) {
  throw new Error('BossFang package version must include the pinned source revision suffix')
}
if (tag !== `bossfang-sidecar-${source.revision.slice(0, tag.length - 'bossfang-sidecar-'.length)}`) {
  throw new Error('BossFang release tag does not match the pinned source commit')
}

const packages = { ...tool.packages }
const imported = new Set()
for (const recordPath of recordPaths) {
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  const target = platforms[record.target]
  if (
    !target ||
    record.schemaVersion !== 1 ||
    record.sourceCommit !== source.revision ||
    record.executable !== target.executable ||
    !Number.isSafeInteger(record.bytes) ||
    record.bytes <= 0 ||
    !/^[0-9a-f]{64}$/.test(record.sha256 ?? '') ||
    record.dashboard?.embedded !== true ||
    record.dashboard?.basePath !== '/dashboard/' ||
    !Array.isArray(record.features) ||
    !['telemetry', 'surreal-backend', 'uar-driver'].every((feature) => record.features.includes(feature))
  ) {
    throw new Error(`Invalid native BossFang manifest: ${recordPath}`)
  }
  if (imported.has(target.platform)) throw new Error(`Duplicate BossFang payload for ${target.platform}`)
  imported.add(target.platform)

  const assetName = `bossfang-${target.platform}${target.platform.startsWith('win32') ? '.exe' : ''}`
  const assetPath = path.join(path.dirname(recordPath), target.executable)
  const stat = fs.statSync(assetPath)
  if (!stat.isFile() || stat.size !== record.bytes) {
    throw new Error(`BossFang native executable differs from its manifest: ${assetPath}`)
  }
  const digest = require('node:crypto').createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex')
  if (digest !== record.sha256) throw new Error(`BossFang native executable checksum differs: ${assetPath}`)

  packages[target.platform] = {
    source: source.revision,
    url: `https://github.com/${source.repository}/releases/download/${tag}/${assetName}`,
    sha256: record.sha256,
    size: record.bytes,
    archive: 'none',
    binaries: [target.executable],
    dashboard: record.dashboard
  }
}

const next = {
  ...integration,
  sources: { ...integration.sources, bossfang: source },
  tools: integration.tools.map((entry) => (entry.name === 'bossfang' ? { ...entry, packages } : entry))
}
fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
console.log(`Imported BossFang payloads for ${[...imported].join(', ')}`)
