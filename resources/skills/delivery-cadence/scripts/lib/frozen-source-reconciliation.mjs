import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';

import { captureSources, sameSources } from './checkpoints.mjs';
import { claimCommand, immutableJson, jobTransaction, now } from './jobs.mjs';
import { digest } from './candidates.mjs';
import { saveEvent } from './storage.mjs';

const execute = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = async (repository, args, encoding = 'utf8') =>
  (await execute('git', ['-C', repository, ...args], { encoding, maxBuffer: 128 * 1024 * 1024 })).stdout;

async function artifact(file, expected) {
  const resolved = path.resolve(file);
  const size = (await fs.stat(resolved)).size;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolved)) hash.update(chunk);
  if (hash.digest('hex') !== expected.sha256 || size !== expected.size) throw new Error(`Frozen artifact changed: ${resolved}`);
  return { path: resolved, sha256: expected.sha256, size: expected.size };
}

async function preserved(snapshot) {
  const patch = await fs.readFile(path.join(snapshot.directory, 'tracked.patch'));
  if (sha(patch) !== snapshot.patchSha256) throw new Error('Preserved frozen source patch changed');
  if (patch.length || snapshot.untrackedFiles?.length) throw new Error('This reconciliation requires clean committed frozen source and nested pins');
  for (const nested of snapshot.preservedSubmodules ?? []) await preserved(nested);
}

export async function assertFrozenReconciliation(root, state, candidate, iteration) {
  const record = (state.frozenSourceReconciliations ?? []).findLast(item => item.candidateId === candidate.id);
  if (!record) return null;
  const bytes = await fs.readFile(record.path);
  if (sha(bytes) !== record.sha256) throw new Error('Frozen source reconciliation receipt changed');
  const stored = JSON.parse(bytes);
  if (digest(stored.candidateSourceRefs) !== digest(candidate.sourceRefs) ||
      stored.candidateManifestHash !== candidate.manifestHash ||
      stored.iterationId !== iteration.id || stored.candidateId !== candidate.id) throw new Error('Frozen source reconciliation belongs to another candidate');
  const manifest = JSON.parse(await fs.readFile(candidate.manifestPath, 'utf8'));
  if (digest(manifest) !== candidate.manifestHash) throw new Error('Frozen candidate manifest changed');
  if (candidate.preservedSources?.length !== candidate.sourceRefs.length)
    throw new Error('Frozen candidate lacks preserved source snapshots');
  for (const snapshot of candidate.preservedSources ?? []) await preserved(snapshot);
  for (const item of stored.artifacts) await artifact(item.path, item);
  const operation = await fs.readFile(stored.operationEvidence.path);
  if (sha(operation) !== stored.operationEvidence.sha256) throw new Error('Feature operation evidence changed');
  const provenance = await fs.readFile(stored.provenance.path);
  if (sha(provenance) !== stored.provenance.sha256) throw new Error('Frozen build provenance changed');
  if (!sameSources(await captureSources(candidate.sourceRefs.map(item => ({ repository: item.repository })), root),
    stored.checkoutAtReconciliation)) throw new Error('Checkout advanced again after frozen source reconciliation');
  return { ...stored, path: record.path, sha256: record.sha256 };
}

export async function reconcileFrozenSource(root, input = {}, args = {}) {
  const candidateId = input.candidateId;
  if (!candidateId || !input.authorityRef?.trim() || !input.reason?.trim()) throw new Error('Frozen source reconciliation requires candidate, authority and reason');
  const evidencePath = path.resolve(input.operationEvidencePath);
  const provenancePath = path.resolve(input.provenancePath);
  const evidenceBytes = await fs.readFile(evidencePath), provenanceBytes = await fs.readFile(provenancePath);
  const evidence = JSON.parse(evidenceBytes), provenance = JSON.parse(provenanceBytes);
  if (evidence.complete !== true || evidence.finishedAt < evidence.startedAt || provenance.applicationBuildSource !== evidence.sourceRefs?.boss)
    throw new Error('Operation/provenance does not identify one completed frozen build');
  const result = await jobTransaction(root, async state => {
    const prior = claimCommand(state, 'candidate:reconcile-frozen', input, args); if (prior) return prior;
    const candidate = state.candidates.find(item => item.id === candidateId);
    const iteration = state.iterations.find(item => item.id === candidate?.iterationId);
    if (!candidate || !iteration || iteration.candidateId !== candidateId || iteration.workOutcome)
      throw new Error('Reconcile only the unfinished active frozen candidate');
    const previous = (state.frozenSourceReconciliations ?? []).findLast(item => item.candidateId === candidateId);
    if (previous && (previous.operationEvidence.sha256 !== sha(evidenceBytes) || previous.provenance.sha256 !== sha(provenanceBytes)))
      throw new Error('Existing frozen candidate operation/provenance differs; use a new delivery candidate');
    const source = candidate.sourceRefs;
    if (source.length !== 1 || source[0].revision !== evidence.sourceRefs.boss ||
        !sameSources(iteration.sourceRefs, source)) throw new Error('Operation does not identify the frozen source');
    const repository = source[0].repository;
    const driver = input.driverPath;
    if (typeof driver !== 'string' || !driver.startsWith('scripts/') || driver.split('/').includes('..') ||
        !Array.isArray(evidence.operationDriverSources) ||
        !evidence.operationDriverSources.some(item => item.path === path.join(repository, driver)))
      throw new Error('Name the exact separately operated scripts/ driver');
    const frozenBuilder = await git(repository, ['show', `${source[0].revision}:electron-builder.yml`]);
    if (!/^\s*-\s*["']?!scripts["']?\s*$/m.test(frozenBuilder)) throw new Error('Frozen application packaging does not exclude scripts/');
    const operationCommit = input.operationDriverCommit;
    await git(repository, ['merge-base', '--is-ancestor', source[0].revision, operationCommit]);
    const diff = await git(repository, ['diff', '--binary', source[0].revision, operationCommit, '--', driver], 'buffer');
    if (!diff.length || sha(diff) !== evidence.sourceRefs.bossDiffSha256) throw new Error('Operated driver diff differs from recorded operation-time dirty source');
    const driverBytes = await git(repository, ['show', `${operationCommit}:${driver}`], 'buffer');
    const driverEvidence = evidence.operationDriverSources.find(item => item.path === path.join(repository, driver));
    if (sha(driverBytes) !== driverEvidence.sha256) throw new Error('Operated driver bytes differ from evidence');
    const builds = iteration.checkpoints.filter(item => item.candidateId === candidateId && item.id === input.buildCheckpointId && item.status === 'success' && !item.invalidatedAt && sameSources(item.sourceRefs, source));
    const launches = iteration.checkpoints.filter(item => item.candidateId === candidateId && item.id === input.launchCheckpointId && item.status === 'success' && !item.invalidatedAt && sameSources(item.sourceRefs, source));
    if (!builds.some(item => item.finishedAt <= evidence.startedAt) || !launches.some(item => item.finishedAt <= evidence.startedAt))
      throw new Error('Frozen build and launch must precede the successful operation');
    const artifactNames = input.artifacts;
    if (!Array.isArray(artifactNames) || artifactNames.length !== 2) throw new Error('Bind the actual application archive and app.asar');
    const artifacts = [];
    for (const file of artifactNames) {
      const relative = path.relative(repository, path.resolve(file));
      const expected = provenance.artifacts?.[relative];
      if (!expected) throw new Error(`Artifact is absent from frozen build provenance: ${relative}`);
      artifacts.push(await artifact(file, expected));
    }
    if (!artifacts.some(item => item.path.endsWith('/app.asar') && item.sha256 === evidence.sourceRefs.appAsarSha256) ||
        !artifacts.some(item => item.path.endsWith('.dmg'))) throw new Error('Operation did not use the frozen application artifact');
    const currentSourceRefs = await captureSources(source.map(item => ({ repository: item.repository })), root);
    const record = {
      schemaVersion: 1, candidateId, iterationId: iteration.id, candidateManifestHash: candidate.manifestHash,
      candidateSourceRefs: source, operatedSource: { baseRevision: source[0].revision, driverPath: driver,
        dirtyDiffSha256: sha(diff), driverSha256: sha(driverBytes), capturedAt: evidence.startedAt },
      checkoutAtReconciliation: currentSourceRefs, checkoutAdvanced: !sameSources(currentSourceRefs, source),
      operationEvidence: { path: evidencePath, sha256: sha(evidenceBytes) },
      provenance: { path: provenancePath, sha256: sha(provenanceBytes) }, artifacts,
      buildCheckpointId: input.buildCheckpointId, launchCheckpointId: input.launchCheckpointId,
      authorityRef: input.authorityRef, reason: input.reason, recordedAt: now()
    };
    if (candidate.preservedSources?.length !== source.length) throw new Error('Frozen source snapshots are incomplete');
    for (const snapshot of candidate.preservedSources) await preserved(snapshot);
    const file = path.join(root, 'source-reconciliations', `${candidateId}-${sha(Buffer.from(JSON.stringify(record)))}.json`);
    await immutableJson(file, record);
    const saved = { ...record, path: file, sha256: sha(await fs.readFile(file)) };
    state.frozenSourceReconciliations ??= []; state.frozenSourceReconciliations.push(saved);
    state.commandResults[args.commandId] = saved;
    await saveEvent(root, state, 'candidate.frozen-source-reconciled', { candidateId, operationEvidence: record.operationEvidence });
    return saved;
  });
  return result;
}
