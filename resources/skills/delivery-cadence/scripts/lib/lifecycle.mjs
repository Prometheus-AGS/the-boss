import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicJson, saveEvent } from './storage.mjs';
const exec = promisify(execFile);
export async function migrateState(root, state) {
  if (state.schemaVersion === 2) return { schemaVersion: 2, migrated: false };
  if (state.schemaVersion !== 1) throw new Error('Unsupported cadence state version');
  const directory = path.join(root, 'backups', `v1-${state.eventsSeq}-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  for (const file of ['events.jsonl', 'state.json']) await fs.copyFile(path.join(root, file), path.join(directory, file));
  const previousSeq = state.eventsSeq;
  state.schemaVersion = 2; state.historicalChildren ??= [];
  // Historical iteration objects and receipts are not upgraded into new claims.
  state.migration = { from: 1, to: 2, backup: directory, previousSeq, at: new Date().toISOString() };
  await saveEvent(root, state, 'run.migrated', state.migration);
  return { schemaVersion: 2, migrated: true, backup: directory };
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
  result.workEventId = iteration.workEvent.id; iteration.learningReceipt = result;
  await saveEvent(root, state, 'iteration.learning-recorded', { iterationId: iteration.id, result });
  return result;
}
