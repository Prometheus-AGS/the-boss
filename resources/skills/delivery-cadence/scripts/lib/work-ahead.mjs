import { randomUUID } from 'node:crypto';
import { captureFutureSources, verifyRepairedBase, assertRepairUnchanged } from './work-ahead-repair.mjs';
import path from 'node:path';
import { normalizedScope, budgetReason, mergeProfile } from './profile.mjs';
import { assertOperationReady, validateFeatureOperation } from './delivery-contract.mjs';
import { publicationAdmission } from './publication.mjs';
import { handleActivity } from './activity.mjs';
import { fail, clone, strings, timestamp, findCandidate, candidateId, candidateDigest, iterationFor, physicalPath, overlaps, rootsOf, nonempty } from './pipeline-data.mjs';

const open = state => (state.workAhead ?? []).filter(item => !['promoted', 'cancelled'].includes(item.state));
function blockers(state, item) {
  const previous = findCandidate(state, item.predecessorCandidateId), iteration = iterationFor(state, previous);
  const result = [];
  if (!iteration?.finishedAt || iteration.workOutcome !== 'success' || iteration.deliveryCounted !== true) result.push('predecessor-local-delivery');
  if (iteration?.hookBlocked || iteration?.status === 'hook-blocked') result.push('required-hooks');
  if (iteration?.childStack?.length || iteration?.childReconciliation?.blocked) result.push('unresolved-child');
  if (state.reviewDue) result.push('human-review');
  if (state.activeIterationId) result.push('active-iteration');
  const repaired = item.repairedBaseRef;
  const current = (state.candidates ?? []).filter(c => c.iterationId === previous.iterationId).at(-1) ?? previous;
  if (candidateId(current) !== item.predecessorCandidateId && (!repaired || repaired.candidateId !== candidateId(current))) result.push('repaired-base-reconciliation');
  if ((iteration?.checkpoints ?? []).some(r => r.status === 'failed') && !repaired) result.push('repaired-base-reconciliation');
  if ((item.activities ?? []).some(activity => !activity.finishedAt)) result.push('open-work-ahead-activity');
  if (budgetReason(state)) result.push('run-budget');
  // Existing Boss publishing consumes a release branch/version. The data layer
  // never pretends a local reservation can fence that external consumer.
  if (item.changesReleaseVersion && (state.releaseAttempts ?? []).some(a => ['intent', 'dispatched', 'running', 'unknown'].includes(a.state))) result.push('release-branch-version-owned');
  return [...new Set(result)];
}
async function isolatedRoots(state, previous, input) {
  const checkoutRoots = await Promise.all(strings(input.checkoutRoots, 'checkoutRoots', true).map(physicalPath));
  const outputRoots = await Promise.all(strings(input.outputRoots, 'outputRoots', true).map(physicalPath));
  const occupied = [];
  for (const value of rootsOf(previous)) occupied.push(await physicalPath(value));
  const iteration = iterationFor(state, previous);
  for (const ref of iteration?.sourceRefs ?? []) if (ref.repository) occupied.push(await physicalPath(ref.repository));
  for (const checkpoint of iteration?.profile?.checkpoints ?? []) {
    if (checkpoint.cwd) occupied.push(await physicalPath(checkpoint.cwd));
    for (const root of checkpoint.outputRoots ?? []) occupied.push(await physicalPath(root));
  }
  for (const job of state.jobs ?? []) if (!['succeeded', 'failed', 'cancelled'].includes(job.state)) {
    for (const root of job.outputRoots ?? []) occupied.push(await physicalPath(root));
  }
  if (!occupied.length) fail('Predecessor has no physical execution roots; record frozen checkout/output ownership before work-ahead');
  for (const value of [...checkoutRoots, ...outputRoots]) if (occupied.some(root => overlaps(root, value))) fail(`Work-ahead root conflicts with frozen delivery or owned job: ${value}`);
  return { checkoutRoots, outputRoots };
}

/** Data-only work admission. The caller owns the run lock and canonical authority. */
export async function handleWorkAhead(state, action, input = {}) {
  state.workAhead ??= [];
  if (action === 'status') return state.workAhead.map(item => ({ ...item, blockers: ['promoted', 'cancelled'].includes(item.state) ? [] : blockers(state, item) }));
  if (action === 'admit') {
    const capacity = publicationAdmission(state);
    if (!capacity.allowed) fail(capacity.reason);
    if (open(state).length) fail('One future scope is already admitted; finish, cancel or promote it before admitting another');
    if (budgetReason(state)) fail(budgetReason(state));
    const previous = findCandidate(state, input.predecessorCandidateId), iteration = iterationFor(state, previous);
    if (!iteration || !['ready', 'checkpointing', 'finishing', 'finished', 'success', 'failed', 'running', 'hook-blocked'].includes(iteration.status) && !iteration.readyAt) fail('Work-ahead requires a frozen completed production scope');
    if (!candidateDigest(previous)) fail('Predecessor needs immutable source identity');
    const authorityRefs = strings(input.authorityRefs, 'authorityRefs', true);
    const canonicalScopeRefs = strings(input.canonicalScopeRefs, 'canonicalScopeRefs', true);
    if (!nonempty(input.owner)) fail('Work-ahead needs an explicit owner');
    const ownedPaths = strings(input.ownedPaths, 'ownedPaths', true);
    const scope = normalizedScope(input.scope);
    const featureOperation = validateFeatureOperation(input.featureOperation, scope, { contractVersion: 3, stage: 'admit' });
    const profile = input.checkpoints ? mergeProfile(state.profile, { checkpoints: input.checkpoints }) : state.profile;
    await assertOperationReady(featureOperation, scope, { contractVersion: 3, stage: 'admit', profile });
    if (!['independent', 'depends-on-predecessor'].includes(input.dependencyClass)) fail('Classify work-ahead as independent or depends-on-predecessor');
    if (!Array.isArray(input.baseSourceRefs) || !input.baseSourceRefs.length) fail('Work-ahead requires recorded base source references');
    const roots = await isolatedRoots(state, previous, input);
    for (const owned of ownedPaths) {
      const physical = await physicalPath(owned);
      if (!roots.checkoutRoots.some(root => { const r = path.relative(root, physical); return r === '' || (!r.startsWith(`..${path.sep}`) && r !== '..' && !path.isAbsolute(r)); })) fail(`Owned path is outside work-ahead checkout roots: ${owned}`);
    }
    const baseSourceRefs = await captureFutureSources(state, roots, input.baseSourceRefs);
    const item = { id: input.id ?? randomUUID(), predecessorCandidateId: candidateId(previous), authorityRefs, canonicalScopeRefs,
      owner: input.owner, ownedPaths, scope, outcome: scope.outcomes, featureOperation, baseSourceRefs, ...roots,
      checkpoints: clone(profile.checkpoints), phaseId: input.phaseId ?? null,
      dependencyClass: input.dependencyClass, changesReleaseVersion: input.changesReleaseVersion === true,
      admittedAt: timestamp(), firstWorkAt: null, activities: [], activityRefs: [], blockers: [], repairedBaseRef: null, state: 'admitted' };
    if (state.workAhead.some(prior => prior.id === item.id)) fail('Work-ahead ID already exists; retry original command');
    state.workAhead.push(item); return item;
  }
  const item = state.workAhead.find(row => row.id === (input.id ?? input.workAheadId));
  if (!item) fail('Unknown work-ahead scope');
  if (['promoted', 'cancelled'].includes(item.state)) fail('Work-ahead scope is already finalized');
  if (action === 'start') {
    if (item.firstWorkAt) return item;
    const previousIteration = iterationFor(state, findCandidate(state, item.predecessorCandidateId));
    if (item.dependencyClass === 'depends-on-predecessor' && !item.repairedBaseRef && (previousIteration?.workOutcome === 'failed' || (previousIteration?.checkpoints ?? []).some(r => r.status === 'failed'))) fail('Dependent work waits for predecessor repair and base reconciliation');
    if (budgetReason(state)) fail(budgetReason(state));
    const value = timestamp(input.firstWorkAt);
    if (Date.parse(value) < Date.parse(item.admittedAt) || Date.parse(value) > Date.now()) fail('firstWorkAt must be an observed time since admission');
    item.firstWorkAt = value; item.state = 'working'; return item;
  }
  if (action === 'activity') {
    if (!item.firstWorkAt) fail('Record work-ahead start before activities');
    const proxy = { ...item, startedAt: item.firstWorkAt, spans: item.spans ?? [] };
    const result = handleActivity(proxy, input.action, input.activity ?? input);
    item.activities = proxy.activities; item.spans = proxy.spans; return result;
  }
  if (action === 'reconcile') {
    strings(input.authorityRefs, 'reconciliation authorityRefs', true);
    if (!nonempty(input.evidenceRef)) fail('Repaired-base reconciliation requires evidenceRef');
    const candidate = findCandidate(state, input.candidateId);
    const previous = findCandidate(state, item.predecessorCandidateId);
    if (candidate.iterationId !== previous.iterationId) fail('Repair must belong to the predecessor delivery');
    const current = state.candidates.filter(c => c.iterationId === previous.iterationId).at(-1);
    if (candidateId(current) !== candidateId(candidate)) fail('Reconcile against the current repaired candidate, not a superseded one');
    const verified = await verifyRepairedBase(state, item, candidate, input);
    item.repairedBaseRef = { candidateId: candidateId(candidate), contentManifestDigest: candidateDigest(candidate),
      ...verified, evidenceRef: input.evidenceRef, authorityRefs: clone(input.authorityRefs), recordedAt: timestamp() };
    item.blockers = blockers(state, item); return item;
  }
  if (action === 'promote') {
    item.blockers = blockers(state, item);
    if (item.blockers.length) fail(`Work-ahead promotion blocked: ${item.blockers.join(', ')}`);
    if (!item.firstWorkAt) fail('Work-ahead promotion requires recorded firstWorkAt');
    await assertRepairUnchanged(state, item);
    const promotedSourceRefs = await captureFutureSources(state, item, item.repairedBaseRef?.baseSourceRefs ?? item.baseSourceRefs.map(({ repository }) => ({ repository })), { exact: Boolean(item.repairedBaseRef) });
    // Caller runs ordinary start and then atomically records promoted state with
    // the new iteration ID. This proposal creates neither a phase nor a clock.
    return { workAheadId: item.id, promotion: { scope: clone(item.scope), featureOperation: clone(item.featureOperation),
      checkpoints: clone(item.checkpoints), ...(item.phaseId ? { phaseId: item.phaseId } : {}),
      firstWorkAt: item.firstWorkAt, activities: clone(item.activities), spans: clone(item.spans ?? []),
      sourceRefs: promotedSourceRefs, authorityRefs: clone(item.authorityRefs) } };
  }
  if (action === 'cancel') {
    strings(input.authorityRefs, 'cancellation authorityRefs', true);
    if (!nonempty(input.reason)) fail('Cancellation requires a reason; scope is not silently discarded');
    item.state = 'cancelled'; item.cancelledAt = timestamp(); item.cancellation = clone(input); return item;
  }
  fail('Unknown work-ahead action');
}
