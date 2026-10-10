import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Completed-boundary real CLI operation; original state/evidence remain read-only.
const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, all) =>
  value.startsWith('--') ? [...items, [value.slice(2), all[index + 1]]] : items, []));
if (!args['source-root'] || !args.input) throw new Error('Usage: node operate-historical-publication.mjs --source-root <existing-state> --input <reviewed-packet> [--cli <cadence.mjs>]');
const source = path.resolve(args['source-root']), cli = path.resolve(args.cli ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'cadence.mjs'));
const packet = JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8'));
if (packet.mappings?.length < 2) throw new Error('Exercise needs at least two independently owed obligations for the same release');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-historical-operation-'));
const root = path.join(directory, 'state'); fs.mkdirSync(root);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const before = {};
for (const name of ['state.json', 'events.jsonl', 'event-archives.json', 'archives']) {
  const original = path.join(source, name);
  if (!fs.existsSync(original)) continue;
  if (fs.statSync(original).isFile()) before[name] = sha(fs.readFileSync(original));
  fs.cpSync(original, path.join(root, name), { recursive: true });
}
const read = () => JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
const initial = read();
const preserved = state => JSON.stringify({ startedAt: state.startedAt, successfulDeliveries: state.successfulDeliveries,
  finalizedAttempts: state.finalizedAttempts, nextPublicationDelivery: state.nextPublicationDelivery,
  profile: state.profile, activeIterationId: state.activeIterationId, iterations: state.iterations, candidates: state.candidates,
  releaseAttempts: state.releaseAttempts, publications: state.publications, installedAcceptance: state.installedAcceptance,
  jobs: state.jobs, opportunities: state.opportunities, workAhead: state.workAhead });
const invariants = preserved(initial), results = [];
function run(label, input, commandId, errorPattern) {
  const file = path.join(directory, label + '.json'); fs.writeFileSync(file, JSON.stringify(input, null, 2) + '\n');
  const operation = spawnSync(process.execPath, [cli, 'publication', 'adopt-historical', '--root', root, '--input', file, '--command-id', commandId],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (operation.error) throw operation.error;
  if (errorPattern) {
    if (operation.status === 0 || !errorPattern.test(operation.stderr)) throw new Error(label + ' did not refuse as required: ' + operation.stderr);
  } else if (operation.status !== 0) throw new Error(label + ' failed: ' + operation.stderr);
  if (preserved(read()) !== invariants) throw new Error(label + ' changed original delivery clocks, counters, source, dispatch, hook or acceptance records');
  results.push({ operation: label, exitCode: operation.status, refused: !!errorPattern });
  return operation.stdout ? JSON.parse(operation.stdout) : null;
}
const request = mappings => {
  const value = structuredClone(packet); delete value.expectedRevision;
  value.mappings = mappings;
  value.expectedPredecessor = read().publishedTargets?.[value.release.targetId] ?? null;
  return value;
};
const first = request([packet.mappings[0]]);
run('first-debt', first, 'historical-operation-first');
run('first-debt-replay', first, 'historical-operation-first');
const second = request(packet.mappings.slice(1));
run('second-debt-same-release', second, 'historical-operation-second');
const adopted = read();
if ((adopted.externalReleases ?? []).filter(r => r.id === packet.release.id).length !== 1) throw new Error('External release was duplicated');
for (const mapping of packet.mappings) {
  if (!(adopted.publicationLinks ?? []).some(link => link.externalReleaseId === packet.release.id && link.obligationId === mapping.obligationId)) throw new Error('Second debt was skipped by release deduplication');
  const original = initial.obligations.find(o => o.id === mapping.obligationId), actual = adopted.obligations.find(o => o.id === mapping.obligationId);
  if (actual.disposition !== 'fulfilled') throw new Error('Mapped debt was not fulfilled');
  for (const key of ['candidateId', 'iterationId', 'contentManifestDigest', 'dueAt', 'createdAt', 'dueOrdinal', 'coveredScopes', 'attemptIds', 'receiptIds']) {
    if (JSON.stringify(original[key]) !== JSON.stringify(actual[key])) throw new Error('Original debt identity/history changed: ' + key);
  }
}
function amended(ref, name, change) {
  const document = JSON.parse(fs.readFileSync(ref.path, 'utf8')); change(document);
  const bytes = Buffer.from(JSON.stringify(document, null, 2) + '\n'), file = path.join(directory, name + '-evidence.json');
  fs.writeFileSync(file, bytes); return { path: file, sha256: sha(bytes) };
}
const mismatch = request([packet.mappings[0]]);
mismatch.release.evidence.source = amended(mismatch.release.evidence.source, 'mismatched-source', doc => { doc.sourceRefs[0].revision = '0'.repeat(40); });
run('mismatched-source', mismatch, 'historical-operation-mismatch', /source identity mismatch/);
const incomplete = request([packet.mappings[0]]);
incomplete.mappings[0] = structuredClone(incomplete.mappings[0]);
incomplete.mappings[0].evidence = amended(incomplete.mappings[0].evidence, 'missing-scope', doc => { doc.coverage = []; });
run('missing-scope', incomplete, 'historical-operation-incomplete', /scope evidence needs per-scope coverage/);
const conflict = request([packet.mappings[0]]);
conflict.release.evidence.feature = amended(conflict.release.evidence.feature, 'conflicting-release', doc => { doc.outcome += ' changed after import'; });
run('conflicting-release', conflict, 'historical-operation-conflict', /Immutable historical release ID changed content/);
const backwards = request([packet.mappings[0]]), parts = backwards.release.version.split('.').map(Number);
if (parts[2] < 1) throw new Error('Exercise packet needs a nonzero patch version for backwards ordering control');
parts[2]--; backwards.release.version = parts.join('.'); backwards.release.id += '-backwards';
for (const kind of ['source', 'build', 'launch', 'feature', 'metadata', 'website']) {
  backwards.release.evidence[kind] = amended(backwards.release.evidence[kind], 'backwards-' + kind, doc => {
    doc.releaseVersion = backwards.release.version;
    for (const link of doc.links ?? []) link.version = backwards.release.version;
  });
}
backwards.release.evidence.platforms = backwards.release.evidence.platforms.map((ref, index) => amended(ref, 'backwards-platform-' + index, doc => { doc.releaseVersion = backwards.release.version; }));
backwards.mappings = backwards.mappings.map((mapping, index) => ({ ...mapping, evidence: amended(mapping.evidence, 'backwards-scope-' + index, doc => { doc.releaseVersion = backwards.release.version; }) }));
run('backwards-target', backwards, 'historical-operation-backwards', /Cannot move a published target backwards/);
const changedHash = request([packet.mappings[0]]); changedHash.release.evidence.source.sha256 = '0'.repeat(64);
run('altered-evidence-hash', changedHash, 'historical-operation-hash', /bytes differ from the supplied SHA-256/);
for (const [name, digest] of Object.entries(before)) if (sha(fs.readFileSync(path.join(source, name))) !== digest) throw new Error('Original state changed during disposable operation: ' + name);
const status = spawnSync(process.execPath, [cli, 'publication', 'status', '--root', root], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
if (status.status !== 0) throw new Error(status.stderr);
const publication = JSON.parse(status.stdout);
for (const mapping of packet.mappings) if (publication.obligations.find(o => o.id === mapping.obligationId)?.missing.length) throw new Error('Publication status did not resolve linked debt');
const report = { schemaVersion: 1, kind: 'historical-publication-cli-operation', sourceRoot: source, disposableRoot: root,
  cli, releaseId: packet.release.id, results, successfulDeliveries: read().successfulDeliveries,
  sourceStateUnchanged: true, deliveryAndAcceptanceRecordsUnchanged: true, externalEffectsDispatched: false,
  recordedAt: new Date().toISOString() };
fs.writeFileSync(path.join(directory, 'operation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, evidencePath: path.join(directory, 'operation.json') }, null, 2));
