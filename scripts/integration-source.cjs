const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const pins = require('../build/integration-sources.json')

function checkoutIntegrationSource(name, directory = path.join(root, 'build', 'integration-source', name)) {
  const pin = pins.sources[name]
  if (!pin) throw new Error(`Unknown integration source: ${name}`)
  fs.mkdirSync(directory, { recursive: true })
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  git('init')
  if (process.platform === 'win32') git('config', '--local', 'core.longpaths', 'true')
  if (git('status', '--porcelain', '--untracked-files=all'))
    throw new Error(`Integration source checkout has local changes: ${directory}`)
  git('fetch', '--depth=1', `https://github.com/${pin.repository}.git`, pin.revision)
  git('checkout', '--detach', 'FETCH_HEAD')
  if (git('rev-parse', 'HEAD') !== pin.revision) throw new Error(`Integration source pin mismatch: ${name}`)
  if (name === 'uar')
    git(
      'submodule',
      'update',
      '--init',
      'crates/prometheus-skill-system',
      'vendor/git/liter-llm',
      'vendor/git/rust-mcp-filesystem'
    )
  return directory
}

module.exports = { checkoutIntegrationSource }

if (require.main === module) {
  const selected = process.env.INTEGRATION_TOOLS
    ? process.env.INTEGRATION_TOOLS.split(',').filter(Boolean)
    : Object.keys(pins.tools)
  const sources = new Set()
  for (const name of selected) {
    const recipe = pins.tools[name]
    if (!recipe) throw new Error(`Unknown native tool: ${name}`)
    sources.add(recipe.source)
  }
  for (const name of sources) checkoutIntegrationSource(name)
}
