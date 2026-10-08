const { spawnSync } = require('node:child_process')

const version = require('../package.json').version
const { assertPublicReleaseProfile } = require('./public-release-profile.cjs')
const tag = `v${version}`
const repository = process.env.GITHUB_REPOSITORY
const profile = assertPublicReleaseProfile()
const profileNote = profile.uarEnabled
  ? `Feature profile: ${profile.id}. Includes complete pinned UAR sidecar payloads for Windows x64 and ARM64, and macOS Apple Silicon and Intel.`
  : `Feature profile: ${profile.id}. UAR is unavailable in this customer release while its sidecar packaging is corrected.`

const existing = spawnSync('gh', ['release', 'view', tag, '--repo', repository, '--json', 'body,targetCommitish'], {
  encoding: 'utf8'
})
if (existing.status === 0) {
  const release = JSON.parse(existing.stdout)
  const existingProfile = release.body.match(/^Feature profile: ([a-z-]+)\./m)?.[1]
  if (existingProfile !== profile.id) {
    throw new Error(`GitHub Release ${tag} already belongs to feature profile ${existingProfile || 'unknown'}`)
  }
  // The tag keeps its first source as the release anchor. A later platform may
  // use a newer commit; its immutable installer manifest records that commit.
  // release-preflight rejects replacing a published platform unless requested.
  console.log(`Using existing GitHub Release ${tag} anchored at ${release.targetCommitish}`)
  process.exit(0)
}

const notes = [
  `The Boss ${version} — workspace-bound tools, managed services, and the complete Prometheus skill payload.`,
  '',
  profileNote,
  `Platform targets: ${profile.supportedPlatforms.join(', ')}. Completed installers and their checksums and signing status appear in RELEASES.md as each platform is published.`
].join('\n')
const created = spawnSync(
  'gh',
  [
    'release',
    'create',
    tag,
    '--repo',
    repository,
    '--target',
    process.env.GITHUB_SHA,
    '--title',
    `The Boss ${version}`,
    '--notes',
    notes,
    '--draft'
  ],
  { encoding: 'utf8' }
)
process.stdout.write(created.stdout || '')
process.stderr.write(created.stderr || '')
if (created.status !== 0) throw new Error(`Unable to create GitHub Release ${tag}`)
