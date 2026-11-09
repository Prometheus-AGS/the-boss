const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { assertPublicReleaseProfile } = require('./public-release-profile.cjs')
const { resolveReleaseTargets } = require('./release-profile.cjs')

const root = path.resolve(__dirname, '..')
const repository = process.env.GITHUB_REPOSITORY
const branch = process.env.RELEASE_BRANCH
const source = process.env.RELEASE_SOURCE_SHA
const version = process.env.RELEASE_VERSION
const runIds = (process.env.RELEASE_INSTALLER_RUNS ?? '').split(',').map((value) => value.trim())
const profile = assertPublicReleaseProfile()
const targets = new Set(resolveReleaseTargets(version, profile))
const records = new Map()

function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
}

if (!repository || !branch || !/^[a-f0-9]{40}$/.test(source ?? '') || !/^\d+\.\d+\.\d+$/.test(version ?? '') ||
    runIds.some((id) => !/^\d+$/.test(id)) || new Set(runIds).size !== runIds.length) {
  throw new Error('Supply the frozen source, version and unique native installer run IDs')
}
run('git', ['merge-base', '--is-ancestor', source, `origin/${branch}`])

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'the-boss-installer-records-'))
try {
  for (const id of runIds) {
    const endpoint = `repos/${repository}/actions/runs/${id}`
    const releaseRun = JSON.parse(run('gh', ['api', endpoint]))
    if (releaseRun.head_sha !== source || releaseRun.path !== '.github/workflows/the-boss-release.yml' ||
        releaseRun.status !== 'completed') {
      throw new Error(`Run ${id} is not a completed installer run at the frozen source`)
    }
    const { jobs } = JSON.parse(run('gh', ['api', `${endpoint}/jobs?per_page=100`]))
    for (const job of jobs) {
      const platform = /^Installer \(([^)]+)\)$/.exec(job.name)?.[1]
      if (!targets.has(platform) || job.conclusion !== 'success') continue
      if (records.has(platform)) throw new Error(`Multiple successful installer records for ${platform}`)
      const basename = `installers-${platform}`
      const directory = path.join(temporary, basename)
      run('gh', ['run', 'download', id, '--repo', repository, '--name', basename, '--dir', directory])
      const file = path.join(directory, `${basename}.json`)
      const record = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (record.source !== source || record.version !== version || record.profile !== profile.id ||
          `${record.platform}-${record.arch}` !== platform) {
        throw new Error(`Installer record for ${platform} does not match the frozen release`)
      }
      records.set(platform, file)
      console.log(`Collected ${platform} from run ${id}`)
    }
  }
  const missing = [...targets].filter((platform) => !records.has(platform))
  if (missing.length) throw new Error(`Missing successful installers: ${missing.join(', ')}`)
  for (const [platform, file] of records) fs.copyFileSync(file, path.join(root, `installers-${platform}.json`))
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
