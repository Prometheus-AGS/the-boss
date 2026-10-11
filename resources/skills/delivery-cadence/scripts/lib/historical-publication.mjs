import { clone, digest, fail, findCandidate, nonempty, strings, timestamp } from './pipeline-data.mjs';
import { unresolvedObligations } from './opportunities.mjs';
import { historicalEvidence, preserveHistoricalFiles, validateHistoricalScope } from './historical-publication-evidence.mjs';

export function assertHistoricalTarget(predecessor, release) {
  const version = value => {
    if (!/^\d+\.\d+\.\d+$/.test(value ?? '')) fail('Historical target ordering requires an explicit numeric major.minor.patch version');
    return value.split('.').map(BigInt);
  };
  const next = version(release.version);
  if (!predecessor) return;
  const previous = version(predecessor.releaseVersion);
  const different = next.findIndex((value, index) => value !== previous[index]);
  if (different >= 0 && next[different] < previous[different]) fail('Cannot move a published target backwards');
  if (predecessor.publishedAt && Date.parse(release.publishedAt) < Date.parse(predecessor.publishedAt)) fail('Cannot move a published target to an earlier external publication');
  if (different === -1 && predecessor.externalReleaseId && predecessor.externalReleaseId !== release.id) fail('Conflicting historical release identity for the advertised version');
}

/** Called only inside the normal locked, journaled command transaction. Never dispatches. */
export async function adoptHistoricalPublication(root, state, input) {
  strings(input.authorityRefs, 'historical adoption authorityRefs', true);
  if (!nonempty(input.reason)) fail('Historical adoption requires an explicit reason');
  const loaded = await historicalEvidence(input), { release, evidence, receipts, mappings } = loaded;
  const predecessor = state.publishedTargets?.[release.targetId] ?? null;
  if (input.expectedPredecessor === undefined || digest(predecessor) !== digest(input.expectedPredecessor)) fail('Stale historical publication predecessor; inspect actual target before retry');
  assertHistoricalTarget(predecessor, release);
  if ((state.releaseAttempts ?? []).some(a => a.targetId === release.targetId && ['intent', 'dispatched', 'running', 'unknown'].includes(a.state))) fail('Reconcile in-flight publication before historical target adoption');
  const content = { release, evidence, receipts }, releaseDigest = digest(content);
  const previousRelease = (state.externalReleases ?? []).find(r => r.id === release.id);
  if (previousRelease && previousRelease.digest !== releaseDigest) fail('Immutable historical release ID changed content');
  const links = [];
  for (const mapping of mappings) {
    const obligation = (state.obligations ?? []).find(o => o.id === mapping.obligationId);
    if (!obligation) fail('Unknown historical publication obligation: ' + mapping.obligationId);
    if (obligation.disposition === 'superseded') fail('Cannot attach historical credit to a superseded obligation');
    const candidate = findCandidate(state, obligation.candidateId);
    validateHistoricalScope(mapping, obligation, candidate, receipts);
    if ((state.releaseAttempts ?? []).some(a => a.obligationId === obligation.id && ['intent', 'dispatched', 'running', 'unknown'].includes(a.state))) fail('Reconcile unresolved obligation attempt before historical linking');
    const identity = { externalReleaseId: release.id, releaseDigest, obligationId: obligation.id, candidateId: obligation.candidateId,
      contentManifestDigest: obligation.contentManifestDigest, evidence: mapping.evidence, proof: mapping.proof };
    const linkDigest = digest(identity), id = digest({ externalReleaseId: release.id, obligationId: obligation.id });
    const prior = (state.publicationLinks ?? []).find(link => link.id === id);
    if (prior && prior.digest !== linkDigest) fail('Immutable historical obligation link changed evidence');
    if (obligation.disposition === 'fulfilled' && !prior) fail('Publication debt is already fulfilled by independent evidence');
    links.push(prior ?? { ...identity, id, digest: linkDigest, effects: obligation.requiredEffects.slice(),
      authorityRefs: clone(input.authorityRefs), reason: input.reason, publishedAt: release.publishedAt, recordedAt: timestamp() });
  }
  const preserved = await preserveHistoricalFiles(root, loaded.files);
  state.externalReleases ??= []; state.publicationLinks ??= [];
  const externalRelease = previousRelease ?? { ...content, id: release.id, digest: releaseDigest,
    authorityRefs: clone(input.authorityRefs), reason: input.reason, preservedEvidence: preserved, recordedAt: timestamp(),
    countedAsDelivery: false, countedCompletions: false };
  if (!previousRelease) state.externalReleases.push(externalRelease);
  for (const link of links) {
    if (!state.publicationLinks.some(prior => prior.id === link.id)) state.publicationLinks.push({ ...link, preservedEvidence: preserved });
    const obligation = state.obligations.find(o => o.id === link.obligationId);
    obligation.historicalLinkIds ??= [];
    if (!obligation.historicalLinkIds.includes(link.id)) obligation.historicalLinkIds.push(link.id);
    obligation.disposition = 'fulfilled'; obligation.missing = [];
    obligation.fulfilledAt ??= link.recordedAt;
  }
  state.publishedTargets ??= {};
  state.publishedTargets[release.targetId] = { externalReleaseId: release.id, releaseVersion: release.version, publishedAt: release.publishedAt };
  state.publicationDue = unresolvedObligations(state).length > 0;
  return { externalRelease, links, publicationDue: state.publicationDue, successfulDeliveries: state.successfulDeliveries,
    dispatched: false, countedAsDelivery: false, acceptanceIndependent: true };
}
