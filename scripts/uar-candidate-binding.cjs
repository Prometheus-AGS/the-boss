const { isDeepStrictEqual } = require('node:util')

const BUILD_COMMAND = Object.freeze([
  'cargo',
  'build',
  '--release',
  '--locked',
  '--no-default-features',
  '--features',
  'server-full',
  '--bin',
  'uar-sidecar',
  '--target',
  'aarch64-apple-darwin'
])

function requireCandidateBinding(record, pin, sourceTree) {
  const provenance = record.provenance
  if (
    pin.schema !== 2 ||
    !/^[a-f0-9]{40}$/.test(pin.revision) ||
    pin.platform !== 'darwin-arm64' ||
    pin.target !== 'aarch64-apple-darwin' ||
    !isDeepStrictEqual(pin.features, ['server-full']) ||
    !isDeepStrictEqual(pin.lifecycleControl, {
      transport: 'inherited-stdin',
      version: 1,
      responsePrefix: 'LIFECYCLE:'
    }) ||
    !isDeepStrictEqual(record.features, pin.features) ||
    provenance?.schema !== 1 ||
    provenance.producer !== 'scripts/build-boss-candidate.mjs' ||
    provenance.sourceMode !== 'immutable-git-objects' ||
    provenance.source !== pin.revision ||
    provenance.sourceTree !== sourceTree ||
    !/^[a-f0-9]{40}$/.test(provenance.sourceTree) ||
    provenance.target !== pin.target ||
    !isDeepStrictEqual(provenance.features, pin.features) ||
    !isDeepStrictEqual(provenance.lifecycleControl, pin.lifecycleControl) ||
    provenance.build?.isolatedTarget !== true ||
    provenance.build.snapshot !== 'git-archive-with-submodules' ||
    !isDeepStrictEqual(provenance.build.command, BUILD_COMMAND) ||
    provenance.build.log?.path !== 'uar-build.log' ||
    !/^[a-f0-9]{64}$/.test(provenance.build.log.sha256) ||
    provenance.build.executable?.path !== 'uar-sidecar' ||
    !/^[a-f0-9]{64}$/.test(provenance.build.executable.sha256)
  ) {
    throw new Error('Local UAR candidate lacks the required fresh build, exact source and lifecycle protocol binding')
  }
  return provenance
}

function requireCandidateManifest(manifest, record) {
  if (
    !isDeepStrictEqual(manifest.provenance, record.provenance) ||
    !isDeepStrictEqual(manifest.features, record.features)
  ) {
    throw new Error('Local UAR candidate manifest and archive record disagree about build provenance')
  }
  for (const entry of [record.provenance.build.log, record.provenance.build.executable]) {
    if (!manifest.files.some((file) => file.path === entry.path && file.sha256 === entry.sha256)) {
      throw new Error(`Local UAR candidate manifest does not bind its retained build output: ${entry.path}`)
    }
  }
}

module.exports = { requireCandidateBinding, requireCandidateManifest }
