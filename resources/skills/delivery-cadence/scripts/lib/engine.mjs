import { randomUUID, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_PROFILE, mergeProfile, normalizedScope, budgetReason } from './profile.mjs';
import { withLock, loadState, saveEvent } from './storage.mjs';
import { captureSources, sameSources, runCheckpoint, artifactReceipts, publicationReceipt } from './checkpoints.mjs';
import { runHooks, handleHooksCommand } from './hooks.mjs';
import { makeReport, optimize } from './report.mjs';
import { handleChild, childStatus, reconcileChildren, assertChildrenResolved, canonicalSnapshot, evidenceFile } from './children.mjs';
import { handleActivity } from './activity.mjs';
import { validateFeatureOperation, validateDelivery, publicationStatus } from './delivery-contract.mjs';
import { migrateState, linkHistorical, publishLearning } from './lifecycle.mjs';

const now = () => new Date().toISOString();
const fail = (message) => { throw new Error(message); };
const current = (state, id) => state.iterations.find((item) => item.id === (id ?? state.activeIterationId))
  ?? fail('No active iteration; start one or name iterationId');
const counts = (value = {}) => Object.fromEntries(['tasks', 'changes', 'phases'].map((key) => {
  const values = value[key] ?? [];
  if (!Array.isArray(values) || values.some((item) => typeof item !== 'string')) fail(`completion.${key} must contain canonical string IDs`);
  return [key, [...new Set(values)]];
}));

function checkpointContract(profile) {
  for (const kind of ['build', 'run']) {
    if (!profile.checkpoints.some((step) => step.kind === kind && step.required !== false)) fail(`Configure a required ${kind} checkpoint before delivering`);
  }
}

function admission(state, correction) {
  if (state.activeIterationId) fail('Finish or repair the current iteration before starting another');
  const reason = budgetReason(state); if (reason) fail(reason);
  const last = state.iterations.at(-1);
  if (last && last.workOutcome !== 'success') fail('Repair the previous failed delivery with ready before admitting new work');
  if (last?.hookBlocked) fail('Required hook failed; reconcile or retry it and resume before new work');
  if (state.reviewDue) fail('Human review is due; record review acknowledgement before new work');
  if (state.publicationDue && !correction) fail('Scheduled publication is due; finish its build/upload/site procedure before new work');
}

function envelope(state, iteration, type, outcome) {
  return { schemaVersion: 1, id: randomUUID(), type, runId: state.runId,
    iterationId: iteration.id, iterationIndex: iteration.index, outcome, occurredAt: now(),
    sourceRefs: iteration.sourceRefs, scope: iteration.scope, completion: iteration.completion,
    artifacts: iteration.artifacts ?? [], metrics: { elapsedMs: Date.now() - Date.parse(iteration.startedAt) } };
}

async function finalize(root, state, iteration) {
  const hooksStartedAt = now();
  const hookResult = await runHooks(root, iteration.workEvent);
  iteration.spans.push({ id: randomUUID(), kind: 'hook', startedAt: hooksStartedAt, finishedAt: now() });
  iteration.hookResults = hookResult.results; iteration.hookBlocked = hookResult.blocked;
  iteration.finalizedWorkEvents ??= [];
  if (!iteration.finalizedWorkEvents.includes(iteration.workEvent.id)) {
    iteration.finishedAt = now(); iteration.status = 'finished';
    state.activeIterationId = null; state.finalizedAttempts++;
    iteration.finalizedWorkEvents.push(iteration.workEvent.id);
    if (state.profile.reviewEvery && state.finalizedAttempts % state.profile.reviewEvery === 0) state.reviewDue = true;
  }
  if (iteration.workOutcome === 'success' && !iteration.hookBlocked && !iteration.deliveryCounted) {
    state.successfulDeliveries++; iteration.deliveryCounted = true; iteration.deliveryNumber = state.successfulDeliveries;
    if (state.profile.publication.mode === 'every' && state.successfulDeliveries >= state.nextPublicationDelivery) state.publicationDue = true;
  }
  const recommendation = optimize(state);
  if (recommendation) {
    state.recommendations ??= [];
    const existing = state.recommendations.some((item) => item.iterationId === iteration.id);
    if (!existing) {
      const record = { ...recommendation, iterationId: iteration.id, recordedAt: now(), applied: false };
      if (state.profile.optimization.mode === 'automatic') {
        const mapping = { iterationMinutes: ['iterationMinutes'], publicationEvery: ['publication', 'every'], maxImplementers: ['team', 'maxImplementers'] };
        const keys = mapping[recommendation.setting];
        const range = state.profile.optimization.bounds[recommendation.setting];
        if (keys && range && recommendation.value >= range[0] && recommendation.value <= range[1]) {
          const patch = keys.length === 1 ? { [keys[0]]: recommendation.value } : { [keys[0]]: { [keys[1]]: recommendation.value } };
          state.profile = mergeProfile(state.profile, patch); state.profileRevision++; record.applied = true;
        }
      }
      state.recommendations.push(record);
    }
  }
  await saveEvent(root, state, 'iteration.finalized', { iterationId: iteration.id });
  await publishLearning(root, state, iteration, makeReport(state));
  return { iteration, report: makeReport(state) };
}

async function execute(root, state, command, input, args) {
  state.storageRoot = root;
  switch (command) {
    case 'migrate': return migrateState(root, state);
    case 'history': return linkHistorical(state, input);
    case 'child': return handleChild(state, current(state, input.iterationId), args._?.[1] ?? input.action, input);
    case 'activity': return handleActivity(current(state, input.iterationId), args._?.[1] ?? input.action, input);
    case 'configure': {
      if (state.activeIterationId) fail('Configure profiles between iterations; current checkpoint contracts are frozen');
      const previous = state.profile;
      state.profile = mergeProfile(previous, input.profile ?? input);
      state.profileRevision++;
      if (previous.publication.mode !== 'every' && state.profile.publication.mode === 'every') {
        state.nextPublicationDelivery = state.successfulDeliveries + state.profile.publication.every;
      }
      return { profile: state.profile, profileRevision: state.profileRevision };
    }
    case 'start': {
      let correction = null;
      if (input.correction) {
        const receipt = await evidenceFile(input.correction.evidencePath);
        const prior = state.iterations.find(i => i.id === input.correction.iterationId);
        if (!prior || receipt.document.iterationId !== prior.id || receipt.document.status !== 'failed' || !receipt.document.operation) fail('Corrective admission needs a prior delivery and observed failed-operation evidence');
        correction = { iterationId: prior.id, operation: receipt.document.operation, reason: input.correction.reason, evidence: {path: receipt.path, sha256: receipt.sha256} };
        if (!correction.reason) fail('Corrective scope needs an explicit reason');
      }
      admission(state, correction); checkpointContract(state.profile);
      const scope = normalizedScope(input.scope);
      const featureOperation = validateFeatureOperation(input.featureOperation, scope);
      const checkpointMap = new Map(state.profile.checkpoints.map(step => [step.id, step]));
      for (const step of input.checkpoints ?? []) {
        if (step.kind !== 'run' || checkpointMap.get(step.id)?.kind === 'build') fail('Per-iteration overrides add or replace run procedures only; configure build contracts between iterations');
        checkpointMap.set(step.id, step);
      }
      const profile = mergeProfile(state.profile, { checkpoints: [...checkpointMap.values()] });
      checkpointContract(profile);
      if (!profile.checkpoints.some(c => c.id === featureOperation.checkpointId && c.kind === 'run')) fail('Feature operation must name a configured run checkpoint');
      const canonical = await canonicalSnapshot(state, input.canonical);
      const sourceRefs = await captureSources(input.sourceRefs, root);
      const iteration = { id: randomUUID(), index: state.iterations.length + 1, status: 'implementing',
        startedAt: now(), contractVersion: 2, phaseId: canonical?.phaseId ?? input.phaseId ?? state.profile.binding?.phaseId ?? 'standalone', profileRevision: state.profileRevision, profile, scope, featureOperation, correction, children: [], childStack: [], completionEvents: [],
        baselineRefs: sourceRefs, sourceRefs, checkpoints: [], spans: [], completion: counts(), workReceipts: [] };
      state.iterations.push(iteration); state.activeIterationId = iteration.id;
      return iteration;
    }
    case 'ready': {
      if (input.iterationId && state.activeIterationId && input.iterationId !== state.activeIterationId) fail('Finish the active iteration before repairing another');
      let iteration = state.activeIterationId ? current(state, input.iterationId) : state.iterations.at(-1);
      if (!iteration || iteration.workOutcome === 'success') fail('Start a new iteration before ready');
      if (state.profile.mode === 'kbd') await reconcileChildren(state, iteration, input);
      assertChildrenResolved(iteration);
      if (input.codeComplete !== true) fail('ready requires codeComplete:true after the complete planned production increment');
      if (iteration.hookBlocked) fail('Resolve required notification hooks before repairing delivery');
      const reason = budgetReason({ ...state, activeIterationId: iteration.id }); if (reason) fail(reason);
      checkpointContract(iteration.profile);
      const previousSources = iteration.sourceRefs;
      iteration.sourceRefs = await captureSources(input.sourceRefs ?? iteration.sourceRefs.map(({ repository }) => ({ repository })), root);
      if (!sameSources(previousSources, iteration.sourceRefs)) for (const receipt of iteration.checkpoints) {
        if (!receipt.invalidatedAt) { receipt.invalidatedAt = now(); receipt.invalidationReason = 'Release inputs changed before ready'; }
      }
      if (iteration.workEvent) {
        iteration.workReceipts.push({ event: iteration.workEvent, hookResults: iteration.hookResults, finishedAt: iteration.finishedAt });
        delete iteration.workEvent; delete iteration.workOutcome; delete iteration.finishedAt;
      }
      iteration.readyAt = now(); iteration.status = 'ready'; state.activeIterationId = iteration.id;
      return iteration;
    }
    case 'checkpoint': {
      assertChildrenResolved(current(state, input.iterationId));
      const reason = budgetReason(state); if (reason) fail(reason);
      return runCheckpoint(root, state, current(state, input.iterationId), input, args.commandId);
    }
    case 'observe': {
      const iteration = current(state, input.iterationId);
      if (input.reopened) {
        const reopened = counts(input.reopened);
        iteration.reopened ??= [];
        for (const [kind, ids] of Object.entries(reopened)) {
          for (const id of ids) { const recordedAt = now(); iteration.reopened.push({ kind, id, recordedAt, source: input.source ?? null }); iteration.completionEvents ??= []; iteration.completionEvents.push({ kind, id, action: 'reopen', occurredAt: recordedAt, source: input.source ?? null }); }
        }
        return { reopened: iteration.reopened };
      }
      const kinds = ['implementation', 'planning', 'build', 'run', 'rework', 'coordination', 'resource-wait', 'human-wait', 'hook', 'publication'];
      if (!kinds.includes(input.kind)) fail('Unknown observation kind');
      const start = Date.parse(input.startedAt), end = Date.parse(input.finishedAt);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) fail('Observation needs ordered startedAt and finishedAt');
      const span = { id: randomUUID(), kind: input.kind, startedAt: input.startedAt, finishedAt: input.finishedAt, ...(input.note ? { note: input.note } : {}) };
      iteration.spans.push(span); return span;
    }
    case 'finish': {
      const iteration = current(state, input.iterationId);
      if (iteration.workEvent) return finalize(root, state, iteration);
      const outcome = input.outcome ?? 'success';
      if (!['success', 'failed', 'cancelled'].includes(outcome)) fail('Unknown outcome');
      if (outcome === 'success') {
        if (state.profile.mode === 'kbd') await reconcileChildren(state, iteration, input);
        assertChildrenResolved(iteration);
        if ((iteration.activities ?? []).some(a => !a.finishedAt)) fail('Stop open activities before successful finish');
        validateDelivery(iteration);
        const reason = budgetReason(state); if (reason) fail(reason);
        if (iteration.status !== 'ready') fail('A completed build and runnable increment is required');
        if (!sameSources(await captureSources(iteration.sourceRefs, root), iteration.sourceRefs)) fail('Sources changed since ready; rebuild before delivery');
        const missing = iteration.profile.checkpoints.filter((step) => {
          if (step.required === false) return false;
          const receipt = iteration.checkpoints.filter((item) => item.id === step.id).at(-1);
          return !receipt || receipt.status !== 'success' || !sameSources(receipt.sourceRefs, iteration.sourceRefs);
        });
        if (missing.length) fail(`Required build/run receipts missing: ${missing.map((step) => step.id).join(', ')}`);
      }
      iteration.completion = counts(input.completion);
      for (const key of ['tasks', 'changes', 'phases']) {
        if (iteration.completion[key].some((id) => !iteration.scope[key].includes(id))) fail(`Completed ${key} must belong to the selected scope`);
      }
      if (state.profile.mode !== 'standalone' && Object.values(iteration.completion).some((ids) => ids.length) && !input.canonicalEvidence) {
        fail('KBD/goal completion counts require canonicalEvidence pointing to the supported ledger export; cadence never marks tasks complete');
      }
      iteration.canonicalEvidence = null;
      if (input.canonicalEvidence) {
        const evidencePath = path.resolve(input.canonicalEvidence);
        const evidenceText = await fs.readFile(evidencePath, 'utf8');
        const evidence = JSON.parse(evidenceText);
        const done = counts(evidence.completion ?? evidence);
        for (const key of ['tasks', 'changes', 'phases']) {
          if (iteration.completion[key].some((id) => !done[key].includes(id))) fail(`Canonical evidence does not confirm completed ${key}`);
        }
        iteration.canonicalEvidence = { path: evidencePath, sha256: createHash('sha256').update(evidenceText).digest('hex'), source: evidence.source ?? null };
      }
      iteration.completionEvents ??= [];
      for (const [kind, ids] of Object.entries(iteration.completion)) for (const id of ids) {
        iteration.completionEvents.push({ kind, id, action: 'complete', occurredAt: now(), source: iteration.canonicalEvidence?.path ?? 'standalone' });
      }
      iteration.artifacts = await artifactReceipts(input.artifacts ?? []);
      iteration.workOutcome = outcome; iteration.workEvent = envelope(state, iteration, 'iteration:after', outcome);
      iteration.status = 'hooks-pending';
      await saveEvent(root, state, 'iteration.work-recorded', { event: iteration.workEvent });
      return finalize(root, state, iteration);
    }
    case 'resume': {
      let iteration = state.activeIterationId ? current(state) : state.iterations.at(-1);
      if (state.activeIterationId && state.profile.mode === 'kbd') await reconcileChildren(state, iteration, input);
      if (iteration?.status === 'checkpoint-running') {
        const pending = iteration.checkpoints.filter((receipt) => receipt.status === 'running');
        for (const receipt of pending) receipt.status = 'unknown';
        iteration.status = 'checkpoint-failed';
        await saveEvent(root, state, 'checkpoint.interrupted', { iterationId: iteration.id, attempts: pending.map((receipt) => receipt.attemptId) });
      }
      for (const recovery of input.checkpointRecovery ?? []) {
        const receipt = iteration?.checkpoints.find((item) => item.attemptId === recovery.attemptId && item.status === 'unknown');
        if (!receipt || recovery.processStopped !== true || !recovery.evidencePath) fail('Checkpoint recovery requires an unknown attempt, processStopped:true and an evidencePath');
        if (receipt.pid && receipt.hostname === os.hostname()) {
          try { process.kill(receipt.pid, 0); fail(`Checkpoint process ${receipt.pid} is still alive`); }
          catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
        const evidence = await fs.readFile(path.resolve(recovery.evidencePath));
        receipt.status = 'failed'; receipt.reason = 'Interrupted checkpoint reconciled as stopped; a fresh build/run receipt is required';
        receipt.recovery = { recordedAt: now(), evidencePath: path.resolve(recovery.evidencePath), sha256: createHash('sha256').update(evidence).digest('hex') };
      }
      if (iteration?.workEvent && (iteration.status === 'hooks-pending' || iteration.hookBlocked)) return finalize(root, state, iteration);
      for (const publication of state.publications.filter((item) => !item.hookResults || item.hookBlocked)) {
        const result = await runHooks(root, publication.event);
        publication.hookResults = result.results; publication.hookBlocked = result.blocked;
        if (publication.outcome === 'success' && !result.blocked) {
          state.publicationDue = false; state.nextPublicationDelivery = state.successfulDeliveries + state.profile.publication.every;
        }
      }
      return { runId: state.runId, activeIterationId: state.activeIterationId, child: childStatus(iteration), report: makeReport(state), budgetReason: budgetReason(state), continuation: 'The active harness resumes execution; no separate agent loop was launched.' };
    }
    case 'review': {
      if (input.acknowledged !== true) fail('review requires acknowledged:true from the operator');
      if (state.activeIterationId) fail('Review the finalized iteration');
      state.reviewDue = false; state.reviewAcknowledgedAt = now();
      return { acknowledgedAt: state.reviewAcknowledgedAt, iterationId: state.iterations.at(-1)?.id };
    }
    case 'publication': {
      const prior = state.publications.find((item) => item.commandId === args.commandId);
      if (prior) {
        const result = await runHooks(root, prior.event); prior.hookResults = result.results; prior.hookBlocked = result.blocked;
        if (prior.outcome === 'success' && !result.blocked) {
          state.publicationDue = false; state.nextPublicationDelivery = state.successfulDeliveries + state.profile.publication.every;
        }
        return prior;
      }
      const iteration = current(state, input.iterationId);
      if (iteration.workOutcome !== 'success') fail('Only a successful local delivery may be published');
      if (state.publicationDue && iteration.deliveryNumber !== state.successfulDeliveries) fail('The scheduled publication must include the latest successful delivery');
      if (!['success', 'failed', 'cancelled'].includes(input.outcome)) fail('publication requires an outcome');
      const artifacts = await artifactReceipts(input.artifacts ?? []);
      if (input.outcome === 'success' && (!artifacts.length || !input.receipt)) fail('Successful publication needs artifact files and a publication/site receipt');
      const receipt = input.outcome === 'success' ? await publicationReceipt(input.receipt, artifacts, iteration.sourceRefs, state.profile) : null;
      const event = envelope(state, iteration, 'publication:after', input.outcome); event.artifacts = artifacts;
      const publication = { id: randomUUID(), commandId: args.commandId, iterationId: iteration.id, outcome: input.outcome, event, artifacts, receipt, profileRevision: state.profileRevision, publicationPolicy: structuredClone(state.profile.publication), recordedAt: now() };
      state.publications.push(publication);
      await saveEvent(root, state, 'publication.recorded', { publicationId: publication.id });
      const result = await runHooks(root, event); publication.hookResults = result.results; publication.hookBlocked = result.blocked;
      if (input.outcome === 'success' && !result.blocked) {
        state.publicationDue = false; state.nextPublicationDelivery = state.successfulDeliveries + state.profile.publication.every;
      }
      return publication;
    }
    case 'hooks': return handleHooksCommand(root, args);
    default: fail(`Unknown command: ${command}`);
  }
}

export async function dispatch(root, command, input = {}, args = {}) {
  if (['status', 'report'].includes(command) || (command === 'child' && (args._?.[1] ?? input.action) === 'status')) {
    const state = await loadState(root);
    if (command === 'child') return childStatus(state.iterations.find(i => i.id === (input.iterationId ?? state.activeIterationId)));
    return command === 'report' ? makeReport(state) : { ...state, publicationStatus: publicationStatus(state), budgetReason: budgetReason(state),
      admissionDeadline: state.activeIterationId ? new Date(Date.parse(current(state).startedAt) + current(state).profile.iterationMinutes * 60_000).toISOString() : null };
  }
  return withLock(root, async () => {
    let state = await loadState(root, { optional: command === 'init' || command === 'hooks', recover: command === 'resume' });
    if (command === 'hooks' && !state) return handleHooksCommand(root, args);
    args.commandId ??= randomUUID();
    const hookArgs = command === 'hooks' ? Object.fromEntries(Object.entries(args).filter(([key]) => !['commandId', 'command-id', 'root', 'input'].includes(key))) : null;
    const signature = createHash('sha256').update(JSON.stringify({ command, action: args._?.[1] ?? null, input, hooks: hookArgs })).digest('hex');
    if (state?.commandSignatures?.[args.commandId] && state.commandSignatures[args.commandId] !== signature) fail('command-id was already used for different input');
    if (state?.commandResults?.[args.commandId]) return state.commandResults[args.commandId];
    if (command === 'init') {
      if (state) fail('Cadence is already initialized; use configure');
      state = { schemaVersion: 2, runId: randomUUID(), startedAt: now(), profile: mergeProfile(DEFAULT_PROFILE, input.profile ?? input),
        profileRevision: 1, eventsSeq: 0, iterations: [], activeIterationId: null, commandResults: {}, commandSignatures: {}, publications: [],
        finalizedAttempts: 0, successfulDeliveries: 0, reviewDue: false, publicationDue: false };
      state.nextPublicationDelivery = state.profile.publication.every;
      const result = { runId: state.runId, profile: state.profile, commandId: args.commandId };
      state.commandResults[args.commandId] = result;
      state.commandSignatures[args.commandId] = signature;
      await saveEvent(root, state, 'run.initialized'); return result;
    }
    if (state.schemaVersion !== 2 && command !== 'migrate') fail('Existing v1 cadence run: migrate explicitly before mutation; read-only status/report remain available');
    state.commandSignatures ??= {}; state.commandSignatures[args.commandId] = signature;
    await saveEvent(root, state, 'command.claimed', { commandId: args.commandId, command });
    const result = await execute(root, state, command, input, args);
    // Snapshot results, rather than retaining references to mutable iteration state.
    state.commandResults[args.commandId] = structuredClone(result);
    await saveEvent(root, state, `command.${command}`, { commandId: args.commandId });
    return { ...result, commandId: args.commandId };
  });
}
