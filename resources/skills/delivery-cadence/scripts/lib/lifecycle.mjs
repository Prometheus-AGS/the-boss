import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicJson, saveEvent } from './storage.mjs';
import { createObligation } from './opportunities.mjs';
const exec = promisify(execFile);
export async function migrateState(root, state, input = {}) {
  if (state.schemaVersion === 3) return { schemaVersion: 3, migrated: false };
  if (![1, 2].includes(state.schemaVersion)) throw new Error('Unsupported cadence state version');
  if (input.oldMutatorsStopped !== true) throw new Error('Stop old cadence writers and confirm oldMutatorsStopped:true before explicit migration');
  const pending = state.iterations.flatMap(i => i.checkpoints ?? []).filter(c => ['running', 'unknown'].includes(c.status));
  if (pending.length) throw new Error('Reconcile legacy running/unknown checkpoint processes using the original CLI before migration');
  const from = state.schemaVersion;
  const directory = path.join(root, 'backups', `v${from}-${state.eventsSeq}-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  for (const file of ['events.jsonl', 'state.json']) await fs.copyFile(path.join(root, file), path.join(directory, file));
  try {
    await fs.copyFile(path.join(root, 'event-archives.json'), path.join(directory, 'event-archives.json'));
    await fs.cp(path.join(root, 'archives'), path.join(directory, 'archives'), { recursive: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of ['hooks', 'reports']) {
    try { await fs.cp(path.join(root, name), path.join(directory, name), { recursive: true, errorOnExist: true, force: false }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const previousSeq = state.eventsSeq;
  state.schemaVersion = 3; state.historicalChildren ??= [];
  for (const name of ['candidates', 'jobs', 'workAhead', 'obligations', 'releaseAttempts', 'opportunities', 'adoptedReceipts']) state[name] ??= [];
  state.commandSignatures ??= {}; state.commandResults ??= {};
  if (state.publicationDue) {
    const latest = [...state.iterations].reverse().find(i => i.workOutcome === 'success');
    const candidateId = `legacy-${latest?.id ?? state.runId}`;
    state.candidates.push({ id: candidateId, candidateId, iterationId: latest?.id ?? null,
      sourceRefs: structuredClone(latest?.sourceRefs ?? []), createdAt: null, legacy: true,
      contentManifestDigest: null, provenance: 'v2 path-bound receipts; portable source equality unknown' });
    const obligation = createObligation(state, state.candidates.at(-1), { dueAt: null,
      ordinal: state.nextPublicationDelivery ?? null, reasons: ['legacy-publication-debt'],
      policy: state.profile.publication, opportunityId: null });
    obligation.provenance = { type: 'legacy-publication-debt', sourceVersion: from, previousSeq };
    obligation.missing = ['reconcile-legacy-publication-evidence'];
  }
  state.publicationSchedule ??= { nextCount: state.publicationDue
    ? state.successfulDeliveries + state.profile.publication.every
    : state.nextPublicationDelivery ?? state.profile.publication.every,
    lastInterval: -1, policyDigest: createHash('sha256').update(JSON.stringify(state.profile.publication)).digest('hex') };
  // Historical iteration objects and receipts are not upgraded into new claims.
  state.migration = { from, to: 3, path: from === 1 ? [1, 2, 3] : [2, 3], backup: directory, previousSeq, at: new Date().toISOString() };
  await saveEvent(root, state, 'run.migrated', state.migration);
  return { schemaVersion: 3, migrated: true, backup: directory, legacyEvidence: 'preserved; missing observations remain unknown' };
}
export async function linkHistorical(state, input) {
  if (!input.phaseId || !input.reason || !input.evidencePath) throw new Error('Historical linking needs phaseId, reason and evidencePath');
  const file = path.resolve(input.evidencePath), bytes = await fs.readFile(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  state.historicalChildren ??= [];
  const prior = state.historicalChildren.find(c => c.phaseId === input.phaseId && c.evidence.sha256 === sha256);
  if (prior) return prior;
  const child = { id: randomUUID(), phaseId: input.phaseId, reason: input.reason,
    evidence: { path: file, sha256 }, recordedAt: new Date().toISOString(), timing: 'unknown',
    countedAsDelivery: false, countedCompletions: false, sourceRefs: input.sourceRefs ?? [] };
  state.historicalChildren.push(child); return child;
}
export async function publishLearning(root, state, iteration, report) {
  if (iteration.learningReceipt?.workEventId === iteration.workEvent.id) return iteration.learningReceipt;
  const file = path.join(root, 'reports', `${iteration.id}-${iteration.workEvent.id}.json`);
  await atomicJson(file, report);
  const config = state.profile.learning;
  let result = { status: 'degraded', reason: 'No optional learning recorder configured', reportPath: file };
  if (config?.command && Array.isArray(config.args) && config.cwd) {
    try {
      const output = await exec(config.command === 'node' ? process.execPath : config.command,
        config.args.map(a => a.replaceAll('{report}', file)), { cwd: config.cwd, shell: false, timeout: 20000, maxBuffer: 1024 * 1024 });
      result = { ...JSON.parse(output.stdout.trim()), reportPath: file };
    } catch (error) { result = { status: 'degraded', reason: error.code ?? 'recorder-failed', reportPath: file }; }
  }
  result.workEventId = iteration.workEvent.id;
  return result;
}
