const { Arch } = require('electron-builder')
const fs = require('fs')
const { createRequire } = require('node:module')
const path = require('path')

const { readProjectBuildMetadata, replacePackagedBetterSqlite3 } = require('../linux-native/compat')
const { resolveReleaseProfile } = require('../release-profile.cjs')
const { assertPackagedUarPayloadAbsent, verifyAndProbePackagedUarPayload } = require('../uar-payload-integrity.cjs')

function verifyPackagedUarSidecar(context, platform) {
  const arch = context.arch === Arch.arm64 ? 'arm64' : context.arch === Arch.x64 ? 'x64' : null
  const platformPrefix = platform === 'mac' ? 'darwin' : platform === 'windows' ? 'win32' : null
  if (!arch || !platformPrefix) return
  const platformKey = `${platformPrefix}-${arch}`
  const resourcesDir =
    platform === 'mac'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources')
  const profile = resolveReleaseProfile()
  if (profile.uarEnabled) verifyAndProbePackagedUarPayload(resourcesDir, platformKey, { localUar: profile.localUar })
  else assertPackagedUarPayloadAbsent(resourcesDir, platformKey)
}

function verifyPackagedClaudeCli(context, platform) {
  if (platform !== 'mac' && platform !== 'windows') return
  const arch = context.arch === Arch.arm64 ? 'arm64' : context.arch === Arch.x64 ? 'x64' : null
  if (!arch) throw new Error(`Unsupported Claude Code packaging architecture: ${context.arch}`)
  const platformKey = platform === 'mac' ? 'darwin' : 'win32'
  const resourcesDir =
    platform === 'mac'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources')
  const executable = path.join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    '@anthropic-ai',
    `claude-agent-sdk-${platformKey}-${arch}`,
    platform === 'mac' ? 'claude' : 'claude.exe'
  )
  if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
    throw new Error(`Packaged Claude Code native executable is missing: ${executable}`)
  }
  if (platform === 'mac') fs.accessSync(executable, fs.constants.X_OK)
}

function installComputerUseRuntime(context) {
  const platform = context.electronPlatformName
  const arch = context.arch === Arch.arm64 ? 'arm64' : context.arch === Arch.x64 ? 'x64' : null
  if (!['darwin', 'win32', 'linux'].includes(platform) || !arch) {
    throw new Error(`Unsupported Computer Use packaging target: ${platform}-${context.arch}`)
  }
  const projectRequire = createRequire(path.join(context.packager.projectDir, 'package.json'))
  const sdkEntry = projectRequire.resolve('@cherrystudio/computer-use')
  const sdkRoot = path.dirname(path.dirname(sdkEntry))
  const sdkVersion = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8')).version
  const packageName = `@cherrystudio/computer-use-${platform}-${arch}`
  const manifestPath = createRequire(sdkEntry).resolve(`${packageName}/package.json`)
  const nativeRoot = path.dirname(manifestPath)
  if (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version !== sdkVersion) {
    throw new Error(`${packageName} must match SDK version ${sdkVersion}`)
  }

  const name =
    platform === 'darwin'
      ? 'Cherry Computer Use.app'
      : platform === 'win32'
        ? 'open-computer-use.exe'
        : 'open-computer-use'
  const source = path.join(nativeRoot, 'runtime', name)
  const executable = platform === 'darwin' ? path.join(source, 'Contents/MacOS/OpenComputerUse') : source
  const executables =
    platform === 'linux' ? [executable, path.join(nativeRoot, 'runtime/open-computer-use-wayland')] : [executable]
  for (const file of executables) {
    fs.accessSync(file, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
    if (!fs.statSync(file).isFile()) throw new Error(`Computer Use runtime is not a file: ${file}`)
  }

  const destination = path.join(context.packager.getResourcesDir(context.appOutDir), 'computer-use')
  fs.mkdirSync(destination, { recursive: true })
  fs.cpSync(path.join(nativeRoot, 'runtime'), destination, {
    recursive: true,
    verbatimSymlinks: true
  })
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    fs.copyFileSync(path.join(nativeRoot, file), path.join(destination, file))
  }
}
exports.installComputerUseRuntime = installComputerUseRuntime

exports.default = async function (context) {
  installComputerUseRuntime(context)
  const platform = context.packager.platform.name
  verifyPackagedClaudeCli(context, platform)
  verifyPackagedUarSidecar(context, platform)
  if (platform === 'windows') {
    fs.rmSync(path.join(context.appOutDir, 'LICENSE.electron.txt'), { force: true })
    fs.rmSync(path.join(context.appOutDir, 'LICENSES.chromium.html'), { force: true })
  } else if (platform === 'linux') {
    const arch = context.arch === Arch.arm64 ? 'arm64' : context.arch === Arch.x64 ? 'x64' : null
    if (!arch) throw new Error(`Unsupported Linux packaging architecture: ${context.arch}`)

    const projectRoot = path.join(__dirname, '../..')
    const { destination, manifest } = replacePackagedBetterSqlite3({
      projectRoot,
      appOutDir: context.appOutDir,
      arch,
      metadata: readProjectBuildMetadata(projectRoot)
    })
    process.stdout.write(
      `Installed GLIBC-compatible better-sqlite3 for linux-${arch} at ${destination} ` +
        `(ABI ${manifest.electronAbi}, ${JSON.stringify(manifest.requirements)})\n`
    )
  }
}
