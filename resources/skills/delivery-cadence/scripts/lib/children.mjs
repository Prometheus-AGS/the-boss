import { randomUUID, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizedScope } from './profile.mjs';
import { captureSources } from './checkpoints.mjs';
import { validateFeatureOperation } from './delivery-contract.mjs';

const exec = promisify(execFile);
const now = () => new Date().toISOString();
const fail = message => { throw new Error(message); };
const text = (value, name) => typeof value === 'string' && value.trim() ? value : fail(`${name} is required`);
const completed = phase => ['complete', 'completed', 'archived'].includes(phase?.status);
export async function evidenceFile(file) {
  const absolute = path.resolve(text(file, 'evidencePath'));
  const bytes = await fs.readFile(absolute);
  return { path: absolute, sha256: createHash('sha256').update(bytes).digest('hex'), document: JSON.parse(bytes.toString('utf8')) };
}
export async function canonicalSnapshot(state, supplied) {
  if (state.profile.mode !== 'kbd') return null;
  const config = state.profile.binding?.canonicalCommand;
  if (config) {
    if (!config.command || !Array.isArray(config.args) || config.args.some(a => typeof a !== 'string') || !config.cwd) fail('canonicalCommand requires command, args and cwd');
    const result = await exec(config.command === 'node' ? process.execPath : config.command, config.args, { cwd: config.cwd, shell: false, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    supplied = JSON.parse(result.stdout);
  }
  if (!supplied || supplied.source !== 'prometheus-kbd-status' || !Number.isInteger(supplied.revision) || !supplied.phases || !supplied.phaseId) fail('Fresh canonical KBD snapshot required; configure binding.canonicalCommand or supply canonical export');
  return supplied;
}
function setup(iteration) { iteration.children ??= []; iteration.childStack ??= []; iteration.scopeRevisions ??= []; }
function top(iteration) { return iteration.children.find(c => c.id === iteration.childStack.at(-1)); }
export function childStatus(iteration) {
  if (!iteration) return { active: [], blocked: false };
  setup(iteration);
  return { active: iteration.childStack.map(id => iteration.children.find(c => c.id === id)),
    blocked: Boolean(iteration.childStack.length || iteration.childReconciliation?.blocked), reconciliation: iteration.childReconciliation ?? null,
    clockPolicy: 'continuous-parent-clock', admissionDeadline: new Date(Date.parse(iteration.startedAt) + iteration.profile.iterationMinutes * 60000).toISOString() };
}
export function assertChildrenResolved(iteration) {
  if (childStatus(iteration).blocked) fail('Child work unresolved: inspect child status, reconcile canonical position and record return evidence');
}
function addScope(iteration, child, authority) {
  const before = structuredClone(iteration.scope);
  for (const kind of ['tasks', 'changes', 'phases', 'outcomes']) iteration.scope[kind] = [...new Set([...iteration.scope[kind], ...child.scope[kind]])];
  iteration.scopeRevisions.push({ id: randomUUID(), childId: child.id, reason: child.reason, authority, at: now(), before, after: structuredClone(iteration.scope) });
}
export async function reconcileChildren(state, iteration, input = {}) {
  setup(iteration);
  const canonical = await canonicalSnapshot(state, input.canonical);
  if (!canonical) return { ...childStatus(iteration), lifecycleAuthority: 'owning-harness; no KBD lifecycle' };
  const root = iteration.phaseId ?? state.profile.binding?.phaseId;
  if (!root) fail('KBD iteration needs canonical root phaseId');
  let chain = [], cursor = canonical.phaseId;
  while (cursor && cursor !== root) {
    if (chain.includes(cursor)) fail('Canonical phase ancestry is cyclic');
    chain.unshift(cursor); cursor = canonical.phases[cursor]?.parentPhaseId;
  }
  if (cursor !== root) {
    iteration.childReconciliation = { blocked: true, reason: 'canonical-position-outside-owning-phase', canonicalPhaseId: canonical.phaseId, revision: canonical.revision };
    return childStatus(iteration);
  }
  for (const phaseId of chain) {
    if (iteration.childStack.some(id => iteration.children.find(c => c.id === id)?.phaseId === phaseId)) continue;
    const active = top(iteration);
    const parentPhaseId = canonical.phases[phaseId]?.parentPhaseId;
    if ((active?.phaseId ?? root) !== parentPhaseId) break;
    const child = { id: randomUUID(), phaseId, parentPhaseId, parentChildId: active?.id ?? null,
      enteredAt: now(), status: 'needs-context', outcome: null, scope: { tasks: [], changes: [], phases: [], outcomes: [] },
      completion: { tasks: [], changes: [], phases: [] }, entryRevision: canonical.revision,
      reason: 'Recovered missed lifecycle notification; original entry time unknown', timingProvenance: 'recovery-observed', approvals: null };
    iteration.children.push(child); iteration.childStack.push(child.id);
  }
  const active = top(iteration);
  iteration.childReconciliation = { blocked: Boolean(active), reason: active ? (canonical.phaseId === active.phaseId ? 'child-active' : 'canonical-return-awaiting-evidence') : null,
    canonicalPhaseId: canonical.phaseId, revision: canonical.revision };
  return childStatus(iteration);
}
export async function handleChild(state, iteration, action, input) {
  setup(iteration);
  if (action === 'status') return childStatus(iteration);
  if (action === 'reconcile') return reconcileChildren(state, iteration, input);
  const canonical = await canonicalSnapshot(state, input.canonical);
  if (action === 'enter') {
    const phaseId = text(input.phaseId, 'phaseId');
    const existing = top(iteration);
    const recovered = existing?.phaseId === phaseId && existing.status === 'needs-context' ? existing : null;
    const parent = recovered ? iteration.children.find(c => c.id === recovered.parentChildId) : existing;
    const parentPhaseId = parent?.phaseId ?? iteration.phaseId ?? state.profile.binding?.phaseId;
    if (canonical && (canonical.phaseId !== phaseId || canonical.phases[phaseId]?.parentPhaseId !== parentPhaseId)) fail('Child must be current canonical child of the recorded parent');
    if (existing?.phaseId === phaseId && !recovered) return existing;
    const scope = normalizedScope(input.scope);
    const authority = text(input.authority, 'scope authority');
    const featureOperation = input.featureOperation
      ? validateFeatureOperation(input.featureOperation, scope, { contractVersion: iteration.contractVersion, stage: 'start' })
      : structuredClone(iteration.featureOperation);
    const returnCriteria = input.returnCriteria;
    if (!Array.isArray(returnCriteria) || !returnCriteria.length || returnCriteria.some(c => typeof c !== 'string' || !c.trim())) fail('Explicit returnCriteria required');
    if (input.sourceRefs) {
      const repositories = [...new Map([...iteration.sourceRefs, ...input.sourceRefs].map(ref => [path.resolve(ref.repository), { repository: ref.repository }])).values()];
      iteration.sourceRefs = await captureSources(repositories, state.storageRoot);
    }
    const child = { ...(recovered ?? {}), id: recovered?.id ?? randomUUID(), phaseId, parentPhaseId: parentPhaseId ?? text(input.parentPhaseId, 'parentPhaseId'),
      parentChildId: parent?.id ?? null, enteredAt: recovered?.enteredAt ?? now(), status: 'active', outcome: null,
      reason: text(input.reason, 'child reason'), owner: text(input.owner, 'child owner'), authority,
      scope, returnCriteria, featureOperation, inheritedFeatureOperation: !input.featureOperation,
      parentFeatureOperation: structuredClone(iteration.featureOperation),
      sourceRefs: structuredClone(iteration.sourceRefs), requiresApproval: input.requiresApproval === true,
      approvalEvidence: null, entryRevision: canonical?.revision ?? null, completion: { tasks: [], changes: [], phases: [] } };
    if (recovered) Object.assign(recovered, child); else { iteration.children.push(child); iteration.childStack.push(child.id); }
    addScope(iteration, child, authority);
    iteration.childReconciliation = { blocked: true, reason: 'child-active' };
    return child;
  }
  if (action !== 'return') fail(`Unknown child action: ${action}`);
  const child = top(iteration);
  if (!child || child.id !== input.childId) fail('Return the active leaf child by childId');
  if (!['success', 'failed', 'cancelled', 'waived'].includes(input.outcome)) fail('Child outcome required');
  if (input.outcome === 'failed' || input.outcome === 'cancelled') {
    child.status = 'blocked'; child.outcome = input.outcome;
    child.attempts ??= []; child.attempts.push({ at: now(), outcome: input.outcome, reason: text(input.reason, 'failure reason') });
    return childStatus(iteration);
  }
  const evidence = await evidenceFile(input.evidencePath);
  const doc = evidence.document;
  if (doc.childId !== child.id || doc.phaseId !== child.phaseId) fail('Return evidence must identify the child');
  if (canonical && canonical.phaseId !== child.parentPhaseId) fail('KBD must restore the canonical parent before cadence return');
  if (input.outcome === 'waived') {
    if (doc.operatorScopeChange?.approved !== true || !doc.operatorScopeChange.reference || !doc.operatorScopeChange.reason) fail('Waiver requires explicit operator scope-change evidence');
  } else {
    if (child.status === 'needs-context') fail('Recovered child needs explicit context through child enter before completion');
    if (canonical && !completed(canonical.phases[child.phaseId])) fail('Canonical child phase is not complete');
    if (child.requiresApproval && (doc.approval?.approved !== true || !doc.approval.reference)) fail('Required architecture approval evidence missing');
    if (!child.returnCriteria.every(c => doc.criteria?.some(item => item.id === c && item.met === true && item.evidence))) fail('Each return criterion needs observed evidence');
    const completion = doc.completion ?? {};
    for (const kind of ['tasks', 'changes', 'phases']) {
      const ids = completion[kind] ?? [];
      if (!Array.isArray(ids) || ids.some(id => !child.scope[kind].includes(id))) fail(`Child completion.${kind} must be scoped canonical IDs`);
      child.completion[kind] = [...new Set(ids)];
      iteration.completionEvents ??= [];
      for (const id of child.completion[kind]) iteration.completionEvents.push({ kind, id, action: 'complete', occurredAt: now(), childId: child.id, source: evidence.path });
    }
  }
  child.status = input.outcome === 'waived' ? 'waived' : 'returned'; child.outcome = input.outcome; child.returnedAt = now();
  child.evidence = { path: evidence.path, sha256: evidence.sha256, canonicalRevision: canonical?.revision ?? null };
  child.approvalEvidence = doc.approval ?? null;
  iteration.childStack.pop(); iteration.childReconciliation = { blocked: Boolean(iteration.childStack.length), reason: iteration.childStack.length ? 'child-active' : null };
  iteration.status = 'implementing'; delete iteration.readyAt;
  return { child, ...childStatus(iteration), next: 'Complete parent production scope then ready; frozen-source receipts will be re-evaluated.' };
}
