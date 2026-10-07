import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fail, digest, candidateId, candidateDigest, nonempty } from './pipeline-data.mjs';

const exec = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const initialized = ref => ref.initialized !== false;
async function git(repository, args) {
  return (await exec('git', ['-C', repository, ...args], { shell: false, maxBuffer: 128 * 1024 * 1024 })).stdout;
}

// Reconstruct captureSources' clean fingerprint from committed gitlinks, including
// pinned-but-unobserved modules; no historical working tree is treated as evidence.
async function committedSnapshot(ref, entries, prefix = '') {
  if (!nonempty(ref.repository) || !/^[a-f0-9]{40,64}$/.test(ref.revision ?? '')) fail('Nested proof requires exact committed source identities');
  const top = (await git(ref.repository, ['rev-parse', '--show-toplevel'])).trim();
  if (await fs.realpath(top) !== await fs.realpath(ref.repository)) fail('Observed nested source must identify its own Git repository');
  if ((await git(ref.repository, ['cat-file', '-t', ref.revision])).trim() !== 'commit') fail('Nested proof revision must identify a Git commit');
  const links = (await git(ref.repository, ['ls-tree', '-r', '-z', '--full-tree', ref.revision])).split('\0')
    .filter(line => line.startsWith('160000 commit ')).map(line => {
      const tab = line.indexOf('\t');
      return { name: line.slice(tab + 1), revision: line.slice(0, tab).split(' ')[2] };
    });
  const refs = ref.submoduleRefs ?? [];
  if (!Array.isArray(refs) || refs.length !== links.length || new Set(refs.map(item => item.name)).size !== refs.length)
    fail('Nested snapshot is missing or duplicates committed gitlinks');
  const hash = createHash('sha256').update(ref.revision);
  for (const link of links) {
    const nested = refs.find(item => item.name === link.name);
    const relative = prefix ? prefix + '/' + link.name : link.name;
    if (!nested || path.isAbsolute(link.name) || link.name.split('/').some(part => !part || part === '.' || part === '..') ||
      nested.repository !== path.join(ref.repository, link.name) || nested.revision !== link.revision || entries.has(relative))
      fail('Nested snapshot identity, topology or revision differs from its committed gitlink');
    entries.set(relative, nested);
    if (!initialized(nested)) {
      if (nested.workingTree !== 'unobserved' || nested.fingerprint !== undefined || nested.submoduleRefs?.length)
        fail('Uninitialized module must remain a pinned unobserved source');
      hash.update(link.name).update(link.revision);
    } else {
      if (nested.initialized !== undefined && nested.initialized !== true) fail('Unsupported nested initialization identity');
      if (nested.workingTree !== undefined) fail('Initialized nested proof requires an observed committed snapshot');
      await committedSnapshot(nested, entries, relative);
      hash.update(link.name).update(nested.fingerprint);
    }
  }
  if (ref.fingerprint !== hash.digest('hex')) fail('Nested ancestry requires clean committed parent and nested fingerprints');
}

export async function verifyNestedSources(item, candidate, predecessor, future, mapping) {
  const previous = new Map(), next = new Map();
  await committedSnapshot(predecessor, previous);
  await committedSnapshot(future, next);
  if (previous.size !== next.size || [...previous.keys()].some(name => !next.has(name)))
    fail('Nested ancestry does not authorize source topology additions, removals or moves');
  const mappings = mapping.nestedMappings;
  if (!Array.isArray(mappings) || mappings.length !== next.size || new Set(mappings.map(entry => entry.path)).size !== mappings.length)
    fail('Nested ancestry requires one unique explicit mapping for every recursive nested source');
  const authorities = [];
  for (const [name, newRef] of next) {
    const oldRef = previous.get(name), proof = mappings.find(entry => entry.path === name);
    if (!proof || digest(proof.predecessorSourceRef) !== digest(oldRef) || digest(proof.futureSourceRef) !== digest(newRef))
      fail('Nested mapping must bind the exact old and new captured source snapshots');
    const equal = oldRef.name === newRef.name && oldRef.revision === newRef.revision &&
      oldRef.fingerprint === newRef.fingerprint && initialized(oldRef) === initialized(newRef) &&
      oldRef.workingTree === newRef.workingTree;
    if (proof.strategy === 'unchanged') {
      if (!equal) fail('Unchanged nested mapping differs in pin, content or initialization');
      continue;
    }
    if (proof.strategy !== 'authorized-replacement' || equal) fail('Changed nested snapshots require an explicit authorized-replacement mapping');
    const authority = proof.authorityRef;
    if (!authority || !path.isAbsolute(authority.path ?? '') || !/^[a-f0-9]{64}$/.test(authority.sha256 ?? ''))
      fail('Nested replacement requires an absolute checksummed authority document');
    const bytes = await fs.readFile(authority.path), document = JSON.parse(bytes);
    if (sha(bytes) !== authority.sha256 || document.schemaVersion !== 1 || document.kind !== 'nested-source-replacement' ||
      document.workAheadId !== item.id || document.repairedCandidateId !== candidateId(candidate) ||
      document.contentManifestDigest !== candidateDigest(candidate) || !nonempty(document.reason) ||
      digest(document.predecessorSourceRef) !== digest(oldRef) || digest(document.futureSourceRef) !== digest(newRef))
      fail('Nested replacement authority must bind this candidate and the exact old/new snapshots');
    authorities.push({ path: authority.path, sha256: authority.sha256 });
  }
  return authorities;
}

export async function assertNestedAuthoritiesUnchanged(authorities) {
  for (const authority of authorities) {
    if (!path.isAbsolute(authority.path ?? '') || !/^[a-f0-9]{64}$/.test(authority.sha256 ?? '') ||
      sha(await fs.readFile(authority.path)) !== authority.sha256)
      fail('Nested replacement authority changed; reconcile again before promotion');
  }
}
