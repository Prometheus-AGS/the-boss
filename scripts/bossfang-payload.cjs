const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const run = (command, args, cwd, env = {}) =>
  execFileSync(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })

function prepareDashboard(cwd) {
  const directory = path.join(cwd, 'crates/librefang-api/dashboard')
  const pnpm = process.platform === 'win32' ? 'pnpm.exe' : 'pnpm'
  run(pnpm, ['install', '--frozen-lockfile', '--config.strict-dep-builds=false'], directory, { CI: 'true' })
  run(pnpm, ['run', 'build'], directory)
  return dashboardInventory(cwd)
}

function dashboardInventory(cwd) {
  const assets = path.join(cwd, 'crates/librefang-api/static/react')
  const index = path.join(assets, 'index.html')
  if (!fs.existsSync(index) || fs.statSync(index).size === 0)
    throw new Error('BossFang dashboard build produced no index.html')
  const entries = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile())
        entries.push({
          path: path.relative(assets, file).split(path.sep).join('/'),
          size: fs.statSync(file).size,
          sha256: hash(file)
        })
    }
  }
  walk(assets)
  if (!entries.some((entry) => /\.(?:js|css)$/.test(entry.path) && entry.size > 0))
    throw new Error('BossFang dashboard build has no functional assets')
  return { embedded: true, basePath: '/dashboard/', files: entries.sort((a, b) => a.path.localeCompare(b.path)) }
}

function packagePayload({ sourceDirectory, sourceCommit, target, platform, features, output }) {
  const dashboard = dashboardInventory(sourceDirectory)
  const executable = 'bossfang' + (platform.startsWith('win32-') ? '.exe' : '')
  const binary = path.join(sourceDirectory, 'target', target, 'release', executable)
  const asset = 'bossfang-' + platform + (platform.startsWith('win32-') ? '.exe' : '')
  fs.mkdirSync(output, { recursive: true })
  fs.copyFileSync(binary, path.join(output, asset))
  const record = {
    schemaVersion: 1,
    sourceCommit,
    target,
    executable,
    asset,
    bytes: fs.statSync(binary).size,
    sha256: hash(binary),
    features,
    dashboard,
    uarLifecycle: 'connection-only'
  }
  fs.writeFileSync(path.join(output, 'bossfang-' + platform + '.json'), JSON.stringify(record, null, 2) + '\n')
  return record
}

module.exports = { prepareDashboard, packagePayload }
