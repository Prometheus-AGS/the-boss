const RELEASE_PLATFORM_KEYS = Object.freeze(['win32-x64', 'win32-arm64', 'darwin-arm64', 'darwin-x64'])
const UAR_RELEASE_PLATFORM_KEYS = Object.freeze(['win32-x64', 'darwin-arm64'])
const RETAINED_NATIVE_TOOLS = Object.freeze(['compass', 'rust-mcp-filesystem', 'prometheus', 'pk', 'node'])

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

module.exports = { RELEASE_PLATFORM_KEYS, RETAINED_NATIVE_TOOLS, UAR_RELEASE_PLATFORM_KEYS, resolveReleaseProfile }
