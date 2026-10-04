import { randomUUID } from 'node:crypto';
import { clone, digest, timestamp, candidateId, candidateDigest, iterationFor, fail } from './pipeline-data.mjs';

export const publicationMode = policy => policy.mode === 'every' ? 'count' : policy.mode;
export const unresolvedObligations = state => (state.obligations ?? []).filter(item => !['fulfilled', 'superseded'].includes(item.disposition));
const localSuccess = (state, candidate) => {
  const iteration = iterationFor(state, candidate);
  return iteration?.finishedAt && iteration.workOutcome === 'success' && iteration.deliveryCounted === true && !iteration.hookBlocked;
};
export function createObligation(state, candidate, { dueAt, reasons, policy, ordinal, opportunityId }) {
  const id = candidateId(candidate);
  const existing = (state.obligations ?? []).find(item => item.candidateId === id && item.disposition !== 'superseded');
  if (existing) return existing;
  const requiredEffects = [...(policy.platforms ?? []).map(platform => `artifact:${platform}`)];
  if (policy.requireMetadata) requiredEffects.push('metadata');
  if (policy.websiteUrl) requiredEffects.push('website');
  if (!requiredEffects.length) requiredEffects.push('publication');
  const obligation = { id: randomUUID(), candidateId: id, iterationId: candidate.iterationId,
    contentManifestDigest: candidateDigest(candidate), dueAt, createdAt: timestamp(), dueOrdinal: ordinal,
    reasons, policy: clone(policy), policyDigest: digest(policy), opportunityId,
    requiredEffects, coveredScopes: clone(candidate.scope ?? iterationFor(state, candidate)?.scope ?? {}),
    attemptIds: [], receiptIds: [], disposition: 'pending' };
  state.obligations ??= []; state.obligations.push(obligation); return obligation;
}

/** Called by ordinary commands/tick; never starts a timer or claims a release. */
export function evaluateOpportunities(state, input = {}) {
  state.opportunities ??= []; state.obligations ??= [];
  const now = timestamp(input.now), nowMs = Date.parse(now), policy = state.profile.publication;
  const mode = publicationMode(policy), policyDigest = digest(policy);
  const successes = Number.isInteger(state.successfulDeliveries) ? state.successfulDeliveries : (state.iterations ?? []).filter(i => i.deliveryCounted === true).length;
  state.publicationSchedule ??= { nextCount: policy.every ?? 2, lastInterval: -1, policyDigest };
  const schedule = state.publicationSchedule;
  // Configuration changes cannot clear obligations or move an already due count
  // threshold. A new future interval cadence starts at its explicit UTC anchor.
  if (schedule.policyDigest !== policyDigest) {
    schedule.nextCount = Math.min(schedule.nextCount ?? successes + policy.every, successes + (policy.every ?? 2));
    schedule.lastInterval = -1; schedule.policyDigest = policyDigest;
  }
  const countDue = ['count', 'either'].includes(mode) && successes >= schedule.nextCount;
  const intervalMs = (policy.intervalMinutes ?? 0) * 60_000;
  const anchorMs = Date.parse(policy.anchorUtc);
  const window = intervalMs > 0 && Number.isFinite(anchorMs) ? Math.floor((nowMs - anchorMs) / intervalMs) : -1;
  const intervalDue = ['interval', 'either'].includes(mode) && window >= 0 && window > schedule.lastInterval;
  const manualDue = input.manual === true;
  if (manualDue && !input.authorityRefs?.length) fail('Manual publication opportunity requires recorded authorityRefs');
  state.publicationDue = unresolvedObligations(state).length > 0;
  if (!countDue && !intervalDue && !manualDue) return { evaluatedAt: now, due: state.publicationDue, opportunity: null, obligations: unresolvedObligations(state) };
  const reasons = [...(countDue ? ['count'] : []), ...(intervalDue ? ['interval'] : []), ...(manualDue ? ['manual'] : [])];
  const key = digest({ policyDigest, count: countDue ? { threshold: schedule.nextCount, successes } : null, interval: intervalDue ? window : null, manual: manualDue ? input.commandId ?? input.candidateId ?? now : null });
  let opportunity = state.opportunities.find(item => item.key === key);
  if (opportunity && opportunity.disposition !== 'held-not-ready') return { evaluatedAt: now, due: state.publicationDue, opportunity, obligations: unresolvedObligations(state) };
  const candidates = (state.candidates ?? []).filter(c => !input.candidateId || candidateId(c) === input.candidateId);
  const candidate = candidates.filter(c => localSuccess(state, c)).at(-1);
  const ready = Boolean(candidate);
  const prior = state.obligations.filter(o => o.disposition !== 'superseded');
  const changed = ready && !prior.some(o => o.contentManifestDigest === candidateDigest(candidate));
  const active = state.activeIterationId || candidates.some(c => !localSuccess(state, c) && !prior.some(o => o.candidateId === candidateId(c)));
  if (!opportunity) {
    opportunity = { id: randomUUID(), key, observedAt: now, reasons, dueOrdinal: countDue ? schedule.nextCount : null,
      interval: intervalDue ? { first: schedule.lastInterval + 1, last: window, anchorUtc: policy.anchorUtc, intervalMinutes: policy.intervalMinutes } : null,
      policyDigest, disposition: 'held-not-ready', candidateId: null, obligationId: null };
    state.opportunities.push(opportunity);
  }
  if (changed) {
    const dueAt = intervalDue ? new Date(anchorMs + (schedule.lastInterval + 1) * intervalMs).toISOString() : now;
    const obligation = createObligation(state, candidate, { dueAt, reasons, policy, ordinal: successes, opportunityId: opportunity.id });
    opportunity.disposition = 'owed'; opportunity.candidateId = candidateId(candidate); opportunity.obligationId = obligation.id;
    if (countDue) schedule.nextCount = successes + policy.every;
    if (intervalDue) schedule.lastInterval = window;
  } else {
    opportunity.disposition = active || !ready ? 'held-not-ready' : 'skipped-no-change';
    opportunity.reason = active || !ready ? 'A new usable frozen delivery is not locally complete' : 'No unpublished changed candidate';
    if (intervalDue && opportunity.disposition === 'skipped-no-change') schedule.lastInterval = window;
  }
  state.publicationDue = unresolvedObligations(state).length > 0;
  return { evaluatedAt: now, due: state.publicationDue, opportunity, obligations: unresolvedObligations(state) };
}
