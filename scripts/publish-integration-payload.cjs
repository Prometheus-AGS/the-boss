const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const directory = path.join(root, 'build/integration-output')
const pins = JSON.parse(fs.readFileSync(path.join(root, 'build/integration-sources.json')))
const tag = process.env.PAYLOAD_TAG
if (!/^boss-tools-[a-zA-Z0-9.-]+$/.test(tag || '')) throw new Error('A unique boss-tools-* release tag is required')
const repository = process.env.GITHUB_REPOSITORY
const platforms = (
  process.env.PAYLOAD_PLATFORMS || 'darwin-x64,darwin-arm64,linux-x64,linux-arm64,win32-x64,win32-arm64'
).split(',')
const url = (asset) => `https://github.com/${repository}/releases/download/${tag}/${asset}`
const tools = new Map()
for (const filename of fs
  .readdirSync(directory)
  .filter((file) => /^(?:base-)?tools-.*\.json$/.test(file))
  .sort()) {
  for (const { name, version, platform, asset, ...record } of JSON.parse(
    fs.readFileSync(path.join(directory, filename))
  )) {
    if (!platforms.includes(platform)) continue
    if (!tools.has(name)) tools.set(name, { name, version, packages: {} })
    tools.get(name).packages[platform] = { ...record, asset, url: url(asset) }
  }
}
// Fresh records supersede reused records before checking the selected bytes.
for (const tool of tools.values()) {
  for (const [platform, record] of Object.entries(tool.packages)) {
    const bytes = fs.readFileSync(path.join(directory, record.asset))
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw new Error(`Native checksum mismatch: ${tool.name} ${platform}`)
    if (record.size !== undefined && record.size !== bytes.length)
      throw new Error(`Native size mismatch: ${tool.name} ${platform}`)
    if (!record.source?.repository || !/^[a-f0-9]{40}$/.test(record.source?.revision || ''))
      throw new Error(`Missing actual native source: ${tool.name} ${platform}`)
    record.size = bytes.length
    delete record.asset
  }
}
for (const name of Object.keys(pins.tools)) {
  if (name === 'uar-sidecar') continue
  for (const platform of platforms) {
    if (!tools.get(name)?.packages[platform]) throw new Error(`Missing native binary: ${name} ${platform}`)
  }
}
tools.set('node', JSON.parse(fs.readFileSync(path.join(root, 'build/node-artifacts.json'))))
const pinnedIntegration = JSON.parse(fs.readFileSync(path.join(root, 'build/integration-artifacts.json')))
const pinnedBossfang = pinnedIntegration.tools.find((tool) => tool.name === 'bossfang')
if (
  pinnedIntegration.sources.bossfang?.revision !== pins.sources.bossfang?.revision ||
  !pinnedBossfang ||
  Object.entries(pinnedBossfang.packages).some(
    ([platform, artifact]) =>
      !['darwin-arm64', 'win32-x64'].includes(platform) ||
      artifact.source !== pins.sources.bossfang.revision ||
      !/^https:\/\/github\.com\/GQAdonis\/librefang\/releases\/download\//.test(artifact.url) ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
  )
) {
  throw new Error('Pinned BossFang payload does not match the selected source revision')
}
tools.set('bossfang', pinnedBossfang)
const images = {
  surrealdb: 'surrealdb/surrealdb:v3.3.0@sha256:681c6c22c287421b5c7d99e0fde79b6e0d32c36c1ddeaab2762a1661cb04cd20'
}
const imageProvenance = {}
let reusedImagePins
for (const service of ['surreal-memory', 'liter-llm']) {
  const record = JSON.parse(fs.readFileSync(path.join(directory, `${service}-image.json`)))
  if (!/^sha256:[a-f0-9]{64}$/.test(record.digest)) throw new Error(`Missing image digest: ${service}`)
  if (!record.source) {
    const originalRun = process.env.IMAGE_RUN
    if (!/^\d+$/.test(originalRun || '')) throw new Error(`Missing original image source: ${service}`)
    if (!reusedImagePins) {
      const run = JSON.parse(
        execFileSync('gh', ['api', `repos/${repository}/actions/runs/${originalRun}`], { encoding: 'utf8' })
      )
      reusedImagePins = JSON.parse(
        execFileSync(
          'gh',
          [
            'api',
            `repos/${repository}/contents/build/integration-sources.json?ref=${run.head_sha}`,
            '-H',
            'Accept: application/vnd.github.raw+json'
          ],
          { encoding: 'utf8' }
        )
      )
    }
    record.source = reusedImagePins.sources[service]
    record.recipeSource = service === 'liter-llm' ? reusedImagePins.sources.mini : record.source
    record.workflowRun = originalRun
  }
  if (!record.source?.repository || !/^[a-f0-9]{40}$/.test(record.source?.revision || ''))
    throw new Error(`Missing actual image source: ${service}`)
  images[service] = `${record.image}@${record.digest}`
  imageProvenance[service] = record
}
const skills = JSON.parse(fs.readFileSync(path.join(directory, 'compass-skills.json')))
const manifest = {
  schema: 1,
  platforms,
  sources: pins.sources,
  tools: [...tools.values()],
  images,
  imageProvenance,
  catalogs: pins.catalogs,
  compassSkills: { url: url(skills.asset), sha256: skills.sha256 }
}
fs.writeFileSync(path.join(directory, 'integration-artifacts.json'), JSON.stringify(manifest, null, 2) + '\n')
const assets = fs
  .readdirSync(directory)
  .filter((name) => !name.endsWith('-image.json') && !/^(?:base-)?tools-/.test(name) && name !== 'compass-skills.json')
  .map((name) => path.join(directory, name))
execFileSync(
  'gh',
  [
    'release',
    'create',
    tag,
    ...assets,
    '--latest=false',
    '--target',
    process.env.GITHUB_SHA,
    '--title',
    `The Boss native integration payload ${tag}`,
    '--notes',
    `Pinned native executables for ${platforms.join(', ')}, Compass skills, service image digests, and checksums for installer packaging. Installed Windows acceptance remains pending.`
  ],
  { stdio: 'inherit' }
)
