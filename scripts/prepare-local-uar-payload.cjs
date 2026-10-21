const { loadLocalUarPayload } = require('./local-uar-payload.cjs')

const { marker, cleanup } = loadLocalUarPayload()
try {
  process.stdout.write(
    `Local UAR payload ready: ${marker.platform}, ${marker.source}, ${marker.files.length} files, archive ${marker.archiveSha256}${marker.provenance ? `, lifecycle ${marker.provenance.lifecycleControl.version}` : ''}\n`
  )
} finally {
  cleanup()
}
