const { spawnSync } = require('node:child_process')

const version = require('../package.json').version
const { assertPublicReleaseProfile } = require('./public-release-profile.cjs')
const tag = `v${version}`
const repository = process.env.GITHUB_REPOSITORY
const profile = assertPublicReleaseProfile()
const platforms = require('./release-profile.cjs').resolveReleaseTargets(version, profile)
const qualificationNote =
  version === '2.2.40'
    ? ' UAR 1.1.1 is distributed at operator direction without completed functional qualification; the embedding-space mismatch proof remains NOT READY.'
    : ''
const profileNote = profile.uarEnabled
  ? `Feature profile: ${profile.id}. Includes complete pinned UAR sidecar payloads for the selected customer release platforms.${qualificationNote}`
  : `Feature profile: ${profile.id}. UAR is unavailable in this customer release while its sidecar packaging is corrected.`

const notes = [
  `The Boss ${version} — workspace-bound tools, managed services, and the complete Prometheus skill payload.`,
  '',
  profileNote,
  `Platform targets: ${platforms.join(', ')}. Both installers are published together after validation; their checksums and signing status appear in RELEASES.md.`
].join('\n')

const existing = spawnSync(
  'gh',
  ['release', 'view', tag, '--repo', repository, '--json', 'body,targetCommitish,isDraft'],
  {
    encoding: 'utf8'
  }
)
if (existing.status === 0) {
  const release = JSON.parse(existing.stdout)
  const existingProfile = release.body.match(/^Feature profile: ([a-z-]+)\./m)?.[1]
  if (existingProfile !== profile.id) {
    throw new Error(`GitHub Release ${tag} already belongs to feature profile ${existingProfile || 'unknown'}`)
  }
  if (release.isDraft && release.targetCommitish !== process.env.GITHUB_SHA) {
    throw new Error(`Draft GitHub Release ${tag} is anchored at another source`)
  }
  if (release.isDraft && release.body !== notes) {
    const updated = spawnSync(
      'gh',
      ['release', 'edit', tag, '--repo', repository, '--notes', notes, '--target', process.env.GITHUB_SHA],
      { encoding: 'utf8' }
    )
    if (updated.status !== 0) throw new Error('Unable to refresh the unpublished draft release source and notes')
  }
  console.log(`Using existing GitHub Release ${tag} anchored at ${release.targetCommitish}`)
  process.exit(0)
}

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
