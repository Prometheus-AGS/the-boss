const fs = require('node:fs')
const path = require('node:path')

const { RELEASE_PLATFORM_KEYS, resolveReleaseProfile } = require('./release-profile.cjs')
const { MARKER } = require('./local-uar-payload.cjs')

function assertPublicReleaseProfile(env = process.env) {
  const profile = resolveReleaseProfile(env)
  if (profile.localUar || env.THE_BOSS_LOCAL_UAR_SOURCE_DIR) {
    throw new Error('Local UAR payloads cannot be used by public release commands')
  }
  for (const platform of RELEASE_PLATFORM_KEYS) {
    const marker = path.join(__dirname, '..', 'resources', 'binaries', platform, MARKER)
    if (fs.existsSync(marker)) {
      throw new Error(`Local UAR payload is staged for ${platform}; public release commands require a clean checkout`)
    }
  }
  return profile
}

module.exports = { assertPublicReleaseProfile }
