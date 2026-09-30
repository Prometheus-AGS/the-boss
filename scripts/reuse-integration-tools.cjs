const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const output = path.resolve('build/integration-output')
fs.mkdirSync(output, { recursive: true })
const sourcePins = new Map()
function originalPins(runId) {
  if (sourcePins.has(runId)) return sourcePins.get(runId)
  const run = JSON.parse(
    execFileSync('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`], { encoding: 'utf8' })
  )
  const pins = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        `repos/${process.env.GITHUB_REPOSITORY}/contents/build/integration-sources.json?ref=${run.head_sha}`,
        '-H',
        'Accept: application/vnd.github.raw+json'
      ],
      { encoding: 'utf8' }
    )
  )
  sourcePins.set(runId, pins)
  return pins
}
for (const run of process.env.NATIVE_RUNS.split(',').map((value) => value.trim())) {
  if (!/^\d+$/.test(run)) throw new Error('Native payload reuse requires GitHub run IDs')
  // A failed run can still contain successful tools; publication checks the complete set.
  execFileSync('gh', ['run', 'watch', run, '--repo', process.env.GITHUB_REPOSITORY, '--interval', '30'], {
    stdio: 'inherit'
  })
  const directory = path.resolve('build/reused-native', run)
  execFileSync(
    'gh',
    [
      'run',
      'download',
      run,
      '--repo',
      process.env.GITHUB_REPOSITORY,
      '--pattern',
      'native-tools-*',
      '--dir',
      directory
    ],
    { stdio: 'inherit' }
  )
  for (const artifact of fs.readdirSync(directory)) {
    const source = path.join(directory, artifact)
    for (const name of fs.readdirSync(source)) {
      const destination = /^tools-.*\.json$/.test(name) ? `base-tools-${run}-${name.slice('tools-'.length)}` : name
      if (/^(?:base-)?tools-.*\.json$/.test(name)) {
        const originRun = /^base-tools-(\d+)-/.exec(name)?.[1] || run
        const records = JSON.parse(fs.readFileSync(path.join(source, name)))
        for (const record of records)
          if (!record.source) {
            const pins = originalPins(originRun)
            const recipe = pins.tools[record.name]
            if (!recipe || !pins.sources[recipe.source])
              throw new Error(`No original source for ${record.name} in run ${originRun}`)
            record.source = { ...pins.sources[recipe.source] }
            record.sourceEvidence = { runId: originRun, kind: 'original-workflow-frozen-pins' }
          }
        fs.writeFileSync(path.join(output, destination), JSON.stringify(records, null, 2) + '\n')
      } else fs.copyFileSync(path.join(source, name), path.join(output, destination))
    }
  }
}
