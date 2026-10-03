import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { withLock, loadState, saveEvent, atomicJson } from './storage.mjs';
import { releaseResources, findResourceClaims } from './resources.mjs';

export const now = () => new Date().toISOString();
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
export const attemptDirectory = (root, id) => {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid attempt identity');
  return path.join(root, 'attempts', id);
};
export async function immutableJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
}
export function claimCommand(state, command, input, args) {
  if (state.schemaVersion !== 3) throw new Error('Migrate to state v3 before pipeline operations');
  args.commandId ??= randomUUID();
  const signature = digest({ command, input });
  state.commandSignatures ??= {}; state.commandResults ??= {};
  if (state.commandSignatures[args.commandId] && state.commandSignatures[args.commandId] !== signature) throw new Error('command-id was already used for different input');
  if (input.runId && input.runId !== state.runId) throw new Error('Request runId does not match this run');
  if (!state.commandSignatures[args.commandId] && input.expectedRevision !== undefined && input.expectedRevision !== state.eventsSeq) throw new Error('Stale expectedRevision; reload status before mutation');
  state.commandSignatures[args.commandId] = signature;
  return state.commandResults[args.commandId];
}
export async function jobTransaction(root, action) {
  return withLock(root, async () => { const state = await loadState(root); return action(state); });
}
export async function reconcileJob(root, attemptId) {
  const directory = attemptDirectory(root, attemptId);
  let result;
  try { result = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const reconciled = await jobTransaction(root, async state => {
    const job = state.jobs?.find(j => j.id === attemptId); if (!job) throw new Error('Unknown job');
    if (!job.resourceClaims?.length) job.resourceClaims = await findResourceClaims(job.operationToken, job.registry);
    if (!result) return job;
    if (result.operationToken !== job.operationToken || result.candidateId !== job.candidateId) throw new Error('Attempt result ownership/source mismatch');
    if (job.resultDigest && job.resultDigest !== digest(result)) throw new Error('Immutable attempt result changed');
    if (!job.resultDigest) {
      job.state = result.status === 'success' ? 'succeeded' : result.status === 'timeout' ? 'failed' : result.status;
      job.finishedAt = result.finishedAt; job.resultDigest = digest(result); job.resultPath = path.join(directory, 'result.json');
      const iteration = state.iterations.find(i => i.id === job.iterationId);
      const receipt = iteration?.checkpoints.find(r => r.attemptId === job.id);
      if (receipt) Object.assign(receipt, result, { attemptId: job.id });
      if (iteration && iteration.candidateId === job.candidateId) iteration.status = result.status === 'success' ? 'ready' : 'checkpoint-failed';
      state.commandResults[job.commandId] = structuredClone(receipt ?? job);
      await saveEvent(root, state, 'job.reconciled', { attemptId, resultDigest: job.resultDigest });
    }
    return structuredClone(job);
  });
  if (result && result.processStopped === true) await releaseResources(reconciled.resourceClaims ?? [], reconciled.operationToken);
  return reconciled;
}
export async function dispatchJob(root, action, input = {}, args = {}) {
  const id = input.attemptId ?? input.id;
  if (action === 'status') {
    const state = await loadState(root); return id ? state.jobs?.find(j => j.id === id) ?? null : { jobs: state.jobs ?? [] };
  }
  if (!id) throw new Error('Job command requires attemptId');
  if (action === 'reconcile') {
    const known = await jobTransaction(root, async state => {
      const prior = claimCommand(state, 'job:reconcile', input, args); if (prior) return prior;
      await saveEvent(root, state, 'job.reconciliation-claimed', { attemptId: id, commandId: args.commandId }); return null;
    });
    if (known) return known;
    await reconcileJob(root, id);
    return jobTransaction(root, async state => {
      const prior = claimCommand(state, 'job:reconcile', input, args); if (prior) return prior;
      const job = state.jobs.find(j => j.id === id);
      if ((!job.resultDigest || job.state === 'unknown') && input.processStopped === true) {
        if (!input.evidencePath) throw new Error('Stopped-process reconciliation requires recorded evidence');
        if (job.owner?.hostname === os.hostname()) {
          let alive = false;
          try { process.kill(job.owner.pid, 0); alive = true; } catch (error) { if (error.code !== 'ESRCH') alive = true; }
          if (alive) throw new Error('Original execution owner is still alive; use cancellation and await its result');
        } else throw new Error('Recovery must run on the execution owner host');
        job.resourceClaims = await findResourceClaims(job.operationToken, job.registry);

        const bytes = await fs.readFile(path.resolve(input.evidencePath));
        const evidence = JSON.parse(bytes);
        if (evidence.attemptId !== id || evidence.operationToken !== job.operationToken || evidence.processStopped !== true) throw new Error('Recovery evidence must identify attempt/token and stopped process tree');
        job.state = 'failed'; job.recovery = { path: path.resolve(input.evidencePath), sha256: createHash('sha256').update(bytes).digest('hex'), at: now() };
        await releaseResources(job.resourceClaims ?? [], job.operationToken);
        const iteration = state.iterations.find(i => i.id === job.iterationId), receipt = iteration?.checkpoints.find(r => r.attemptId === id);
        if (receipt) Object.assign(receipt, { status: 'failed', recovery: job.recovery, reason: 'Interrupted effect reconciled as stopped; fresh receipt required' });
        if (iteration) iteration.status = 'checkpoint-failed';
      } else if (!job.resultDigest) {
        // A live PID, including a recycled PID, never proves ownership. Do not signal it.
        let alive = job.owner?.hostname !== os.hostname();
        if (!alive) { try { process.kill(job.owner.pid, 0); alive = true; } catch (e) { if (e.code !== 'ESRCH') alive = true; } }
        if (!alive) job.state = 'unknown';
      }
      state.commandResults[args.commandId] = structuredClone(job);
      await saveEvent(root, state, 'job.recovery-recorded', { attemptId: id }); return job;
    });
  }
  if (action !== 'cancel') throw new Error('Use job status|reconcile|cancel');
  return jobTransaction(root, async state => {
    const prior = claimCommand(state, 'job:cancel', input, args); if (prior) return prior;
    const job = state.jobs?.find(j => j.id === id); if (!job) throw new Error('Unknown job');
    if (!['succeeded', 'failed', 'cancelled'].includes(job.state)) {
      await atomicJson(path.join(attemptDirectory(root, id), 'cancel.json'), { attemptId: id, operationToken: job.operationToken, requestedAt: now() });
      job.state = 'cancelRequested';
    }
    state.commandResults[args.commandId] = structuredClone(job);
    await saveEvent(root, state, 'job.cancellation-requested', { attemptId: id }); return job;
  });
}

export { dispatchCheckpoint } from './checkpoints.mjs';
