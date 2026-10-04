import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { withLock, loadState, saveEvent, atomicJson } from './storage.mjs';
import { dispatchEventHooks } from './hooks.mjs';
import { makeReport, optimize } from './report.mjs';
import { publishLearning } from './lifecycle.mjs';
import { evaluateOpportunities } from './opportunities.mjs';

const now = () => new Date().toISOString();
const find = (s, id) => s.iterations.find(i => i.id === id);

// Hooks and optional learning can perform network effects. Neither may hold the
// run mutex or save a snapshot captured before independent work was admitted.
export async function finishEffects(root, pending, commandId) {
  let state = await loadState(root);
  const iteration = find(state, pending.iterationId);
  if (iteration?.workEvent?.id !== pending.eventId) throw new Error('Finalization event no longer matches its iteration');
  const startedAt = now();
  const hooks = await dispatchEventHooks(root, iteration.workEvent, {
    kind: 'iteration', iterationId: iteration.id, eventId: iteration.workEvent.id
  });
  await withLock(root, async () => {
    state = await loadState(root);
    const current = find(state, iteration.id);
    if (current.workEvent.id !== pending.eventId) throw new Error('Work event changed while hooks ran');
    current.hookResults = hooks.results; current.hookBlocked = hooks.blocked;
    current.finalizedWorkEvents ??= [];
    if (!current.finalizedWorkEvents.includes(pending.eventId)) {
      current.spans.push({ id: randomUUID(), kind: 'hook', startedAt, finishedAt: now() });
      current.finishedAt = now(); current.status = 'finished';
      if (state.activeIterationId === current.id) state.activeIterationId = null;
      state.finalizedAttempts++; current.finalizedWorkEvents.push(pending.eventId);
      if (state.profile.reviewEvery && state.finalizedAttempts % state.profile.reviewEvery === 0) state.reviewDue = true;
    }
    if (current.workOutcome === 'success' && !current.hookBlocked && !current.deliveryCounted) {
      state.successfulDeliveries++; current.deliveryCounted = true; current.deliveryNumber = state.successfulDeliveries;
      evaluateOpportunities(state, { candidateId: current.candidateId });
    }
    const recommendation = optimize(state);
    if (recommendation && !state.recommendations?.some(r => r.iterationId === current.id)) {
      state.recommendations ??= [];
      // Duration and publication policy stay fixed; optimization is evidence,
      // not permission to change the operator's approved delivery contract.
      state.recommendations.push({ ...recommendation, iterationId: current.id, recordedAt: now(), applied: false });
    }
    await saveEvent(root, state, 'iteration.finalized', { iterationId: current.id, eventId: pending.eventId });
  });

  const learning = await learningEffect(root, state, find(state, iteration.id));
  return withLock(root, async () => {
    const fresh = await loadState(root), current = find(fresh, iteration.id);
    if (current.workEvent.id !== pending.eventId) throw new Error('Learning result belongs to an earlier work event');
    current.learningReceipt = learning;
    const result = { iteration: current, report: makeReport(fresh), commandId };
    fresh.commandResults[commandId] = structuredClone(result);
    await saveEvent(root, fresh, 'iteration.effects-recorded', { iterationId: current.id, eventId: pending.eventId });
    return result;
  });
}

async function learningEffect(root, state, iteration) {
  const directory = path.join(root, 'effects', 'learning');
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${iteration.workEvent.id}.json`);
  const owner = { pid: process.pid, hostname: os.hostname(), token: randomUUID() };
  try { await fs.writeFile(file, JSON.stringify({ status: 'running', owner, startedAt: now() }), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const prior = JSON.parse(await fs.readFile(file, 'utf8'));
    if (prior.result) return prior.result;
    return { status: 'unknown', reason: 'Prior learning effect lacks a terminal receipt; no automatic replay', receiptPath: file, reportPath: path.join(root,'reports',`${iteration.id}-${iteration.workEvent.id}.json`), workEventId: iteration.workEvent.id };
  }
  const result = await publishLearning(root, state, iteration, makeReport(state));
  await atomicJson(file, { status: 'finished', owner, result, finishedAt: now() });
  return result;
}

export async function publicationEffects(root,pending,commandId) {
  const state=await loadState(root), publication=state.publications.find(p=>p.id===pending.publicationId);
  if(!publication?.event) throw new Error('Publication hook event is missing');
  const hooks=await dispatchEventHooks(root,publication.event,{kind:'publication',publicationId:publication.id});
  return withLock(root,async()=>{
    const fresh=await loadState(root), current=fresh.publications.find(p=>p.id===publication.id);
    current.hookResults=hooks.results;current.hookBlocked=hooks.blocked;
    const {pendingPublicationEffects: ignored,...original}=pending;
    const result={...original,publication:current,commandId};
    fresh.commandResults[commandId]=structuredClone(result);
    await saveEvent(root,fresh,'publication.hooks-recorded',{publicationId:current.id});
    return result;
  });
}
