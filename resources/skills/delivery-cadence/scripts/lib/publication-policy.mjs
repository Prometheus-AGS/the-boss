import { mergeProfile } from './profile.mjs';
import { evidenceFile } from './children.mjs';

/** Explicitly defer publication targets without restarting an active delivery. */
export async function amendActivePublication(state, input) {
  const fail = message => { throw new Error(message); };
  const iteration = state.iterations.find(item => item.id === state.activeIterationId);
  const amendment = input.activePublication;
  if (!iteration || !['implementing', 'ready'].includes(iteration.status))
    fail('Publication target amendment requires an active unfinished delivery');
  if (!amendment?.authorityRef || typeof amendment.reason !== 'string' || !amendment.reason.trim())
    fail('Active publication amendment requires explicit authorityRef and reason');
  const patch = input.profile;
  if (!patch || Object.keys(patch).some(key => key !== 'publication') || !patch.publication ||
      Object.keys(patch.publication).some(key => !['platforms', 'procedure'].includes(key)))
    fail('Active configuration may only defer publication platforms and amend their procedure metadata');
  const platforms = patch.publication.platforms;
  const previous = iteration.profile.publication;
  if (!Array.isArray(platforms) || !platforms.length || new Set(platforms).size !== platforms.length ||
      platforms.some(platform => typeof platform !== 'string' || !previous.platforms?.includes(platform)))
    fail('Active publication platforms must be a nonempty subset of the current targets');
  if ((state.jobs ?? []).some(job => job.iterationId === iteration.id &&
      ['claimed', 'launching', 'running', 'cancelRequested', 'unknown'].includes(job.state)))
    fail('Reconcile the active or uncertain checkpoint before amending its publication targets');
  if ((state.releaseAttempts ?? []).some(attempt =>
      ['intent', 'dispatched', 'running', 'unknown'].includes(attempt.state)))
    fail('Reconcile the active or uncertain publication before amending its targets');
  if (patch.publication.procedure) {
    const procedure = patch.publication.procedure;
    if (Object.keys(procedure).some(key => !['platforms', 'requiredInputs', 'completion'].includes(key)))
      fail('Active amendment cannot change publication executable, repository or ownership');
    if (procedure.platforms !== undefined && procedure.platforms !== platforms.join(','))
      fail('Publication procedure platforms must match the selected targets');
    if (procedure.requiredInputs !== undefined && (!Array.isArray(procedure.requiredInputs) ||
        procedure.requiredInputs.some(value => !previous.procedure?.requiredInputs?.includes(value))))
      fail('Active procedure may only retain existing required input names');
    if (procedure.completion !== undefined && (typeof procedure.completion !== 'string' || !procedure.completion.trim()))
      fail('Publication completion metadata must remain explicit');
  }
  const authority = await evidenceFile(amendment.authorityRef);
  const after = { ...previous, ...patch.publication,
    ...(patch.publication.procedure ? { procedure: { ...previous.procedure, ...patch.publication.procedure } } : {}) };
  const event = { recordedAt: new Date().toISOString(), authorityRef: amendment.authorityRef,
    authorityEvidence: { path: authority.path, sha256: authority.sha256 }, reason: amendment.reason.trim(),
    before: structuredClone(previous), after: structuredClone(after),
    deferredPlatforms: previous.platforms.filter(platform => !platforms.includes(platform)),
    priorCandidateId: iteration.candidateId ?? null, historicalObligationsChanged: false };
  state.profile = mergeProfile(state.profile, { publication: after });
  state.profileRevision++;
  iteration.profile = mergeProfile(iteration.profile, { publication: after });
  iteration.publicationPolicyRevisions ??= [];
  iteration.publicationPolicyRevisions.push(event);
  return { iterationId: iteration.id, profileRevision: state.profileRevision, amendment: event,
    requiresCandidateFreeze: true, successfulDeliveries: state.successfulDeliveries,
    startedAt: iteration.startedAt, publicationDebtPreserved: true };
}
