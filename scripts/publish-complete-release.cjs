const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { assertPublicReleaseProfile } = require('./public-release-profile.cjs')
const { resolveReleaseTargets } = require('./release-profile.cjs')

const root = path.resolve(__dirname, '..')
const repository = process.env.GITHUB_REPOSITORY
const branch = process.env.RELEASE_BRANCH
const source = process.env.GITHUB_SHA
const version = require('../package.json').version
const tag = `v${version}`
const profile = assertPublicReleaseProfile()
const platforms = resolveReleaseTargets(version, profile)
const selected = (process.env.RELEASE_PLATFORMS || '').split(',')
const landingRepository = process.env.LANDING_REPOSITORY
const landingToken = process.env.LANDING_DISPATCH_TOKEN

if (!repository || !branch || !landingRepository || !landingToken || !/^[a-f0-9]{40}$/.test(source || '')) {
  throw new Error('Complete release publication requires repository, branch, source, and landing credentials')
}
if (selected.length !== platforms.length || selected.some((platform) => !platforms.includes(platform))) {
  throw new Error('Publication must include every frozen customer release platform')
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'the-boss-complete-release-'))
const manifests = []

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', ...options })
}

async function digest(file) {
  const hash = crypto.createHash('sha256')
  let size = 0
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk)
    size += chunk.length
  }
  return { sha256: hash.digest('hex'), size }
}

function matchesCompleteMetadata(metadata) {
  return (
    metadata.version === version &&
    metadata.profile === profile.id &&
    metadata.features?.uar === profile.uarEnabled &&
    metadata.source === source &&
    metadata.pendingPlatforms?.length === 0 &&
    manifests.every((item) => {
      const expected = item.manifest.artifacts[0]
      return metadata.artifacts?.some(
        (artifact) =>
          artifact.platform === item.platform &&
          artifact.arch === item.arch &&
          artifact.source === source &&
          artifact.name === expected.name &&
          artifact.size === expected.size &&
          artifact.sha256 === expected.sha256
      )
    })
  )
}

async function main() {
  for (const platformKey of selected) {
    const [platform, arch] = platformKey.split('-')
    const filename = `installers-${platformKey}.json`
    const local = path.join(root, filename)
    const manifest = JSON.parse(fs.readFileSync(local, 'utf8'))
    const artifact = manifest.artifacts?.[0]
    if (
      manifest.version !== version ||
      manifest.profile !== profile.id ||
      manifest.features?.uar !== profile.uarEnabled ||
      manifest.source !== source ||
      manifest.platform !== platform ||
      manifest.arch !== arch ||
      manifest.artifacts?.length !== 1 ||
      artifact.profile !== profile.id ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256 || '') ||
      artifact.size <= 0 ||
      artifact.url !== `https://github.com/${repository}/releases/download/${tag}/${artifact.name}`
    ) {
      throw new Error(`Native installer record does not match frozen source: ${platformKey}`)
    }
    if (platform === 'darwin' && artifact.signing !== 'Developer ID (notarized)') {
      throw new Error(`Mac installer is not recorded as signed and notarized: ${platformKey}`)
    }
    const downloaded = path.join(temporaryDirectory, artifact.name)
    run('gh', [
      'release',
      'download',
      tag,
      '--repo',
      repository,
      '--pattern',
      artifact.name,
      '--dir',
      temporaryDirectory
    ])
    const actual = await digest(downloaded)
    if (actual.size !== artifact.size || actual.sha256 !== artifact.sha256) {
      throw new Error(`Published draft installer bytes do not match ${platformKey}`)
    }
    manifests.push({ platform, arch, filename, local, manifest })
  }

  const release = JSON.parse(
    run('gh', ['release', 'view', tag, '--repo', repository, '--json', 'isDraft,targetCommitish'])
  )
  if (release.targetCommitish !== source) {
    throw new Error('Release is not anchored at the frozen source')
  }
  for (const item of manifests) {
    const assetName = `release-platform-${tag}-${profile.id}-${item.platform}-${item.arch}-${source}.json`
    const existing = spawnSync(
      'gh',
      ['release', 'download', tag, '--repo', repository, '--pattern', assetName, '--dir', temporaryDirectory],
      { encoding: 'utf8' }
    )
    const assetPath = path.join(temporaryDirectory, assetName)
    if (existing.status === 0) {
      const actual = await digest(assetPath)
      const expected = await digest(item.local)
      if (actual.sha256 !== expected.sha256) throw new Error(`Immutable platform record changed: ${assetName}`)
    } else if (release.isDraft) {
      fs.copyFileSync(item.local, assetPath)
      run('gh', ['release', 'upload', tag, assetPath, '--repo', repository])
    } else {
      throw new Error(`Public release is missing immutable platform record: ${assetName}`)
    }
  }

  run('git', ['fetch', 'origin', branch])
  const current = JSON.parse(run('git', ['show', `origin/${branch}:release-manifest.json`]))
  const alreadyCommitted = matchesCompleteMetadata(current)
  if (!release.isDraft && !alreadyCommitted) {
    throw new Error('Public release metadata does not contain both frozen installers')
  }
  if (release.isDraft && !alreadyCommitted) {
    run('git', ['reset', '--hard', `origin/${branch}`])
    const directory = path.join(root, 'manifests')
    fs.rmSync(directory, { recursive: true, force: true })
    fs.mkdirSync(directory, { recursive: true })
    for (const item of manifests) fs.copyFileSync(item.local, path.join(directory, item.filename))
    const environment = {
      ...process.env,
      RELEASE_VERSION: version,
      RELEASE_BASE_SHA: run('git', ['rev-parse', 'HEAD']).trim(),
      RELEASE_PLATFORMS: selected.join(','),
      RELEASE_SOURCE_SHA: source
    }
    execFileSync(process.execPath, [path.join(__dirname, 'update-release-entry.cjs')], {
      cwd: root,
      env: environment,
      stdio: 'inherit'
    })
    const releaseManifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'))
    if (!matchesCompleteMetadata(releaseManifest)) throw new Error('Release metadata is incomplete')
    execFileSync(process.execPath, [path.join(__dirname, 'commit-release-entry.cjs')], {
      cwd: root,
      env: environment,
      stdio: 'inherit'
    })
  }
  if (release.isDraft) run('gh', ['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest'])

  for (const item of manifests) {
    const payload = {
      event_type: 'boss_release_platform_published',
      client_payload: {
        repository,
        tag,
        version,
        profile: profile.id,
        platform: item.platform,
        arch: item.arch,
        manifestAsset: `release-platform-${tag}-${profile.id}-${item.platform}-${item.arch}-${source}.json`
      }
    }
    run('gh', ['api', `repos/${landingRepository}/dispatches`, '--input', '-'], {
      env: { ...process.env, GH_TOKEN: landingToken },
      input: JSON.stringify(payload)
    })
  }
  console.log(`Published complete ${tag} release and dispatched ${manifests.length} landing records`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }))
