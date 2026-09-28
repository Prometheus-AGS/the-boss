const { inspectLocalUarRecord } = require('./local-uar-payload.cjs')

const { record } = inspectLocalUarRecord()
process.stdout.write(
  `Local UAR payload ready: ${record.platform}, ${record.source}, ${record.binaries.length} files, archive ${record.sha256}\n`
)
