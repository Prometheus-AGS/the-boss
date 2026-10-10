import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { clone, digest, fail, nonempty, strings, timestamp } from './pipeline-data.mjs';

const sha = value => /^[a-f0-9]{64}$/.test(value ?? '');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scopeKinds = ['tasks', 'changes', 'phases', 'outcomes'];
function observedTime(value) {
  if (!nonempty(value)) fail('Historical evidence requires explicit original observed timestamps');
  return timestamp(value);
}
function sources(refs) {
  if (!Array.isArray(refs) || !refs.length) fail('Historical evidence needs actual immutable sourceRefs');
  for (const ref of refs) {
    if (!nonempty(ref.repository) || !/^[a-f0-9]{40}$/.test(ref.revision ?? '')) fail('Historical sources need repository and full commit identity');
    if (ref.submoduleRefs?.length) sources(ref.submoduleRefs);
  }
}
function ordered(document) {
  observedTime(document.startedAt); observedTime(document.finishedAt);
  if (Date.parse(document.finishedAt) < Date.parse(document.startedAt)) fail('Historical operation timestamps are reversed');
}
function artifact(value, published = false) {
  if (!nonempty(value?.platform) || !sha(value.sha256)) fail('Historical artifact needs platform and SHA-256');
  if (published) {
    if (!Number.isSafeInteger(value.size) || value.size < 1 || !nonempty(value.architecture)
      || !['signed', 'unsigned', 'unknown', 'ad-hoc'].includes(value.signingStatus)) fail('Historical platform needs byte size, architecture and accurate signingStatus');
    http(value.url);
  }
}
function http(value) {
  if (!nonempty(value) || !['http:', 'https:'].includes(new URL(value).protocol)) fail('Historical publication needs an HTTP(S) URL');
}

/** Only read evidence bytes. No source checkout, network operation or producer rerun. */
export async function historicalEvidence(input) {
  const files = new Map();
  async function read(ref) {
    if (!nonempty(ref?.path) || !sha(ref.sha256)) fail('Historical evidence reference needs path and SHA-256');
    const file = path.resolve(ref.path), bytes = await fs.readFile(file);
    if (hash(bytes) !== ref.sha256) fail('Historical evidence bytes differ from the supplied SHA-256: ' + file);
    const prior = files.get(file);
    if (prior && prior.sha256 !== ref.sha256) fail('Conflicting historical evidence references');
    files.set(file, { path: file, sha256: ref.sha256, bytes });
    return bytes;
  }
  async function references(refs) {
    if (!Array.isArray(refs) || !refs.length) fail('Historical claims need hashed original evidenceRefs');
    for (const ref of refs) await read(ref);
  }
  const release = input.release;
  if (!nonempty(release?.id) || !nonempty(release.targetId) || !nonempty(release.version)) fail('Historical release needs immutable id, targetId and version');
  observedTime(release.publishedAt); sources(release.sourceRefs);
  async function document(ref, kind) {
    const value = JSON.parse(await read(ref));
    if (value.schemaVersion !== 1 || value.kind !== kind || value.status !== 'success') fail('Historical ' + kind + ' evidence needs schemaVersion:1, matching kind and status:success');
    if (value.releaseVersion !== release.version || digest(value.sourceRefs) !== digest(release.sourceRefs)) fail('Historical ' + kind + ' release/source identity mismatch');
    observedTime(value.verifiedAt);
    await references(value.evidenceRefs);
    return clone(value);
  }
  const evidence = {};
  for (const kind of ['source', 'build', 'launch', 'feature', 'metadata', 'website']) evidence[kind] = await document(release.evidence?.[kind], kind);
  ordered(evidence.build); ordered(evidence.launch); ordered(evidence.feature);
  if (!Array.isArray(evidence.build.artifacts) || !evidence.build.artifacts.length) fail('Historical build needs identified artifacts');
  for (const item of evidence.build.artifacts) artifact(item);
  for (const kind of ['launch', 'feature']) {
    artifact(evidence[kind].artifact);
    if (!evidence.build.artifacts.some(a => a.platform === evidence[kind].artifact.platform && a.sha256 === evidence[kind].artifact.sha256)) fail('Historical ' + kind + ' did not operate a recorded built artifact');
  }
  if (evidence.launch.artifact.platform !== evidence.feature.artifact.platform || evidence.launch.artifact.sha256 !== evidence.feature.artifact.sha256) fail('Historical launch and feature must identify the same operated artifact');
  if (Date.parse(evidence.launch.startedAt) < Date.parse(evidence.build.finishedAt)
    || Date.parse(evidence.feature.startedAt) < Date.parse(evidence.launch.startedAt)) fail('Historical build/launch/feature chronology is inconsistent');
  if (!nonempty(evidence.feature.operationId) || !nonempty(evidence.feature.outcome)) fail('Historical feature needs observed operation identity and outcome');
  if (!Array.isArray(release.evidence.platforms) || !release.evidence.platforms.length) fail('Historical publication needs platform receipts');
  evidence.platforms = [];
  for (const ref of release.evidence.platforms) {
    const value = await document(ref, 'platform'); artifact(value, true);
    if (evidence.platforms.some(p => p.platform === value.platform)) fail('Historical platform receipt is duplicated');
    evidence.platforms.push(value);
  }
  http(evidence.metadata.url);
  if (!/^[a-f0-9]{40}$/.test(evidence.metadata.commit ?? '')) fail('Historical metadata needs actual full commit identity');
  http(evidence.website.url);
  if (!nonempty(evidence.website.deploymentId) || !Array.isArray(evidence.website.links)) fail('Historical website needs deployment identity and advertised links');
  for (const published of evidence.platforms) {
    if (!evidence.website.links.some(link => link.platform === published.platform && link.url === published.url
      && link.sha256 === published.sha256 && link.size === published.size && link.version === release.version)) fail('Historical website does not advertise exact published platform bytes/version');
  }
  const receipts = [...evidence.platforms.map(p => ({ ...p, effect: 'artifact:' + p.platform })),
    { ...evidence.metadata, effect: 'metadata' }, { ...evidence.website, effect: 'website' }];
  const mappings = [];
  if (!Array.isArray(input.mappings) || !input.mappings.length) fail('Historical adoption needs explicit obligation mappings');
  for (const mapping of input.mappings) {
    if (!nonempty(mapping.obligationId) || !nonempty(mapping.candidateId) || !sha(mapping.contentManifestDigest)) fail('Historical mapping needs exact obligation/candidate/content identity');
    if (mappings.some(m => m.obligationId === mapping.obligationId)) fail('Historical obligation mapping is duplicated');
    const proof = await document(mapping.evidence, 'scope-coverage');
    if (proof.candidateId !== mapping.candidateId || proof.contentManifestDigest !== mapping.contentManifestDigest) fail('Historical scope evidence identifies a different frozen candidate');
    if (!Array.isArray(proof.coverage) || !proof.coverage.length) fail('Historical scope evidence needs per-scope coverage, not ancestry alone');
    for (const covered of proof.coverage) {
      if (!scopeKinds.includes(covered.kind) || !nonempty(covered.id) || !nonempty(covered.reason)
        || !['observed-operation', 'source-applicability'].includes(covered.basis)) fail('Historical scope coverage needs kind, id, observed basis and reason');
      await references(covered.evidenceRefs);
    }
    mappings.push({ ...clone(mapping), proof });
  }
  return { release: clone(release), evidence, receipts, mappings, files: [...files.values()] };
}

export function validateHistoricalScope(mapping, obligation, candidate, receipts) {
  if (obligation.candidateId !== mapping.candidateId || obligation.contentManifestDigest !== mapping.contentManifestDigest) fail('Historical mapping does not match the original publication debt');
  if (digest(mapping.proof.candidateSourceRefs) !== digest(candidate.sourceRefs)) fail('Historical mapping must preserve exact original candidate sourceRefs');
  for (const kind of scopeKinds) {
    const required = strings(obligation.coveredScopes?.[kind] ?? [], 'obligation ' + kind);
    for (const id of required) if (!mapping.proof.coverage.some(item => item.kind === kind && item.id === id)) fail('Historical evidence lacks scope coverage: ' + kind + ':' + id);
  }
  if (!scopeKinds.some(kind => (obligation.coveredScopes?.[kind] ?? []).length)) fail('Historical debt has no explicit scope to certify');
  for (const effect of obligation.requiredEffects) if (!receipts.some(r => r.effect === effect)) fail('Historical release lacks required effect: ' + effect);
  if (obligation.requiredEffects.includes('website') && !receipts.some(r => r.effect === 'website' && r.url === obligation.policy.websiteUrl)) fail('Historical website differs from the owed publication target');
}

/** Append immutable evidence copies before the journal commit; orphan copies never confer credit. */
export async function preserveHistoricalFiles(root, files) {
  const directory = path.join(root, 'artifacts', 'historical-publication');
  await fs.mkdir(directory, { recursive: true });
  const preserved = [];
  for (const file of files) {
    const destination = path.join(directory, file.sha256);
    try {
      if (hash(await fs.readFile(destination)) !== file.sha256) fail('Stored immutable historical evidence changed');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const temporary = destination + '.' + randomUUID() + '.tmp';
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        try { await handle.writeFile(file.bytes); await handle.sync(); } finally { await handle.close(); }
        await fs.rename(temporary, destination);
      } finally { await fs.rm(temporary, { force: true }); }
    }
    preserved.push({ originalPath: file.path, path: destination, sha256: file.sha256 });
  }
  return preserved;
}
