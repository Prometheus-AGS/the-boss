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
  const profile = resolveReleaseProfile()
  const bossfangPlatform = targetPlatform ?? `${process.platform}-${process.arch}`
  const requiredTools = [
    ...profile.nativeTools.filter((name) => !(profile.localUar && name === 'uar-sidecar')),
    ...(profile.bossfangPlatforms.includes(bossfangPlatform) ? ['bossfang'] : [])
  ]
  for (const name of requiredTools) {
    const tool = manifest.tools.find((entry) => entry.name === name)
    if (!tool) throw new Error(`Integration manifest is missing ${name}`)
    const platforms = name === 'bossfang' ? [bossfangPlatform] : targetPlatform ? [targetPlatform] : profile.supportedPlatforms
    for (const platform of platforms) {
      const asset = tool.packages[platform]
      if (!asset || !asset.url.startsWith('https://') || !/^[a-f0-9]{64}$/.test(asset.sha256))
        throw new Error(`Unpinned integration artifact: ${name} ${platform}`)
    }
  }
  return manifest.tools
    .filter((tool) => requiredTools.includes(tool.name))
    .map((tool) => ({
      ...tool,
      required,
      versionFile: `.${tool.name}-version`,
      ...(tool.name === 'bossfang' ? { contentSha256: tool.packages[bossfangPlatform].sha256 } : {}),
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
