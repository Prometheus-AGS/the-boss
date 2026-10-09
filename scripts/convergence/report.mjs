import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const supported = [
  { id: 'desktop-managed', implementation: 'available', authority: 'The Boss supervises; UAR executes; BossFang orchestrates', acceptance: 'source-specific' },
  { id: 'selected-runtime', implementation: 'available', authority: 'authenticated selected instance; current resource-side policy', acceptance: 'source-specific' },
  { id: 'local-team', implementation: 'available', authority: 'catalog execution owner and per-effect task/membership fence', acceptance: 'source-specific' },
  { id: 'personal-peer', implementation: 'available', authority: 'current endpoint-bound consent, explicit session unlock, personal data only', acceptance: 'native device/network pending' },
  { id: 'embedded-home-cloud', implementation: 'available', authority: 'one UAR executor; explicit placement and input consent; GET observation', acceptance: 'native profile matrix pending' },
  { id: 'bounded-representation', implementation: 'available', authority: 'owner-asserted current grant + Cedar; readonly disclosed assistance', acceptance: 'new source operation pending' },
  { id: 'distributed-team-members', implementation: 'unsupported', reason: 'No cross-instance member scheduler or resource-fence adapter is advertised' },
  { id: 'automatic-executor-takeover', implementation: 'unsupported', reason: 'Requires resource-side revocation and trusted quiescence; URL health is insufficient' },
  { id: 'linux-installer', implementation: 'excluded', reason: 'Operator release policy excludes Linux' }
]
export async function json(path) { return JSON.parse(await readFile(resolve(path), 'utf8')) }
export async function artifact(path) {
  const digest = createHash('sha256'); let size = 0
  for await (const chunk of createReadStream(resolve(path))) { size += chunk.length; digest.update(chunk) }
  return { path: resolve(path), size, sha256: digest.digest('hex') }
}
export function measures(receipts) {
  const finite = key => receipts.map(row => row[key]).filter(value => Number.isFinite(value))
  const sum = key => { const values = finite(key); return values.length ? values.reduce((a, b) => a + b, 0) : null }
  return { samples: receipts.length, taskQuality: sum('acceptedTasks'), humanCorrections: sum('humanCorrections'),
    costMicrounits: sum('costMicrounits'), latencyMs: sum('latencyMs'),
    duplicateEffects: sum('duplicateEffects'), unknownEffects: sum('unknownEffects'),
    administrationMs: sum('administrationMs'), missingMeasurementsRemainUnknown: true }
}
export async function runtime(url, credential) {
  const endpoint = new URL(url)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && local)) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Runtime URL must be HTTPS or loopback without credentials')
  if (!credential) throw new Error('Declare a credential environment variable for authenticated discovery')
  const response = await fetch(new URL('/api/uar/capabilities', endpoint), { headers: { Authorization: 'Bearer ' + credential }, redirect: 'error' })
  if (!response.ok) throw new Error('Runtime discovery failed with HTTP ' + response.status)
  const value = await response.json()
  return { uarVersion: value.uar_version, executionProfile: value.executionProfile,
    executionProfileStage: value.executionProfileStage, instance: value.instance,
    capabilities: value.capabilities, federation: value.federation,
    note: 'Authenticated discovery is not inference, effect authorization or installed acceptance' }
}
export async function report(options) {
  const sources = await json(options.sources)
  const operations = options.operations ? await json(options.operations) : []
  if (!Array.isArray(operations)) throw new Error('Operation receipts must be an array')
  const result = { schemaVersion: 1, recordedAt: new Date().toISOString(),
    sources, supportedProfiles: supported, operations, measurements: measures(operations),
    baseline: options.baseline ? measures(await json(options.baseline)) : null,
    runtime: options.runtimeUrl ? await runtime(options.runtimeUrl, process.env[options.credentialEnv]) : null,
    artifacts: await Promise.all(options.artifacts.map(artifact)),
    certification: 'not-implied', qualification: 'retain individual source-bound receipts' }
  await mkdir(dirname(resolve(options.out)), { recursive: true })
  await writeFile(resolve(options.out), JSON.stringify(result, null, 2) + '\n')
  return { report: resolve(options.out), artifacts: result.artifacts.length, observations: operations.length }
}
