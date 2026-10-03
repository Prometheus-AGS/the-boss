// Observed intervals only; source admission time is not evidence of activity.
function mergedMinutes(intervals) {
  const valid = intervals.map(([a, b]) => [Date.parse(a), Date.parse(b)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const value of valid) {
    const last = merged.at(-1);
    if (last && value[0] <= last[1]) last[1] = Math.max(last[1], value[1]);
    else merged.push([...value]);
  }
  return valid.length ? merged.reduce((sum, [a, b]) => sum + b - a, 0) / 60000 : null;
}
export function pipelineReport(state) {
  const iterations = state.iterations ?? [], workAhead = state.workAhead ?? [], attempts = state.releaseAttempts ?? [];
  const finalized = iterations.filter(i => i.finishedAt).map(i => [i.firstWorkAt ?? i.startedAt, i.finishedAt]);
  const observed = iterations.flatMap(i => [...(i.activities ?? []), ...(i.spans ?? []), ...(i.checkpoints ?? [])])
    .concat(workAhead.flatMap(w => w.activities ?? []), attempts)
    .filter(span => span.startedAt && span.finishedAt).map(span => [span.startedAt, span.finishedAt]);
  return {
    wallMinutesUnion: mergedMinutes(finalized), observedMinutesUnion: mergedMinutes(observed),
    workAhead: workAhead.map(item => ({ id: item.id, state: item.state, owner: item.owner, scope: item.scope,
      admittedAt: item.admittedAt, firstWorkAt: item.firstWorkAt, promotedAt: item.promotedAt ?? null,
      promotionDelayMinutes: item.firstWorkAt && item.promotedAt ? Math.max(0, (Date.parse(item.promotedAt) - Date.parse(item.firstWorkAt)) / 60000) : null,
      observedMinutes: mergedMinutes((item.activities ?? []).map(a => [a.startedAt, a.finishedAt])),
      blockers: item.blockers, repairedBaseRef: item.repairedBaseRef })),
    jobs: (state.jobs ?? []).map(job => ({ id: job.id, candidateId: job.candidateId, kind: job.kind, state: job.state,
      resourceKeys: job.resourceKeys, claimedAt: job.claimedAt, startedAt: job.startedAt, endedAt: job.endedAt ?? job.finishedAt,
      reason: job.repeatReason ?? job.reason ?? null })),
    opportunities: state.opportunities ?? [],
    releaseAttempts: attempts.map(attempt => ({ id: attempt.id, obligationId: attempt.obligationId, candidateId: attempt.candidateId,
      state: attempt.state, effects: attempt.effects, capabilityAssessment: attempt.capabilityAssessment,
      startedAt: attempt.startedAt ?? null, finishedAt: attempt.finishedAt ?? null,
      platformReceipts: (attempt.receipts ?? []).filter(r => r.effect.startsWith('artifact:')).map(r => ({ platform: r.platform, version: r.version, sha256: r.sha256, url: r.url })),
      metadata: (attempt.receipts ?? []).filter(r => r.effect === 'metadata'), site: (attempt.receipts ?? []).filter(r => r.effect === 'website') })),
    installedAcceptance: state.installedAcceptance ?? [],
    velocityAssessment: 'No causal velocity claim. Compare at least the configured minimum of comparable, adequately measured usable deliveries.',
  };
}
