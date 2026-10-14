const RELEASE_PLATFORM_KEYS = Object.freeze(['win32-x64', 'win32-arm64', 'darwin-arm64', 'darwin-x64'])
const UAR_RELEASE_PLATFORM_KEYS = RELEASE_PLATFORM_KEYS
const RETAINED_NATIVE_TOOLS = Object.freeze(['compass', 'rust-mcp-filesystem', 'prometheus', 'pk', 'node', 'bossfang'])

function resolveReleaseProfile(env = process.env) {
  const value = env.THE_BOSS_UAR_ENABLED
  const localValue = env.THE_BOSS_UAR_LOCAL
  if (value !== undefined && value !== '0' && value !== '1') {
    throw new Error('THE_BOSS_UAR_ENABLED must be either 0 or 1')
  }
  if (localValue !== undefined && localValue !== '0' && localValue !== '1') {
    throw new Error('THE_BOSS_UAR_LOCAL must be either 0 or 1')
  }

  const uarEnabled = value !== '0'
  const localUar = localValue === '1'
  if (localUar && !uarEnabled) throw new Error('A local UAR payload requires UAR to be enabled')
  if (env.CI && (localUar || env.THE_BOSS_LOCAL_UAR_SOURCE_DIR)) {
    throw new Error('Local UAR payloads are forbidden in release CI')
  }
  return Object.freeze({
    id: localUar ? 'uar-enabled-local' : uarEnabled ? 'uar-enabled' : 'non-uar',
    uarEnabled,
    localUar,
    nativeTools: Object.freeze(
      uarEnabled ? [...RETAINED_NATIVE_TOOLS, 'uar-sidecar', 'liter-llm'] : [...RETAINED_NATIVE_TOOLS]
    ),
    supportedPlatforms: uarEnabled ? UAR_RELEASE_PLATFORM_KEYS : RELEASE_PLATFORM_KEYS
  })
}

function resolveReleaseTargets(version, profile) {
  const fs = require('node:fs')
  const path = require('node:path')
  const filename = path.join(__dirname, '..', 'build', 'customer-release-targets.json')
  if (!fs.existsSync(filename)) return profile.supportedPlatforms
  const configured = JSON.parse(fs.readFileSync(filename, 'utf8'))
  if (configured.version !== version) return profile.supportedPlatforms
  if (configured.schema !== 1 || !Array.isArray(configured.platforms) || !configured.platforms.length ||
      new Set(configured.platforms).size !== configured.platforms.length ||
      configured.platforms.some(platform => !profile.supportedPlatforms.includes(platform)))
    throw new Error('Customer release targets must select unique supported platforms')
  return configured.platforms
}

module.exports = { RELEASE_PLATFORM_KEYS, RETAINED_NATIVE_TOOLS, UAR_RELEASE_PLATFORM_KEYS, resolveReleaseProfile, resolveReleaseTargets }
