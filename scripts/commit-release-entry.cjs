const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { assertPublicReleaseProfile } = require('./public-release-profile.cjs')
const version = process.env.RELEASE_VERSION || require('../package.json').version
const profile = assertPublicReleaseProfile()
const manifest = JSON.parse(fs.readFileSync('release-manifest.json', 'utf8'))
if (
  manifest.version !== version ||
  manifest.source !== (process.env.RELEASE_SOURCE_SHA || process.env.GITHUB_SHA) ||
  manifest.profile !== profile.id ||
  manifest.features?.uar !== profile.uarEnabled
) {
  throw new Error('Release metadata does not match the explicit publication identity')
}
const repository = process.env.GITHUB_REPOSITORY
const branch = process.env.RELEASE_BRANCH || process.env.GITHUB_REF_NAME
const expectedHead =
  process.env.RELEASE_BASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const current = JSON.parse(
  execFileSync('gh', ['api', `repos/${repository}/git/ref/heads/${branch}`], { encoding: 'utf8' })
)
if (current.object.sha !== expectedHead) throw new Error('Release metadata branch changed during publication')
const body = {
  query: 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { url oid } } }',
  variables: {
    input: {
      branch: { repositoryNameWithOwner: repository, branchName: branch },
      expectedHeadOid: expectedHead,
      message: {
        headline: `chore(releases): publish available v${version} installers [skip ci]`,
        body: 'Assisted-by: OpenAI Codex GPT-6 [GitHub Actions release packaging]'
      },
      fileChanges: {
        additions: ['RELEASES.md', 'release-manifest.json'].map((path) => ({
          path,
          contents: fs.readFileSync(path).toString('base64')
        }))
      }
    }
  }
}
execFileSync('gh', ['api', 'graphql', '--input', '-'], {
  input: JSON.stringify(body),
  stdio: ['pipe', 'inherit', 'inherit']
})
