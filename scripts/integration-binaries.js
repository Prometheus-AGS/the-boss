const fs = require('node:fs')
const path = require('node:path')

const { resolveReleaseProfile } = require('./release-profile.cjs')

/** Produced from successful native release jobs, then committed before installer packaging. */
function loadIntegrationBinaries({ required = false, platform: targetPlatform } = {}) {
  const filename = path.join(__dirname, '..', 'build', 'integration-artifacts.json')
  if (!fs.existsSync(filename)) {
    if (required)
      throw new Error(
        'Native integration artifacts are not pinned. Publish the integration tool payload before building installers.'
      )
    return []
  }
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'))
  const pins = require('../build/integration-sources.json')
  const profile = resolveReleaseProfile()
  const requiredTools = profile.nativeTools.filter(
    (name) => !(profile.localUar && ['uar-sidecar', 'liter-llm'].includes(name))
  )
  for (const name of requiredTools) {
    const tool = manifest.tools.find((entry) => entry.name === name)
    if (!tool) throw new Error(`Integration manifest is missing ${name}`)
    for (const platform of targetPlatform ? [targetPlatform] : profile.supportedPlatforms) {
      const asset = tool.packages[platform]
      if (!asset || !asset.url.startsWith('https://') || !/^[a-f0-9]{64}$/.test(asset.sha256))
        throw new Error(`Unpinned integration artifact: ${name} ${platform}`)
      if (name === 'bossfang' && (asset.dashboard?.embedded !== true || asset.dashboard?.basePath !== '/dashboard/'))
        throw new Error(`BossFang dashboard assets are not pinned for ${platform}`)
      if (required && ['uar-sidecar', 'liter-llm', 'bossfang'].includes(name)) {
        const source = typeof asset.source === 'string' ? asset.source : asset.source?.revision
        const pin = pins.sources[name === 'uar-sidecar' ? 'uar' : name]
        const expected = pin.platformRevisions?.[platform] ?? pin.revision
        if (source !== expected)
          throw new Error(`Publish and import ${name} ${platform} from pinned source ${expected} before packaging`)
      }
    }
  }
  return manifest.tools
    .filter((tool) => requiredTools.includes(tool.name))
    .map((tool) => ({
      ...tool,
      required,
      versionFile: `.${tool.name}-version`,
      ...(tool.name === 'bossfang' && targetPlatform ? { contentSha256: tool.packages[targetPlatform]?.sha256 } : {}),
      ...(tool.name === 'uar-sidecar'
        ? {
            payloadIdentity: {
              file: 'payload-manifest.json',
              field: 'source',
              value: manifest.sources.uar.platformRevisions?.[targetPlatform] ?? manifest.sources.uar.revision
            }
          }
        : {})
    }))
}

module.exports = { loadIntegrationBinaries }
