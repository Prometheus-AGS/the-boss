import { randomUUID, createHash } from 'node:crypto';
import { assertCommandReplay, reconcileCommand } from './command-recovery.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { DEFAULT_PROFILE, mergeProfile, normalizedScope, budgetReason } from './profile.mjs';
import { withLock, loadState, saveEvent } from './storage.mjs';
import { captureSources, sameSources, artifactReceipts } from './checkpoints.mjs';
import { handleHooksCommand } from './hooks.mjs';
import { dispatchCheckpoint, dispatchJob } from './jobs.mjs';
import { adoptCheckpoint } from './checkpoint-receipts.mjs';
import { freezeCandidate, candidateStatus, assertCandidateCurrent } from './candidates.mjs';
import { reconcileFrozenSource, assertFrozenReconciliation } from './frozen-source-reconciliation.mjs';
import { handleWorkAhead } from './work-ahead.mjs';
import { handlePublication, publicationAdmission } from './publication.mjs';
import { dispatchPublication } from './publication-effects.mjs';
import { digest } from './pipeline-data.mjs';
import { evaluateOpportunities } from './opportunities.mjs';
import { finishEffects, publicationEffects } from './finish-effects.mjs';
import { makeReport } from './report.mjs';
import { handleChild, childStatus, reconcileChildren, assertChildrenResolved, canonicalSnapshot, evidenceFile } from './children.mjs';
import { handleActivity } from './activity.mjs';
import { validateFeatureOperation, assertOperationReady, validateDelivery, publicationStatus } from './delivery-contract.mjs';
import { migrateState, linkHistorical } from './lifecycle.mjs';

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
  if (correction && (last?.id !== correction.iterationId || last.workOutcome !== 'failed' || last.failureResolution))
    fail('Corrective scope must address the immediately preceding unresolved failed delivery');
  if (last && last.workOutcome !== 'success' && !(last.workOutcome === 'failed' && (correction || last.failureResolution?.disposition === 'retired')))
    fail('Repair or explicitly retire the previous failed delivery before admitting new work');
  if (last?.hookBlocked) fail('Required hook failed; reconcile or retry it and resume before new work');
  if (state.reviewDue) fail('Human review is due; record review acknowledgement before new work');
  const capacity=publicationAdmission(state);
  if(!capacity.allowed && !correction) fail(capacity.reason);
  if((state.publications??[]).some(p=>p.hookBlocked || p.event && !p.hookResults)) fail('Reconcile required publication hooks before admitting new scope');
}

function envelope(state, iteration, type, outcome) {
  return { schemaVersion: 1, id: randomUUID(), type, runId: state.runId,
    iterationId: iteration.id, iterationIndex: iteration.index, outcome, occurredAt: now(),
    sourceRefs: iteration.sourceRefs, scope: iteration.scope, completion: iteration.completion,
    artifacts: iteration.artifacts ?? [], metrics: { elapsedMs: Date.now() - Date.parse(iteration.startedAt) } };
}


async function execute(root, state, command, input, args) {
  state.storageRoot = root;
  switch (command) {
    case 'migrate': return migrateState(root, state, input);
    case 'tick': return evaluateOpportunities(state, {...input,commandId:args.commandId});
    case 'candidate': return (args._?.[1] ?? input.action) === 'status' ? candidateStatus(state,input) : freezeCandidate(root,state,current(state,input.iterationId),input);
    case 'work-ahead': {
      const result = await handleWorkAhead(state,args._?.[1] ?? input.action,input);
      if (result.promotion) {
        const iteration = await execute(root,state,'start',result.promotion,{...args,_:['start'],promotingWorkAhead:result.workAheadId});
        const work = state.workAhead.find(w => w.id === result.workAheadId);
        work.state='promoted'; work.promotedIterationId=iteration.id; work.promotedAt=now();
        iteration.firstWorkAt=result.promotion.firstWorkAt; iteration.startedAt=result.promotion.firstWorkAt; iteration.workAheadId=work.id;
        iteration.activities=result.promotion.activities??[];iteration.spans=result.promotion.spans??[];
        return {workAhead:work,iteration};
      }
      return result;
    }
    case 'history': return linkHistorical(state, input);
    case 'failure': {
      if ((args._?.[1] ?? input.action) !== 'resolve') fail('Use failure resolve with an explicit evidence-linked disposition');
      if (state.activeIterationId) fail('Finalize the failed iteration before resolving it');
      const iteration = state.iterations.at(-1);
      if (!iteration || iteration.id !== input.iterationId || iteration.workOutcome !== 'failed' || iteration.status !== 'finished')
        fail('Only the immediately preceding finalized failed iteration may be retired');
      if (iteration.failureResolution) fail('This failed iteration already has a disposition');
      if (iteration.hookBlocked) fail('Reconcile required hooks before retiring the failed iteration');
      if (input.disposition !== 'retired' || typeof input.reason !== 'string' || !input.reason.trim()
        || typeof input.authorityRef !== 'string' || !input.authorityRef.trim())
        fail('Retirement requires disposition:retired, a reason, and an authorityRef');
      const evidence = await evidenceFile(input.evidencePath);
      iteration.failureResolution = {
        disposition: 'retired', reason: input.reason.trim(), authorityRef: input.authorityRef.trim(),
        evidence: { path: evidence.path, sha256: evidence.sha256 }, recordedAt: now(), countedAsDelivery: false
      };
      return { iterationId: iteration.id, workOutcome: iteration.workOutcome, failureResolution: iteration.failureResolution,
        publicationDue: state.publicationDue };
    }
    case 'child': return handleChild(state, current(state, input.iterationId), args._?.[1] ?? input.action, input);
    case 'activity': return handleActivity(current(state, input.iterationId), args._?.[1] ?? input.action, input);
    case 'configure': {
      if (state.activeIterationId) fail('Configure profiles between iterations; current checkpoint contracts are frozen');
      const previous = state.profile;
      state.profile = mergeProfile(previous, input.profile ?? input);
      state.profileRevision++;
      if (!['every','count','either'].includes(previous.publication.mode) && ['every','count','either'].includes(state.profile.publication.mode)) {
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
      const featureOperation = validateFeatureOperation(input.featureOperation, scope, {contractVersion:3,stage:'start'});
      const checkpointMap = new Map(state.profile.checkpoints.map(step => [step.id, step]));
      for (const step of input.checkpoints ?? []) {
        if (!args.promotingWorkAhead && (step.kind !== 'run' || checkpointMap.get(step.id)?.kind === 'build')) fail('Per-iteration overrides add or replace run procedures only; configure build contracts between iterations');
        checkpointMap.set(step.id, step);
      }
      const profile = mergeProfile(state.profile, { checkpoints: [...checkpointMap.values()] });
      checkpointContract(profile);
      if (!profile.checkpoints.some(c => c.id === featureOperation.checkpointId && c.kind === 'run')) fail('Feature operation must name a configured run checkpoint');
      if (featureOperation.entrypoint && !featureOperation.creationTaskRef) await assertOperationReady(featureOperation,scope,{contractVersion:3,stage:'start',profile,satisfiedPrerequisiteIds:input.satisfiedPrerequisiteIds??[]});
      const canonical = await canonicalSnapshot(state, input.canonical);
      const sourceRefs = await captureSources(input.sourceRefs, root);
      const iteration = { id: randomUUID(), index: state.iterations.length + 1, status: 'implementing',
        startedAt: now(), contractVersion: 3, phaseId: canonical?.phaseId ?? input.phaseId ?? state.profile.binding?.phaseId ?? 'standalone', profileRevision: state.profileRevision, profile, scope, featureOperation, correction, children: [], childStack: [], completionEvents: [],
        baselineRefs: sourceRefs, sourceRefs, checkpoints: [], spans: [], completion: counts(), workReceipts: [] };
      state.iterations.push(iteration); state.activeIterationId = iteration.id;
      return iteration;
    }
    case 'ready': {
      if (input.iterationId && state.activeIterationId && input.iterationId !== state.activeIterationId) fail('Finish the active iteration before repairing another');
      let iteration = state.activeIterationId ? current(state, input.iterationId) : state.iterations.at(-1);
      if (!iteration || iteration.workOutcome === 'success') fail('Start a new iteration before ready');
      if (iteration.failureResolution) fail('A retired delivery cannot be repaired; start a new iteration');
      if ((state.jobs ?? []).some(j => j.iterationId === iteration.id && ['claimed','launching','running','cancelRequested','unknown'].includes(j.state))) fail('Reconcile the active or uncertain process before changing its frozen inputs');
      if (state.profile.mode === 'kbd') await reconcileChildren(state, iteration, input);
      assertChildrenResolved(iteration);
      if (input.codeComplete !== true) fail('ready requires codeComplete:true after the complete planned production increment');
      if (input.featureOperation) {
        const next=validateFeatureOperation(input.featureOperation,iteration.scope,{contractVersion:iteration.contractVersion,stage:'ready'});
        const keys=['id','outcome','promisedCapability','evidenceLevel','target','externalEffects'];
        const changed=keys.some(k=>JSON.stringify(next[k])!==JSON.stringify(iteration.featureOperation[k]));
        if(changed && (!input.scopeAuthority || !input.scopeReason)) fail('Changing the approved capability/effects needs scopeAuthority and scopeReason');
        iteration.operationRevisions??=[];iteration.operationRevisions.push({before:iteration.featureOperation,after:next,authority:input.scopeAuthority??next.creationTaskRef,reason:input.scopeReason??'Complete approved operation creation task',at:now()});
        iteration.featureOperation=next;
      }
      if(input.checkpoints) {
        if(!iteration.featureOperation.creationTaskRef && !input.scopeAuthority) fail('Changing a checkpoint needs approved operation creation work or scope authority');
        const map=new Map(iteration.profile.checkpoints.map(s=>[s.id,s]));
        for(const s of input.checkpoints){if(s.kind!=='run'||s.id!==iteration.featureOperation.checkpointId)fail('Ready amendment may only complete the selected feature operation');map.set(s.id,s);}
        iteration.profile=mergeProfile(iteration.profile,{checkpoints:[...map.values()]});
      }
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
      iteration.completedTaskRefs = input.completedTaskRefs ?? iteration.completedTaskRefs ?? [];
      iteration.satisfiedPrerequisiteIds = input.satisfiedPrerequisiteIds ?? iteration.satisfiedPrerequisiteIds ?? [];
      iteration.readyAt = now(); iteration.status = 'ready'; state.activeIterationId = iteration.id;
      await freezeCandidate(root,state,iteration,input);
      return iteration;
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
      if (iteration.workEvent) return {pendingEffects:true,iterationId:iteration.id,eventId:iteration.workEvent.id};
      const outcome = input.outcome ?? 'success';
      if (!['success', 'failed', 'cancelled'].includes(outcome)) fail('Unknown outcome');
      if (outcome === 'success') {
        if (state.profile.mode === 'kbd') await reconcileChildren(state, iteration, input);
        assertChildrenResolved(iteration);
        if ((iteration.activities ?? []).some(a => !a.finishedAt)) fail('Stop open activities before successful finish');
        validateDelivery(iteration);
        const candidate = state.candidates.find(c => c.id === iteration.candidateId);
        const reconciliation = candidate ? await assertFrozenReconciliation(root,state,candidate,iteration) : null;
        if (iteration.contractVersion >= 3) await assertCandidateCurrent(root,state,iteration,reconciliation);
        const reason = budgetReason(state); if (reason) fail(reason);
        if (iteration.status !== 'ready') fail('A completed build and runnable increment is required');
        if (!reconciliation && !sameSources(await captureSources(iteration.sourceRefs, root), iteration.sourceRefs)) fail('Sources changed since ready; rebuild before delivery');
        if (reconciliation && !iteration.checkpoints.some(r => r.id === iteration.featureOperation.checkpointId &&
          r.status === 'success' && r.frozenSourceReconciliation === reconciliation.sha256))
          fail('Frozen source reconciliation needs a successful matching feature operation receipt');
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
      return {pendingEffects:true,iterationId:iteration.id,eventId:iteration.workEvent.id};
    }
    case 'resume': {
      if (input.commandRecovery) return reconcileCommand(state,input.commandRecovery);
      evaluateOpportunities(state,input);
      let iteration = state.activeIterationId ? current(state) : state.iterations.at(-1);
      if (state.activeIterationId && state.profile.mode === 'kbd') await reconcileChildren(state, iteration, input);
      if (iteration?.workEvent && (iteration.status === 'hooks-pending' || iteration.hookBlocked)) return {pendingEffects:true,iterationId:iteration.id,eventId:iteration.workEvent.id};
      const publication=state.publications.find(p=>p.event && (!p.hookResults || p.hookBlocked));
      if(publication) return {pendingPublicationEffects:true,publicationId:publication.id};
      return { runId: state.runId, activeIterationId: state.activeIterationId, child: childStatus(iteration), report: makeReport(state), budgetReason: budgetReason(state), continuation: 'The active harness resumes execution; no separate agent loop was launched.' };
    }
    case 'review': {
      if (input.acknowledged !== true) fail('review requires acknowledged:true from the operator');
      if (state.activeIterationId) fail('Review the finalized iteration');
      state.reviewDue = false; state.reviewAcknowledgedAt = now();
      return { acknowledgedAt: state.reviewAcknowledgedAt, iterationId: state.iterations.at(-1)?.id };
    }
    case 'publication': {
      const result=handlePublication(state,args._?.[1] ?? input.action ?? 'reconcile',input);
      const attempt=result.attempt;
      if(attempt && ['succeeded','failed','cancelled'].includes(attempt.state)) {
        let publication=state.publications.find(p=>p.attemptId===attempt.id);
        if(!publication) {
          const candidate=state.candidates.find(c=>c.id===attempt.candidateId), iteration=current(state,candidate.iterationId);
          const outcome=attempt.state==='succeeded'?'success':attempt.state;
          publication={id:randomUUID(),attemptId:attempt.id,iterationId:iteration.id,outcome,event:envelope(state,iteration,'publication:after',outcome),artifacts:attempt.receipts??[],recordedAt:now()};
          state.publications.push(publication);
        }
        if(!publication.hookResults || publication.hookBlocked) return {...result,pendingPublicationEffects:true,publicationId:publication.id};
      }
      return result;
    }
    case 'hooks': return handleHooksCommand(root, args);
    default: fail(`Unknown command: ${command}`);
  }
}

export async function dispatch(root, command, input = {}, args = {}) {
  const action=args._?.[1]??input.action;
  if (['status', 'report'].includes(command) || (['child','candidate','work-ahead','publication'].includes(command) && action === 'status')) {
    const state = await loadState(root);
    if (command === 'child') return childStatus(state.iterations.find(i => i.id === (input.iterationId ?? state.activeIterationId)));
    if (command === 'candidate') return candidateStatus(state,input);
    if (command === 'work-ahead') return handleWorkAhead(state,'status',input);
    if (command === 'publication') return publicationStatus(state);
    return command === 'report' ? makeReport(state) : { ...state, publicationStatus: publicationStatus(state), budgetReason: budgetReason(state),
      admissionDeadline: state.activeIterationId ? new Date(Date.parse(current(state).startedAt) + current(state).profile.iterationMinutes * 60_000).toISOString() : null };
  }
  args.commandId ??= randomUUID();
  if(command==='resume') {
    const observed=await withLock(root,()=>loadState(root,{recover:true}));
    if(observed.schemaVersion===3) for(const job of observed.jobs??[]) {
      if(['claimed','launching','running','unknown','cancelRequested'].includes(job.state)) await dispatchJob(root,'reconcile',{attemptId:job.id},{commandId:`${args.commandId}:job:${job.id}`});
    }
  }
  if (command === 'checkpoint') return (args._?.[1] ?? input.action) === 'adopt' ? adoptCheckpoint(root,input,args) : dispatchCheckpoint(root,input,args);
  if (command === 'candidate' && action === 'reconcile-frozen') return reconcileFrozenSource(root,input,args);
  if (command === 'job') return dispatchJob(root,args._?.[1] ?? input.action ?? 'status',input,args);
  if (command === 'hooks' && args._?.[1] === 'retry') return handleHooksCommand(root,args);
  const result = await withLock(root, async () => {
    let state = await loadState(root, { optional: command === 'init' || command === 'hooks', recover: command === 'resume' });
    if (command === 'hooks' && !state) return handleHooksCommand(root, args);
    args.commandId ??= randomUUID();
    const hookArgs = command === 'hooks' ? Object.fromEntries(Object.entries(args).filter(([key]) => !['commandId', 'command-id', 'root', 'input'].includes(key))) : null;
    const signature = digest({ command, action: args._?.[1] ?? null, input, hooks: hookArgs });
    const legacySignature=createHash('sha256').update(JSON.stringify({ command, action:args._?.[1]??null,input,hooks:hookArgs })).digest('hex');
    if (state?.commandSignatures?.[args.commandId] && ![signature,legacySignature].includes(state.commandSignatures[args.commandId])) fail('command-id was already used for different input');
    if (state?.commandResults?.[args.commandId]) return state.commandResults[args.commandId];
    assertCommandReplay(state,args.commandId);
    if (command === 'init') {
      if (state) fail('Cadence is already initialized; use configure');
      state = { schemaVersion: 3, runId: randomUUID(), startedAt: now(), profile: mergeProfile(DEFAULT_PROFILE, input.profile ?? input),
        profileRevision: 1, eventsSeq: 0, iterations: [], activeIterationId: null, commandResults: {}, commandSignatures: {}, publications: [],
        finalizedAttempts: 0, successfulDeliveries: 0, reviewDue: false, publicationDue: false, candidates:[],jobs:[],workAhead:[],obligations:[],releaseAttempts:[],opportunities:[],adoptedReceipts:[] };
      state.nextPublicationDelivery = state.profile.publication.every;
      const result = { runId: state.runId, profile: state.profile, commandId: args.commandId };
      state.commandResults[args.commandId] = result;
      state.commandSignatures[args.commandId] = signature;
      await saveEvent(root, state, 'run.initialized'); return result;
    }
    if (state.schemaVersion !== 3 && command !== 'migrate') fail('Legacy cadence run: migrate explicitly to v3 before mutation; read-only status/report remain available');
    if (input.runId && input.runId !== state.runId) fail('Request runId does not match this run');
    if (input.expectedRevision !== undefined && input.expectedRevision !== state.eventsSeq) fail('Stale expectedRevision; reload status before mutation');
    state.commandSignatures ??= {}; state.commandSignatures[args.commandId] = signature;
    if(state.commandRecoveries?.[args.commandId]) state.commandRecoveries[args.commandId].status='replay-claimed';
    await saveEvent(root, state, 'command.claimed', { commandId: args.commandId, command });
    let result;
    try { result = await execute(root, state, command, input, args); }
    catch(error) {
      const persisted=await loadState(root); persisted.commandErrors??={};
      persisted.commandErrors[args.commandId]={message:error.message,recordedAt:now()};
      await saveEvent(root,persisted,'command.failed',{commandId:args.commandId});
      throw error;
    }
    // Snapshot results, rather than retaining references to mutable iteration state.
    state.commandResults[args.commandId] = structuredClone(result);
    await saveEvent(root, state, `command.${command}`, { commandId: args.commandId });
    return { ...result, commandId: args.commandId };
  });
  if (result?.pendingEffects) return finishEffects(root,result,args.commandId);
  if (result?.pendingPublicationEffects) return publicationEffects(root,result,args.commandId);
  if(result?.dispatch && result?.attempt) return dispatchPublication(root,result,args.commandId);
  return result;
}
