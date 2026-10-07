import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { captureSources } from './checkpoints.mjs';
import { fail, digest, candidateId, candidateDigest, physicalPath, nonempty } from './pipeline-data.mjs';
import { verifyNestedSources, assertNestedAuthoritiesUnchanged } from './work-ahead-nested-proof.mjs';
const exec = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function captureFutureSources(state, item, requested, { exact = false } = {}) {
  if (!Array.isArray(requested) || !requested.length || requested.some(ref => !nonempty(ref?.repository))) fail('Future checkout source refs must name actual repositories');
  const roots = await Promise.all(item.checkoutRoots.map(physicalPath));
  const repositories = await Promise.all(requested.map(ref => physicalPath(ref.repository)));
  if (new Set(repositories).size !== roots.length || repositories.length !== roots.length || repositories.some(repo => !roots.includes(repo))) fail('Future source refs must identify every admitted checkout root exactly; predecessor or unrelated roots cannot replace them');
  const normalized = await Promise.all(requested.map(async ref => ({ ...ref, repository: await fs.realpath(ref.repository) })));
  normalized.sort((a, b) => a.repository.localeCompare(b.repository));
  const refs = await captureSources(normalized, state.storageRoot);
  if (exact && digest(normalized) !== digest(refs)) fail('Provided future source refs differ from independently captured checkout revisions/fingerprints');
  return refs;
}

/** Evidence binds the two different source sets; ancestry alone cannot prove dirty repair content. */
export async function verifyRepairedBase(state, item, candidate, input) {
  if (!nonempty(input.evidenceRef) || !path.isAbsolute(input.evidenceRef)) fail('Repaired-base reconciliation requires an absolute JSON evidence file');
  const bytes = await fs.readFile(input.evidenceRef), evidence = JSON.parse(bytes);
  if (evidence.schemaVersion !== 1 || evidence.workAheadId !== item.id || evidence.repairedCandidateId !== candidateId(candidate) || evidence.contentManifestDigest !== candidateDigest(candidate)) fail('Repair evidence does not identify this work-ahead and exact repaired candidate');
  if (digest(evidence.predecessorSourceRefs) !== digest(candidate.sourceRefs)) fail('Repair evidence must retain the repaired predecessor source refs exactly');
  const frozen = JSON.parse(await fs.readFile(candidate.manifestPath, 'utf8'));
  if (sha(JSON.stringify(frozen)) !== candidate.manifestHash) fail('Repaired candidate manifest changed after freeze');
  const future = await captureFutureSources(state, item, input.baseSourceRefs, { exact: true });
  if (digest(evidence.futureSourceRefs) !== digest(future)) fail('Repair evidence differs from actual future checkout sources');
  if (!Array.isArray(evidence.mappings) || evidence.mappings.length !== future.length) fail('Repair evidence needs one explicit mapping for every future checkout');
  const mapped = new Set(), nestedAuthorityRefs = [];
  for (const ref of future) {
    const mapping = evidence.mappings.find(entry => entry.repository === ref.repository);
    if (!mapping || mapped.has(mapping.repository)) fail('Missing or duplicate future-checkout repair mapping');
    mapped.add(mapping.repository);
    if (mapping.strategy === 'independent') {
      if (item.dependencyClass !== 'independent' || !nonempty(mapping.reason)) fail('Only a previously admitted independent scope may record an explained independent repair disposition');
      continue;
    }
    const predecessor = candidate.sourceRefs.find(source => source.repository === mapping.predecessorRepository);
    if (!predecessor) fail('Repair mapping refers to an unknown predecessor source');
    if (mapping.strategy === 'exact-snapshot') {
      if (ref.fingerprint !== predecessor.fingerprint || ref.revision !== predecessor.revision) fail('Exact-snapshot mapping does not contain the repaired predecessor bytes');
      continue;
    }
    if (!['ancestor', 'ancestor-with-nested-sources'].includes(mapping.strategy)) fail('Repair strategy must be ancestor, ancestor-with-nested-sources, exact-snapshot, or admitted independent');
    if (mapping.strategy === 'ancestor-with-nested-sources')
      nestedAuthorityRefs.push(...await verifyNestedSources(item, candidate, predecessor, ref, mapping));
    // captureSources hashes a clean commit as SHA256(revision). Dirty or nested
    // source content needs exact snapshot proof, or a committed repair/refreeze.
    if (mapping.strategy === 'ancestor' && (predecessor.submoduleRefs?.length || predecessor.fingerprint !== sha(predecessor.revision))) fail('Ancestry cannot prove preserved dirty or submodule repair content; use exact-snapshot or commit the repair and refreeze with explicit nested-source reconciliation');
    if (mapping.repairedRevision !== predecessor.revision || mapping.futureRevision !== ref.revision) fail('Ancestry mapping must identify the frozen repaired commit and actual future commit');
    try { await exec('git', ['-C', ref.repository, 'merge-base', '--is-ancestor', predecessor.revision, ref.revision], { shell: false }); }
    catch { fail('Future checkout does not descend from the repaired predecessor commit; reconcile its base before promotion'); }
  }
  // Re-read after the git observations so an edit during proof collection cannot
  // silently acquire a source-bound reconciliation receipt.
  await captureFutureSources(state, item, future, { exact: true });
  await assertNestedAuthoritiesUnchanged(nestedAuthorityRefs);
  return { baseSourceRefs: future, evidence: { path: input.evidenceRef, sha256: sha(bytes) },
    predecessorSourceRefs: structuredClone(candidate.sourceRefs), mappings: structuredClone(evidence.mappings),
    ...(nestedAuthorityRefs.length ? { nestedAuthorityRefs } : {}) };
}

export async function assertRepairUnchanged(state, item) {
  const repaired = item.repairedBaseRef;
  if (!repaired) return;
  if (!repaired.evidence?.path || !repaired.evidence?.sha256) fail('Historical repaired-base claim lacks captured proof; reconcile again before promotion');
  const bytes = await fs.readFile(repaired.evidence.path);
  if (sha(bytes) !== repaired.evidence.sha256) fail('Repaired-base evidence changed; record a new reconciliation before promotion');
  await captureFutureSources(state, item, repaired.baseSourceRefs, { exact: true });
  const authorities = repaired.mappings?.flatMap(mapping => mapping.strategy === 'ancestor-with-nested-sources'
    ? (mapping.nestedMappings ?? []).filter(entry => entry.strategy === 'authorized-replacement').map(entry => entry.authorityRef) : []) ?? [];
  const ordered = refs => [...refs].sort((a, b) => a.path.localeCompare(b.path) || a.sha256.localeCompare(b.sha256));
  if (digest(ordered(authorities)) !== digest(ordered(repaired.nestedAuthorityRefs ?? []))) fail('Historical nested replacement proof lacks captured authority hashes; reconcile again before promotion');
  await assertNestedAuthoritiesUnchanged(authorities);
}
