import { randomUUID } from 'node:crypto';
import { candidateId, candidateDigest, clone, digest, fail, findCandidate, iterationFor, nonempty, strings, timestamp } from './pipeline-data.mjs';
import { unresolvedObligations } from './opportunities.mjs';
import { assessConsumer, validatePublicationReceipt } from './publication-receipts.mjs';
export { assessConsumer } from './publication-receipts.mjs';

const active = attempt => ['intent', 'dispatched', 'running', 'unknown'].includes(attempt.state);
function findObligation(state, id) {
  const result = (state.obligations ?? []).find(item => item.id === id);
  if (!result) fail(`Unknown publication obligation: ${id}`);
  return result;
}
function coveredEffects(state, obligation) {
  return [...new Set((state.releaseAttempts ?? []).filter(a => a.obligationId === obligation.id && a.candidateId === obligation.candidateId)
    .flatMap(a => a.receipts ?? []).map(r => r.effect))];
}
function missingEffects(state, obligation) {
  const covered = coveredEffects(state, obligation);
  const missing = obligation.requiredEffects.filter(effect => !covered.includes(effect));
  const receipts = (state.releaseAttempts ?? []).filter(a => a.obligationId === obligation.id && a.candidateId === obligation.candidateId).flatMap(a => a.receipts ?? []);
  // A site deployment recorded early cannot certify platforms published later.
  if (obligation.requiredEffects.includes('website')) {
    const site = receipts.filter(r => r.effect === 'website').at(-1);
    for (const artifact of receipts.filter(r => r.effect.startsWith('artifact:'))) {
      if (!site?.links?.some(link => link.platform === artifact.platform && link.url === artifact.url && link.sha256 === artifact.sha256)) missing.push(`website-link:${artifact.platform}`);
    }
  }
  return [...new Set(missing)];
}
function refresh(state, obligation) {
  obligation.missing = missingEffects(state, obligation);
  if (!obligation.missing.length && !(state.releaseAttempts ?? []).some(a => a.obligationId === obligation.id && active(a))) {
    obligation.disposition = 'fulfilled'; obligation.fulfilledAt ??= timestamp();
  } else if (obligation.disposition !== 'superseded') obligation.disposition = 'pending';
  state.publicationDue = unresolvedObligations(state).length > 0;
}
export function publicationAdmission(state) {
  const pending = unresolvedObligations(state).filter(obligation => !(state.releaseAttempts ?? []).some(a => a.obligationId === obligation.id && active(a)));
  const inFlight = new Set((state.releaseAttempts ?? []).filter(active).map(a => a.obligationId));
  return { allowed: pending.length <= 1 && inFlight.size <= 1, pending: pending.length, inFlight: inFlight.size,
    reason: pending.length > 1 ? 'Publication pending capacity exceeded; reconcile owed candidates before unrelated admission' : inFlight.size > 1 ? 'Multiple in-flight releases require reconciliation' : null };
}
export function pipelinePublicationStatus(state, now = new Date().toISOString()) {
  const obligations = (state.obligations ?? []).map(o => ({ ...o, missing: missingEffects(state, o),
    ageMinutes: Number.isFinite(Date.parse(o.dueAt)) ? Math.max(0, (Date.parse(now) - Date.parse(o.dueAt)) / 60000) : null }));
  return { due: unresolvedObligations(state).length > 0, reason: 'Candidate-specific obligations persist until their platform, metadata and website effects are covered.',
    obligations, attempts: state.releaseAttempts ?? [], missing: obligations.filter(o => !['fulfilled', 'superseded'].includes(o.disposition)).flatMap(o => o.missing.map(effect => `${o.id}:${effect}`)),
    installedAcceptance: state.installedAcceptance ?? [], acceptanceIndependent: true,
    blockedConsumers: (state.releaseAttempts ?? []).filter(a => a.state === 'capability-blocked').map(a => a.capabilityAssessment) };
}

/** Pure short mutations. Returned dispatch requests are executed by the owning session outside its state mutex. */
export function handlePublication(state, action, input = {}) {
  state.releaseAttempts ??= []; state.installedAcceptance ??= [];
  if (action === 'status') return pipelinePublicationStatus(state);
  if (action === 'capabilities') return assessConsumer(input.adapter);
  if (action === 'acceptance') {
    const obligation = findObligation(state, input.obligationId);
    const published = state.releaseAttempts.filter(a => a.obligationId === obligation.id).flatMap(a => a.receipts ?? []).find(r => r.platform === input.platform && r.sha256 === input.sha256);
    if (!published || !['passed', 'failed', 'pending'].includes(input.status) || !nonempty(input.evidenceRef)) fail('Installed acceptance needs a published artifact and explicit outcome/evidence');
    const receipt = { ...clone(input), recordedAt: timestamp() }; state.installedAcceptance.push(receipt); return receipt;
  }
  const obligation = findObligation(state, input.obligationId);
  const candidate = findCandidate(state, obligation.candidateId);
  if (action === 'replace') {
    strings(input.authorityRefs, 'replacement authorityRefs', true);
    if (obligation.disposition !== 'pending' || obligation.attemptIds?.some(id => state.releaseAttempts.some(a => a.id === id && !['capability-blocked', 'cancelled-before-dispatch'].includes(a.state)))) fail('Only an unstarted pending obligation can be explicitly replaced');
    if (!nonempty(input.ancestryEvidenceRef) || !nonempty(input.reason)) fail('Replacement requires ancestry/compatibility evidence and reason');
    const next = findCandidate(state, input.candidateId), iteration = iterationFor(state, next);
    if (!iteration?.finishedAt || iteration.workOutcome !== 'success') fail('Replacement candidate must be a completed local delivery');
    const nextScope = next.scope ?? iteration.scope;
    for (const kind of ['tasks', 'changes', 'phases']) if ((obligation.coveredScopes[kind] ?? []).some(id => !nextScope?.[kind]?.includes(id))) fail('Replacement must retain complete prior scope coverage');
    obligation.replacements ??= [];
    obligation.replacements.push({ priorCandidateId: obligation.candidateId, priorDigest: obligation.contentManifestDigest, nextCandidateId: candidateId(next),
      reason: input.reason, ancestryEvidenceRef: input.ancestryEvidenceRef, authorityRefs: clone(input.authorityRefs), recordedAt: timestamp() });
    obligation.candidateId = candidateId(next); obligation.iterationId = next.iterationId; obligation.contentManifestDigest = candidateDigest(next);
    obligation.coveredScopes = clone(nextScope); refresh(state, obligation); return obligation;
  }
  if (action === 'attempt') {
    if (obligation.disposition === 'fulfilled') fail('This obligation is already fulfilled');
    strings(input.authorityRefs, 'publication authorityRefs', true);
    if (!nonempty(input.releaseVersion)) fail('Publication attempt requires immutable releaseVersion');
    const effects = strings(input.effects ?? obligation.requiredEffects, 'effects', true);
    if (effects.some(effect => !obligation.requiredEffects.includes(effect))) fail('Attempt cannot add unauthorized publication effects');
    const otherActive = state.releaseAttempts.find(a => active(a) && a.obligationId !== obligation.id);
    if (otherActive) fail('A different full release is in flight; keep this candidate pending');
    const overlapping = state.releaseAttempts.find(a => active(a) && a.obligationId === obligation.id && a.effects.some(effect => effects.includes(effect)));
    if (overlapping) fail(`Publication effects have an unresolved attempt ${overlapping.id}; reconcile before retry`);
    const adapter = input.adapter ?? (state.profile.publication.adapters ?? []).find(a => a.id === input.adapterId);
    if (!adapter?.id) fail('Publication needs a declared consumer adapter');
    const capabilityAssessment = assessConsumer(adapter);
    if (!capabilityAssessment.supported && (!capabilityAssessment.owner || !capabilityAssessment.nextAction)) fail('Blocked consumer must name follow-up owner and nextAction');
    if (input.expectedPredecessor === undefined) fail('Publication must state expectedPredecessor (null for first publication)');
    const predecessor = state.publishedTargets?.[adapter.targetId ?? adapter.id] ?? null;
    if (predecessor?.candidateId && predecessor.candidateId !== obligation.candidateId) {
      const advertised = findCandidate(state, predecessor.candidateId);
      if (Date.parse(advertised.createdAt) > Date.parse(candidate.createdAt)) fail('Cannot publish a stale candidate over a newer advertised delivery');
      if (predecessor.releaseVersion === input.releaseVersion && (!input.correctiveReplacement?.authorityRef || !input.correctiveReplacement?.reason)) fail('Same-version corrective replacement requires explicit predecessor authority and reason');
    }
    if (digest(predecessor) !== digest(input.expectedPredecessor)) fail('Stale publication predecessor; reconcile actual published target before retry');
    const attempt = { id: input.id ?? randomUUID(), obligationId: obligation.id, candidateId: obligation.candidateId,
      contentManifestDigest: obligation.contentManifestDigest, releaseVersion: input.releaseVersion, effects,
      adapterId: adapter.id, targetId: adapter.targetId ?? adapter.id, correlationId: randomUUID(),
      correctiveReplacement: clone(input.correctiveReplacement ?? null), expectedPredecessor: clone(input.expectedPredecessor), authorityRefs: clone(input.authorityRefs), capabilityAssessment,
      state: capabilityAssessment.supported ? 'intent' : 'capability-blocked', intentAt: timestamp(), externalIdentity: null, receipts: [] };
    if (state.releaseAttempts.some(a => a.id === attempt.id)) fail('Attempt ID exists; retry original command');
    if (capabilityAssessment.supported) {
      if (!nonempty(adapter.command) || !Array.isArray(adapter.args) || adapter.args.some(a => typeof a !== 'string') || !nonempty(adapter.cwd)) fail('Runnable consumer needs argument-array command and cwd');
      if (!adapter.args.includes('{request}')) fail('Consumer argument array must include {request} for its private correlated dispatch request');
      attempt.dispatchRequest = { command: adapter.command, args: clone(adapter.args), cwd: adapter.cwd, timeoutMs: adapter.timeoutMs ?? 30000, secretEnv: clone(adapter.secretEnv ?? []),
        request: { schemaVersion: 1, attemptId: attempt.id, correlationId: attempt.correlationId, candidateId: obligation.candidateId,
          contentManifestDigest: obligation.contentManifestDigest, sourceRefs: clone(candidate.sourceRefs), releaseVersion: input.releaseVersion,
          effects, expectedPredecessor: clone(input.expectedPredecessor), authorityRefs: clone(input.authorityRefs) } };
    }
    state.releaseAttempts.push(attempt); obligation.attemptIds.push(attempt.id); state.publicationDue = true;
    return { attempt, dispatch: attempt.dispatchRequest ?? null, dispatched: false };
  }
  const attempt = state.releaseAttempts.find(a => a.id === input.attemptId && a.obligationId === obligation.id);
  if (!attempt || attempt.candidateId !== obligation.candidateId) fail('Unknown or superseded publication attempt');
  if (action === 'dispatch-result') {
    if (!['intent', 'unknown'].includes(attempt.state)) fail('Only pending dispatch intent can accept a dispatch acknowledgement');
    if (input.correlationId !== attempt.correlationId) fail('Dispatch correlation mismatch');
    if (input.outcome === 'unknown') { attempt.state = 'unknown'; attempt.unknownReason = input.reason ?? 'Dispatch acknowledgement missing'; return attempt; }
    if (input.outcome === 'failed-before-dispatch') { attempt.state = 'failed'; attempt.finishedAt = timestamp(); return attempt; }
    if (!input.externalIdentity || !nonempty(input.evidenceRef)) fail('Dispatch acknowledgement needs remote identity and evidence');
    attempt.externalIdentity = clone(input.externalIdentity); attempt.dispatchEvidenceRef = input.evidenceRef;
    attempt.state = 'dispatched'; attempt.startedAt = timestamp(input.startedAt); return attempt;
  }
  if (action === 'reconcile') {
    if (input.correlationId !== attempt.correlationId) fail('Publication reconciliation correlation mismatch');
    if (attempt.state === 'capability-blocked') fail('An unsupported consumer cannot acquire publication credit');
    const incoming = (input.receipts ?? []).map(raw => validatePublicationReceipt(raw, obligation, attempt, candidate));
    for (const receipt of incoming) {
      const prior = state.releaseAttempts.flatMap(a => a.receipts ?? []).find(r => r.id === receipt.id);
      if (prior && prior.digest !== receipt.digest) fail('Immutable publication receipt ID changed content');
      if (incoming.some(other => other.id === receipt.id && other.digest !== receipt.digest)) fail('Conflicting duplicate receipt in publication request');
    }
    for (const receipt of incoming) {
      const prior = state.releaseAttempts.flatMap(a => a.receipts ?? []).find(r => r.id === receipt.id);
      if (prior) { if (prior.digest !== receipt.digest) fail('Immutable publication receipt ID changed content'); continue; }
      attempt.receipts.push(receipt); obligation.receiptIds.push(receipt.id);
    }
    const covered = attempt.receipts.map(r => r.effect);
    if (attempt.effects.every(effect => covered.includes(effect))) {
      attempt.state = 'succeeded'; attempt.finishedAt = timestamp(input.finishedAt);
    } else if (['failed', 'cancelled', 'unknown'].includes(input.outcome)) {
      if (!nonempty(input.evidenceRef)) fail('Failed/cancelled/unknown outcomes need evidenceRef');
      attempt.state = input.outcome; attempt.outcomeEvidenceRef = input.evidenceRef;
      if (input.outcome !== 'unknown') attempt.finishedAt = timestamp(input.finishedAt);
    }
    refresh(state, obligation);
    if (obligation.disposition === 'fulfilled') {
      state.publishedTargets ??= {}; state.publishedTargets[attempt.targetId] = { candidateId: obligation.candidateId, releaseVersion: attempt.releaseVersion, obligationId: obligation.id };
    }
    return { attempt, obligation, missing: obligation.missing };
  }
  fail('Unknown publication action');
}
