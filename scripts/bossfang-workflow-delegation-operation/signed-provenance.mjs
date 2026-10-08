import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { digest, requireFact } from './io.mjs'

// The completed macOS package uses this operator's Developer ID application identity.
const expectedTeam = '48VVJ9AXAR'

function command(name, args, code) {
  const result = spawnSync(name, args, { encoding: 'utf8' })
  requireFact(result.status === 0, code)
  return result
}

function signature(file) {
  // Same strict verification used by maintained uar-payload-integrity.cjs.
  command('codesign', ['--verify', '--strict', '--verbose=2', file], 'C14W_PLATFORM_SIGNATURE_INVALID')
  const displayed = command('codesign', ['--display', '--verbose=4', file], 'C14W_PLATFORM_SIGNATURE_IDENTITY_UNAVAILABLE')
  const details = displayed.stderr
  const field = key => details.match(new RegExp('^' + key + '=(.*)$', 'm'))?.[1] ?? null
  const authorities = [...details.matchAll(/^Authority=(.*)$/gm)].map(match => match[1])
  requireFact(field('TeamIdentifier') === expectedTeam &&
    authorities[0]?.startsWith('Developer ID Application: ') && authorities[0].endsWith('(' + expectedTeam + ')'),
  'C14W_PLATFORM_SIGNER_MISMATCH')
  return { verified: true, verification: 'codesign --verify --strict --verbose=2',
    identifier: field('Identifier'), teamIdentifier: field('TeamIdentifier'), authorities,
    cdHash: field('CDHash'), timestamp: field('Timestamp'), pageSize: Number(field('Page size')) || null }
}

function uuids(file) {
  const result = command('dwarfdump', ['--uuid', file], 'C14W_MACHO_BUILD_IDENTITY_UNAVAILABLE')
  const records = [...result.stdout.matchAll(/^UUID: ([A-Fa-f0-9-]{36}) \(([A-Za-z0-9_]+)\)/gm)]
    .map(match => ({ uuid: match[1].toUpperCase(), architecture: match[2] }))
    .sort((left, right) => left.architecture.localeCompare(right.architecture))
  requireFact(records.length > 0, 'C14W_MACHO_BUILD_IDENTITY_UNAVAILABLE')
  return records
}

/** Verify immutable download before accepting the observed macOS signing transformation. */
export function binaryProvenance(sourceFile, packagedFile, app, record) {
  const source = { sha256: digest(fs.readFileSync(sourceFile)), bytes: fs.statSync(sourceFile).size }
  const packaged = { sha256: digest(fs.readFileSync(packagedFile)), bytes: fs.statSync(packagedFile).size }
  requireFact(source.sha256 === record.sha256 && source.bytes === record.size, 'C14W_ORIGINAL_BOSSFANG_DIGEST_MISMATCH')
  if (packaged.sha256 === source.sha256) return { mode: 'byte-identical', source, packaged }
  const packagedSignature = signature(packagedFile)
  const appSignature = signature(app)
  requireFact(packagedSignature.authorities[0] === appSignature.authorities[0], 'C14W_APP_AND_BINARY_SIGNER_MISMATCH')
  const sourceUuids = uuids(sourceFile)
  const packagedUuids = uuids(packagedFile)
  requireFact(JSON.stringify(sourceUuids) === JSON.stringify(packagedUuids), 'C14W_SIGNED_BOSSFANG_BUILD_IDENTITY_MISMATCH')
  return { mode: 'macos-developer-id-signing', source: { ...source, machoBuildIdentities: sourceUuids },
    packaged: { ...packaged, machoBuildIdentities: packagedUuids, signature: packagedSignature },
    appSignature, expectedTeamIdentifier: expectedTeam }
}
