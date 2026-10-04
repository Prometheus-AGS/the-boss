import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { withLock, loadState, saveEvent } from './storage.mjs';
import { immutableJson } from './jobs.mjs';
import { digest } from './pipeline-data.mjs';
import { runCommand, minimalEnvironment } from './process.mjs';
import { handlePublication } from './publication.mjs';

const now = () => new Date().toISOString();
const read = async file => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
function identity(value) {
  const keys = ['repository', 'workflow', 'runId', 'jobId', 'url', 'id'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Missing remote identity');
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!keys.includes(key) || !['string', 'number'].includes(typeof item) || !String(item).trim()) throw new Error('Invalid remote identity');
    result[key] = item;
  }
  if (!Object.keys(result).length) throw new Error('Empty remote identity');
  return result;
}
function ownerAlive(owner) {
  if (owner?.hostname !== os.hostname()) return true;
  try { process.kill(owner.pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

/** The intent already exists. Execute only once, outside the run mutex. */
export async function dispatchPublication(root, pending, commandId) {
  if (!pending?.dispatch || pending.attempt?.state === 'capability-blocked') return pending;
  const attempt = pending.attempt;
  const dispatch = pending.dispatch;
  const requestDigest = digest(dispatch);
  const directory = path.join(root, 'effects', 'publication', createHash('sha256').update(attempt.id).digest('hex'));
  const claimPath = path.join(directory, 'claim.json');
  const resultPath = path.join(directory, 'result.json');
  const requestPath = path.join(directory, 'request.json');
  const current = await withLock(root, async () => {
    const state = await loadState(root);
    const item = state.releaseAttempts?.find(value => value.id === attempt.id);
    if (!item || item.correlationId !== attempt.correlationId || digest(item.dispatchRequest) !== requestDigest) throw new Error('Publication intent changed before dispatch');
    return structuredClone(item);
  });
  if (!['intent', 'unknown'].includes(current.state)) return { attempt: current, dispatched: current.state === 'dispatched', recovered: true };
  let receipt = await read(resultPath);
  if (!receipt && current.state === 'unknown' && !await read(claimPath)) return { attempt: current, dispatched: false, reason: 'Unknown prior dispatch has no local claim; reconcile remote identity before any retry' };
  if (!receipt) {
    const owner = { pid: process.pid, hostname: os.hostname(), token: randomUUID() };
    try {
      await immutableJson(claimPath, { schemaVersion: 1, attemptId: attempt.id, correlationId: attempt.correlationId, requestDigest, owner, claimedAt: now() });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const claim = await read(claimPath);
      if (!claim || claim.requestDigest !== requestDigest || claim.correlationId !== attempt.correlationId) throw new Error('Publication claim is incomplete or conflicts; inspect it before recovery');
      receipt = await read(resultPath);
      if (!receipt && ownerAlive(claim.owner)) return { attempt: current, dispatched: false, pending: true, reason: 'Publication dispatch owner is still active; no duplicate execution' };
      if (!receipt) return reconcile(root, attempt, commandId, {
        schemaVersion: 1, attemptId: attempt.id, correlationId: attempt.correlationId, requestDigest,
        outcome: 'unknown', reason: 'Prior dispatch has no terminal acknowledgement; reconcile the remote effect before retry', evidenceRef: claimPath
      });
    }
    if (!receipt) {
      // Private input and result files are distinct; the consumer may read but never rewrite the claim.
      await immutableJson(requestPath, dispatch.request);
      let spawned = false;
      receipt = { schemaVersion: 1, attemptId: attempt.id, correlationId: attempt.correlationId, requestDigest,
        startedAt: now(), outcome: 'unknown', evidenceRef: resultPath };
      try {
        if (!/^node(?:\.exe)?$/i.test(path.basename(dispatch.command))) throw new Error('Consumer must use a configured Node executable');
        if (!dispatch.args.includes('{request}')) throw new Error('Consumer args require a literal {request} argument');
        const args = dispatch.args.map(arg => arg === '{request}' ? requestPath : arg);
        const result = await runCommand({ command: dispatch.command, args, timeoutMs: dispatch.timeoutMs ?? 30000 }, {
          cwd: dispatch.cwd, env: minimalEnvironment(dispatch.secretEnv ?? []), onSpawn: () => { spawned = true; }
        });
        receipt.startedAt = result.startedAt; receipt.finishedAt = result.finishedAt;
        receipt.processStopped = result.processStopped;
        if (result.status !== 'success') {
          receipt.outcome = spawned ? 'unknown' : 'failed-before-dispatch';
          receipt.reason = spawned ? 'Consumer exited without a successful dispatch acknowledgement; remote effects are unknown' : 'Consumer could not be launched';
        } else {
          const ack = JSON.parse(result.stdout);
          if (ack.schemaVersion !== 1 || ack.attemptId !== attempt.id || ack.correlationId !== attempt.correlationId || ack.status !== 'dispatched') throw new Error('Acknowledgement identity mismatch');
          receipt.externalIdentity = identity(ack.externalIdentity); receipt.outcome = 'dispatched';
        }
      } catch {
        receipt.outcome = spawned ? 'unknown' : 'failed-before-dispatch';
        receipt.reason = spawned ? 'Dispatch acknowledgement invalid or lost; do not redispatch blindly' : 'Dispatch preparation failed before process launch';
      }
      receipt.finishedAt ??= now();
      await immutableJson(resultPath, receipt);
    }
  }
  if (receipt.requestDigest !== requestDigest || receipt.attemptId !== attempt.id || receipt.correlationId !== attempt.correlationId) throw new Error('Publication result does not match its frozen intent');
  return reconcile(root, attempt, commandId, receipt);
}

async function reconcile(root, attempt, commandId, receipt) {
  return withLock(root, async () => {
    const state = await loadState(root);
    const current = state.releaseAttempts?.find(value => value.id === attempt.id);
    if (!current || current.correlationId !== attempt.correlationId) throw new Error('Publication result correlation changed');
    const receiptDigest = digest(receipt);
    if (current.dispatchReceiptDigest && current.dispatchReceiptDigest !== receiptDigest) throw new Error('Immutable publication dispatch receipt changed');
    if (['intent', 'unknown'].includes(current.state)) {
      handlePublication(state, 'dispatch-result', { ...receipt, obligationId: attempt.obligationId });
      if (receipt.finishedAt) current.dispatchReceiptDigest = receiptDigest;
      current.dispatchReceiptPath = receipt.evidenceRef;
    }
    const result = { attempt: structuredClone(current), dispatched: current.state === 'dispatched', publicationComplete: false };
    state.commandResults ??= {}; state.commandResults[commandId] = result;
    await saveEvent(root, state, 'publication.dispatch-recorded', { attemptId: current.id, outcome: current.state });
    return result;
  });
}
