const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')
const { parse } = require('yaml')

const root = path.resolve(__dirname, '..')
const include = fs.readFileSync(path.join(root, 'build', 'nsis-installer.nsh'), 'utf8')
const uninstallCommand = include.match(/^\s*ExecWait .*--remove-managed-path.*$/m)?.[0].trim()
if (!uninstallCommand) throw new Error('Managed PATH uninstall command is missing')

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'the-boss-nsis-'))
const source = path.join(work, 'preflight.nsi')
const output = path.join(work, 'preflight.exe').replaceAll('\\', '\\\\')
fs.writeFileSync(
  source,
  `Unicode true
Name "The Boss NSIS preflight"
OutFile "${output}"
InstallDir "$TEMP\\The Boss"
!define APP_EXECUTABLE_FILENAME "The Boss.exe"
Section
  ${uninstallCommand}
SectionEnd
`
)

async function compile() {
  const builderRequire = createRequire(require.resolve('electron-builder'))
  const { getMakeNsisPath } = builderRequire('app-builder-lib/out/toolsets/windows')
  const config = parse(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'))
  const compiler = await getMakeNsisPath(config.toolsets?.nsis, config.nsis?.customNsisBinary)
  const result = spawnSync(compiler.path, ['/WX', '/V4', source], {
    encoding: 'utf8',
    env: { ...process.env, ...compiler.env }
  })
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`NSIS preflight failed with exit code ${result.status}`)
}

compile().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
}).finally(() => fs.rmSync(work, { recursive: true, force: true }))
