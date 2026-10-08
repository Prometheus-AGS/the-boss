import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { ipc } from '../reusable-team-operation/scenario.mjs'
import { digest, requireFact, route, same } from '../reusable-team-operation/io.mjs'

const coverageKey = 'urn:prometheus:uar:reviewed-skill-coverage:1'
const bindingPath = '/api/v1/collaboration/deployment-bindings'
const sha256 = (bytes) => 'sha256:' + digest(bytes)
const clone = (value) => JSON.parse(JSON.stringify(value))
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)])) : value
const redigest = ({ contentDigest: _digest, ...value }) =>
  ({ ...value, contentDigest: sha256(JSON.stringify(canonical(value))) })
const identity = ({ id, version, digest: artifactDigest }) => ({ id, version, digest: artifactDigest })

function descendant(root, candidate) {
  const relative = path.relative(root, candidate)
  return Boolean(relative) && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)
}

function scopedFile(root, relative) {
  requireFact(typeof relative === 'string' && relative && !relative.includes('\\') &&
    relative.split('/').every((part) => part && part !== '.' && part !== '..'), 'C15_CLOSURE_PATH_INVALID')
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    requireFact(descendant(root, current) && !fs.lstatSync(current).isSymbolicLink(), 'C15_CLOSURE_PATH_NOT_ISOLATED')
  }
  requireFact(fs.lstatSync(current).isFile(), 'C15_CLOSURE_FILE_UNAVAILABLE')
  return current
}

async function refused(evaluate, name, input, expected) {
  const result = await evaluate(`window.api.ipcApi.request(${JSON.stringify(route(name))},${JSON.stringify(input)})`)
  const reason = result?.error?.message?.match(/\bUAR_TEAM_[A-Z0-9_]+\b/)?.[0]
  requireFact(result?.ok === false && expected.includes(reason), 'C15_COVERAGE_EXPECTED_IPC_REFUSAL_UNAVAILABLE')
  return { channel: route(name), reason }
}

function selectedClosure(revision, inventory) {
  const required = revision.team.members.flatMap((member) => member.skills).filter((skill) => skill.required)
  const matches = inventory.skills.flatMap((entry) => required
    .filter((skill) => entry.identity.artifactDigest === skill.digest)
    .map((skill) => ({ skill, entry })))
  const selected = matches.find(({ entry }) => entry.closure.paths.some((file) =>
    file !== entry.entrypoint && entry.roots.some((root) => file.startsWith(root + '/'))))
  requireFact(selected, 'C15_REQUIRED_MINI_SKILL_WITH_NON_ENTRYPOINT_CLOSURE_REQUIRED')
  const relative = selected.entry.closure.paths.find((file) => file !== selected.entry.entrypoint &&
    selected.entry.roots.some((root) => file.startsWith(root + '/')))
  return { ...selected, relative }
}

async function privateClaims({ trustedRequest, signal, workspaceId, binding, records }) {
  if (!trustedRequest) {
    records.push({ scenario: 'private-coverage-claim', status: 'not-exercised', reason: 'trusted-native-request-unavailable' })
    return
  }
  const request = (method, pathname, body) => trustedRequest({ workspaceId, method, path: pathname,
    ...(body === undefined ? {} : { body }) })
  const original = (await request('GET', bindingPath)).find((item) => item.id === binding.id && item.revision === binding.revision)
  requireFact(original?.effectiveBindingReceipt?.admitted && original.document?.extensions?.[coverageKey]?.required === true,
    'C15_NATIVE_REVIEWED_BINDING_UNAVAILABLE')
  const entries = original.document.extensions[coverageKey].value.entries
  requireFact(entries.some((entry) => entry.skillRef.required), 'C15_NATIVE_REQUIRED_COVERAGE_UNAVAILABLE')
  const next = redigest({ ...clone(original.document), revision: original.revision + 1 })
  const preflight = (document) => request('POST', bindingPath + ':preflight', {
    commandId: randomUUID(), expectedRevision: original.revision, binding: redigest(document)
  })
  signal.throwIfAborted()
  requireFact((await preflight(next)).activationSupported === true, 'C15_NATIVE_COVERAGE_BASELINE_NOT_ADMITTED')
  for (const scenario of ['forged-closure-digest', 'missing-required-coverage']) {
    signal.throwIfAborted()
    const document = clone(next)
    const claims = document.extensions[coverageKey].value.entries
    const index = claims.findIndex((entry) => entry.skillRef.required)
    if (scenario === 'forged-closure-digest') {
      const value = claims[index].closureDigest
      claims[index].closureDigest = 'sha256:' + (value[7] === '0' ? '1' : '0') + value.slice(8)
    } else claims.splice(index, 1)
    const result = await preflight(document)
    requireFact(result.activationSupported === false && result.diagnostics?.some((item) =>
      item.disposition === 'required-unsupported' && item.field.startsWith('/skills/')),
    'C15_FORGED_COVERAGE_NOT_REJECTED_BY_NATIVE_PREFLIGHT')
    records.push({ scenario, status: 'passed', activationSupported: false,
      diagnostics: result.diagnostics.map(({ field, disposition }) => ({ field, disposition })) })
  }
  const after = (await request('GET', bindingPath)).find((item) => item.id === binding.id)
  requireFact(after?.revision === original.revision && after.document.contentDigest === original.document.contentDigest &&
    after.effectiveBindingReceipt?.contentDigest === original.effectiveBindingReceipt.contentDigest,
  'C15_NEGATIVE_PREFLIGHT_CHANGED_INSTALLED_BINDING')
  records.push({ scenario: 'installed-private-binding-preserved', status: 'passed',
    bindingId: original.id, revision: original.revision, contentDigest: original.document.contentDigest,
    effectiveReceiptDigest: original.effectiveBindingReceipt.contentDigest })
}

/** Operate only the app's disposable payload; source preparation is not acceptance. */
export async function runCoverageScenarios({
  evaluate, signal, workspaceId, revision, binding, packRoot, isolatedUserData, evidence, trustedRequest
}) {
  const records = []
  evidence.coverageScenarios = records
  const isolated = fs.realpathSync(isolatedUserData)
  const root = fs.realpathSync(packRoot)
  requireFact(descendant(isolated, root), 'C15_DISPOSABLE_USER_DATA_PAYLOAD_REQUIRED')
  const inventoryFile = scopedFile(root, 'reviewed-skill-closures.json')
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'))
  requireFact(inventory.schemaVersion === 'prometheus-reviewed-skill-closures-v1', 'C15_REVIEWED_INVENTORY_UNAVAILABLE')
  const selected = selectedClosure(revision, inventory)
  const file = scopedFile(root, selected.relative)
  const original = fs.readFileSync(file)
  const expected = inventory.files.find((entry) => entry.path === selected.relative)?.sha256
  requireFact(expected === sha256(original), 'C15_CLOSURE_BASELINE_BYTES_CHANGED')
  const selectedEntry = (catalog) => catalog.entries.find((entry) => entry.skillRef?.id === selected.skill.id &&
    entry.skillRef.digest === selected.skill.digest && entry.skillRef.version === selected.skill.version)
  const catalog = await ipc(evaluate, route('skills'), {})
  requireFact(selectedEntry(catalog)?.reviewedCoverage?.status === 'reviewed', 'C15_BASELINE_SKILL_NOT_REVIEWED')
  const snapshot = () => ipc(evaluate, route('snapshot'), { workspaceId })
  const initialBindings = (await snapshot()).bindings
  const deploy = { workspaceId, teamId: revision.team.id, revision: revision.revision }
  const assertUnchanged = async () => requireFact(same((await snapshot()).bindings, initialBindings),
    'C15_REFUSED_COVERAGE_DEPLOYMENT_CHANGED_BINDINGS')

  await privateClaims({ trustedRequest, signal, workspaceId, binding, records })
  signal.throwIfAborted()
  try {
    fs.writeFileSync(file, Buffer.concat([original, Buffer.from('\nC15 disposable reviewed closure mutation\n')]))
    requireFact(selectedEntry(await ipc(evaluate, route('skills'), {}))?.reviewedCoverage?.status === 'blocked',
      'C15_CHANGED_CLOSURE_NOT_BLOCKED')
    const refusal = await refused(evaluate, 'deploy_authored', deploy, ['UAR_TEAM_SKILL_REVIEW_REQUIRED'])
    await assertUnchanged()
    records.push({ scenario: 'non-entrypoint-closure-byte-tamper', status: 'passed', skill: identity(selected.skill),
      relativePath: selected.relative, originalDigest: expected, refusal })
  } finally {
    fs.writeFileSync(file, original)
    requireFact(sha256(fs.readFileSync(file)) === expected, 'C15_CLOSURE_RESTORATION_FAILED')
  }
  requireFact(selectedEntry(await ipc(evaluate, route('skills'), {}))?.reviewedCoverage?.status === 'reviewed',
    'C15_RESTORED_CLOSURE_NOT_REVIEWED')

  signal.throwIfAborted()
  const backupRoot = fs.mkdtempSync(path.join(isolated, 'c15-closure-backup-'))
  const backup = path.join(backupRoot, 'payload')
  try {
    fs.renameSync(file, backup)
    requireFact(selectedEntry(await ipc(evaluate, route('skills'), {}))?.reviewedCoverage?.status === 'blocked',
      'C15_MISSING_CLOSURE_NOT_BLOCKED')
    const refusal = await refused(evaluate, 'deploy_authored', deploy, ['UAR_TEAM_SKILL_REVIEW_REQUIRED'])
    await assertUnchanged()
    records.push({ scenario: 'missing-non-entrypoint-closure-file', status: 'passed', relativePath: selected.relative, refusal })
  } finally {
    if (fs.existsSync(backup)) fs.renameSync(backup, file)
    fs.rmdirSync(backupRoot)
    requireFact(sha256(fs.readFileSync(file)) === expected, 'C15_CLOSURE_RESTORATION_FAILED')
  }
  requireFact(selectedEntry(await ipc(evaluate, route('skills'), {}))?.reviewedCoverage?.status === 'reviewed',
    'C15_RESTORED_CLOSURE_NOT_REVIEWED')

  signal.throwIfAborted()
  const dependency = catalog.entries.find((entry) => entry.availability === 'available' &&
    entry.reviewedCoverage?.status === 'reviewed' && entry.skillRef?.requiredTools.length)
  requireFact(dependency, 'C15_ACTUAL_REVIEWED_TOOL_DEPENDENCY_REQUIRED')
  const team = clone(revision.team)
  const member = team.members.find((item) => item.role !== 'coordinator') ?? team.members[0]
  const requiredTool = dependency.skillRef.requiredTools[0]
  member.skills = [{ ...clone(dependency.skillRef), required: true }]
  member.knowledge = []
  member.tools = member.tools.filter((tool) => tool !== requiredTool)
  const authoredBefore = await ipc(evaluate, route('authoring'), {})
  const refusal = await refused(evaluate, 'save_authoring', { team, expectedRevision: revision.revision },
    ['UAR_TEAM_SKILL_TOOLS_UNAVAILABLE'])
  requireFact(same(await ipc(evaluate, route('authoring'), {}), authoredBefore), 'C15_REFUSED_SCOPE_SAVE_CHANGED_AUTHORING')
  records.push({ scenario: 'actual-required-tool-outside-member-host-scope', status: 'passed',
    skill: identity(dependency.skillRef), requiredTool, refusal })
  await assertUnchanged()
  evidence.coverageCoreComplete = records.filter((record) => record.scenario !== 'private-coverage-claim')
    .every((record) => record.status === 'passed')
  evidence.coverageComplete = records.every((record) => record.status === 'passed')
  return records
}

/** Optional real full-pack exercise. Caller supplies an already installed isolated signed generation. */
export async function runFullSignatureScenarios({ executable, script, pluginRoot, home, trustStore, isolatedUserData, signal, evidence }) {
  const isolated = fs.realpathSync(isolatedUserData)
  const root = fs.realpathSync(pluginRoot)
  const isolatedHome = fs.realpathSync(home)
  requireFact(descendant(isolated, root) && (isolatedHome === isolated || descendant(isolated, isolatedHome)) &&
    descendant(isolated, fs.realpathSync(trustStore)), 'C15_ISOLATED_FULL_GENERATION_REQUIRED')
  requireFact(!descendant(root, fs.realpathSync(script)), 'C15_IMMUTABLE_EXTERNAL_VERIFIER_REQUIRED')
  const invoke = () => promisify(execFile)(executable,
    [script, '--plugin-root', root, '--home', home, '--trust-store', trustStore],
    { signal, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, maxBuffer: 64 * 1024 * 1024 })
  const baseline = JSON.parse((await invoke()).stdout)
  requireFact(baseline.sourceClass === 'signed-full-generation' && /^[a-f0-9]{64}$/.test(baseline.generation),
    'C15_ISOLATED_SIGNED_GENERATION_BASELINE_UNAVAILABLE')
  const target = baseline.targetReceipts?.[0]?.target
  requireFact(typeof target === 'string' && !target.includes('..'), 'C15_SIGNED_TARGET_RECEIPT_UNAVAILABLE')
  const scenarios = [
    ['altered-generation-signature', `generations/${baseline.generation}/manifest.sig.json`],
    ['altered-target-receipt', `receipts/${baseline.generation}/${target.replaceAll('/', '__').replace(/^\./, '')}.json`]
  ]
  evidence.fullSignatureScenarios = []
  for (const [scenario, relative] of scenarios) {
    signal.throwIfAborted()
    const file = scopedFile(root, relative)
    const bytes = fs.readFileSync(file)
    try {
      const value = JSON.parse(bytes)
      const signature = scenario === 'altered-generation-signature' ? value : value.signature
      requireFact(typeof signature?.signature === 'string', 'C15_EXISTING_SIGNATURE_FORMAT_UNAVAILABLE')
      signature.signature = (signature.signature[0] === 'A' ? 'B' : 'A') + signature.signature.slice(1)
      fs.writeFileSync(file, JSON.stringify(value))
      let rejected = false
      try { await invoke() } catch (error) {
        signal.throwIfAborted()
        rejected = Number.isInteger(error.code) && error.code !== 0
      }
      requireFact(rejected, 'C15_SIGNED_GENERATION_TAMPER_NOT_REJECTED')
      evidence.fullSignatureScenarios.push({ scenario, status: 'passed', generationDigest: baseline.generationDigest })
    } finally {
      fs.writeFileSync(file, bytes)
      requireFact(sha256(fs.readFileSync(file)) === sha256(bytes), 'C15_SIGNATURE_RESTORATION_FAILED')
    }
    requireFact(JSON.parse((await invoke()).stdout).generationDigest === baseline.generationDigest,
      'C15_RESTORED_SIGNED_GENERATION_NOT_VERIFIED')
  }
  return evidence.fullSignatureScenarios
}
