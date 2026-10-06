// Reports derive only from persisted observations. Missing coverage is not active work.
import { publicationStatus } from './delivery-contract.mjs';
import { pipelineReport } from './pipeline-report.mjs';
const dimensions = ['tasks', 'changes', 'phases'];
const timingKinds = ['planning', 'implementation', 'build', 'run', 'feature-operation', 'rework', 'coordination', 'resource-wait', 'publication', 'human-wait', 'hook'];
const workKinds = timingKinds.filter(kind => !['human-wait', 'resource-wait'].includes(kind));
const coverageThreshold = 0.99;
const ids = (items = []) => [...new Set(items.map(item => typeof item === 'string' ? item : item?.canonicalId ?? item?.id).filter(Boolean))];
const dimensionMap = fn => Object.fromEntries(dimensions.map(kind => [kind, fn(kind)]));
const numericTime = value => typeof value === 'string' ? Date.parse(value) : NaN;

function union(intervals) {
  const sorted = intervals.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((a, b) => a[0] - b[0]);
  let total = 0, start, end;
  for (const [a, b] of sorted) {
    if (end === undefined) { start = a; end = b; }
    else if (a <= end) end = Math.max(end, b);
    else { total += end - start; start = a; end = b; }
  }
  return (total + (end === undefined ? 0 : end - start)) / 60000;
}

function clipped(spans, iteration, kinds = null) {
  const start = numericTime(iteration.firstWorkAt ?? iteration.startedAt), end = numericTime(iteration.finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  return spans.filter(span => !kinds || kinds.includes(span.kind)).map(span => [
    Math.max(start, numericTime(span.startedAt)), Math.min(end, numericTime(span.finishedAt))
  ]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a);
}

function observations(iteration, publications = []) {
  const receipts = [...(iteration.featureOperationReceipts ?? []), ...(iteration.operationReceipts ?? [])];
  const artifactTiming = [...(iteration.artifacts ?? []), ...(iteration.checkpoints ?? []).flatMap(item => item.artifacts ?? [])]
    .filter(item => timingKinds.includes(item.kind) && (item.startedAt || item.finishedAt));
  if (iteration.featureOperationReceipt) receipts.push(iteration.featureOperationReceipt);
  return [...(iteration.spans ?? []), ...(iteration.activities ?? []).filter(item => item.finishedAt),
    ...(iteration.checkpoints ?? []).map(item => ({ ...item, kind: item.kind ?? 'checkpoint' })),
    ...receipts.map(item => ({ ...item, kind: 'feature-operation' })), ...artifactTiming,
    ...publications.filter(item => item.iterationId === iteration.id).map(item => ({
      kind: 'publication', startedAt: item.startedAt ?? item.receipt?.startedAt,
      finishedAt: item.finishedAt ?? item.receipt?.finishedAt,
    }))];
}

// New events are authoritative. Legacy snapshots are included only when that record has no event.
function completionTimeline(iteration) {
  const events = (iteration.completionEvents ?? []).filter(event => dimensions.includes(event.kind) && event.id && ['complete', 'reopen'].includes(event.action))
    .map(event => ({ ...event, occurredAt: event.occurredAt ?? event.recordedAt ?? null, iterationId: iteration.id }));
  const addSnapshot = (completion, at, childId = null) => {
    for (const kind of dimensions) for (const id of ids(completion?.[kind])) {
      if (!events.some(event => event.kind === kind && event.id === id && event.action === 'complete' && (event.childId ?? null) === childId)) {
        events.push({ kind, id, action: 'complete', occurredAt: at ?? null, childId, iterationId: iteration.id, legacySnapshot: true });
      }
    }
  };
  addSnapshot(iteration.completion, iteration.workEvent?.occurredAt ?? iteration.finishedAt);
  for (const child of iteration.children ?? []) {
    if (child.outcome === 'success' && child.returnedAt) addSnapshot(child.completion, child.returnedAt, child.id);
  }
  for (const item of iteration.reopened ?? []) {
    if (dimensions.includes(item.kind) && item.id && !events.some(event => event.kind === item.kind && event.id === item.id && event.action === 'reopen')) {
      events.push({ ...item, action: 'reopen', occurredAt: item.occurredAt ?? item.recordedAt ?? null, iterationId: iteration.id, legacySnapshot: true });
    }
  }
  return events;
}

function accounting(events) {
  const gross = dimensionMap(kind => ids(events.filter(event => event.kind === kind && event.action === 'complete')));
  const reopened = dimensionMap(kind => ids(events.filter(event => event.kind === kind && event.action === 'reopen')));
  const net = dimensionMap(() => []), unresolved = dimensionMap(() => []), uncertain = [];
  for (const kind of dimensions) for (const id of ids(events.filter(event => event.kind === kind))) {
    const history = events.filter(event => event.kind === kind && event.id === id);
    const hasReopen = history.some(event => event.action === 'reopen');
    const known = history.filter(event => Number.isFinite(numericTime(event.occurredAt))).sort((a, b) => numericTime(a.occurredAt) - numericTime(b.occurredAt));
    const ambiguous = hasReopen && (known.length !== history.length || known.some((event, index) => index && event.action !== known[index - 1].action && event.occurredAt === known[index - 1].occurredAt));
    if (ambiguous) uncertain.push({ kind, id, reason: 'Completion and reopening cannot be ordered from available timestamps' });
    const complete = !hasReopen || (!ambiguous && known.at(-1)?.action === 'complete');
    (complete ? net[kind] : unresolved[kind]).push(id);
  }
  return { gross, reopened, net, unresolved, uncertain,
    counts: Object.fromEntries(['gross', 'reopened', 'net'].map(name => [name, dimensionMap(kind => ({ gross, reopened, net })[name][kind].length)])) };
}

export function iterationReport(iteration, context = {}) {
  const spans = observations(iteration, context.publications);
  const start = numericTime(iteration.firstWorkAt ?? iteration.startedAt), end = numericTime(iteration.finishedAt);
  const elapsed = Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 60000 : null;
  const observed = elapsed === null ? null : union(clipped(spans, iteration));
  const coverage = elapsed > 0 ? Math.min(1, observed / elapsed) : null;
  const openActivities = (iteration.activities ?? []).filter(item => !item.finishedAt);
  const invalidSpans = spans.filter(span => !Number.isFinite(numericTime(span.startedAt)) || !Number.isFinite(numericTime(span.finishedAt)) || numericTime(span.finishedAt) < numericTime(span.startedAt)).length;
  const eligible = coverage !== null && coverage >= coverageThreshold && !invalidSpans && !openActivities.length;
  const duration = kinds => spans.some(span => kinds.includes(span.kind) && Number.isFinite(numericTime(span.finishedAt))) && elapsed !== null ? union(clipped(spans, iteration, kinds)) : null;
  const durations = Object.fromEntries(timingKinds.map(kind => [kind, duration([kind])]));
  // Publication can finish after finalization. Retain its measured cost without
  // extending the immutable iteration clock or mixing it into overlap shares.
  const publicationIntervals = spans.filter(span => span.kind === 'publication').map(span =>
    [numericTime(span.startedAt), numericTime(span.finishedAt)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a);
  const publicationMinutes = publicationIntervals.length ? union(publicationIntervals) : null;
  const observedWork = duration(workKinds);
  const active = coverage === 1 && !invalidSpans && !openActivities.length ? observedWork : null;
  const timeline = completionTimeline(iteration), progress = accounting(timeline);
  const selected = dimensionMap(kind => ids([...(iteration.scope?.[kind] ?? []), ...(iteration.children ?? []).flatMap(child => child.scope?.[kind] ?? [])]));
  const carryover = dimensionMap(kind => selected[kind].filter(id => !progress.net[kind].includes(id)));
  const childSpans = (iteration.children ?? []).map(child => ({ startedAt: child.enteredAt, finishedAt: child.returnedAt }));
  const attempts = iteration.checkpoints ?? [];
  const buildGroups = new Map();
  for (const receipt of attempts.filter(item => item.kind === 'build')) buildGroups.set(receipt.id, [...(buildGroups.get(receipt.id) ?? []), receipt]);
  const repeatedBuilds = [...buildGroups.values()].flatMap(items => items.slice(1).map(item => ({
    id: item.id, attemptId: item.attemptId, status: item.status, reason: item.repeatReason ?? item.reason ?? null,
  })));
  return {
    schemaVersion: iteration.contractVersion >= 3 ? 3 : 2, id: iteration.id, index: iteration.index, status: iteration.status, workOutcome: iteration.workOutcome,
    failureResolution: iteration.failureResolution ?? null,
    selected, completed: progress.net, carryover, counts: progress.counts.net, grossCompleted: progress.gross,
    grossCounts: progress.counts.gross, reopenedCounts: progress.counts.reopened, netCounts: progress.counts.net,
    unresolvedReopened: progress.unresolved, uncertainCompletionOrder: progress.uncertain, completionTimeline: timeline,
    evidenceSource: iteration.canonicalEvidence ? 'referenced-canonical-receipts' : 'operator-recorded',
    canonicalReceipts: [iteration.canonicalEvidence, ...(iteration.children ?? []).map(child => child.evidence)].filter(Boolean),
    outcomes: iteration.scope?.outcomes ?? [], deliveryClass: iteration.scope?.deliveryClass ?? null, owners: iteration.scope?.owners ?? null,
    firstWorkAt: iteration.firstWorkAt ?? iteration.startedAt, promotedAt: iteration.promotedAt ?? null, workAheadId: iteration.workAheadId ?? null,
    sourceRefs: iteration.sourceRefs, artifacts: iteration.artifacts ?? [], hookResults: iteration.hookResults ?? [],
    minutes: { elapsed, active, observed, observedWork, observedWaiting: duration(['human-wait', 'resource-wait']),
      unattributed: elapsed === null ? null : Math.max(0, elapsed - observed), ...durations,
      publicationWithinIteration: durations.publication, publication: publicationMinutes,
      childInterruptions: elapsed !== null && childSpans.length ? union(clipped(childSpans, iteration)) : null },
    timing: { coverage, requiredCoverage: coverageThreshold, optimizationEligible: eligible, invalidSpans, openActivities },
    buildRunShare: eligible && elapsed > 0 ? union(clipped(spans, iteration, ['build', 'run', 'feature-operation'])) / elapsed : null,
    resourceWaitShare: eligible && elapsed > 0 && durations['resource-wait'] !== null ? durations['resource-wait'] / elapsed : null,
    publicationShare: eligible && elapsed > 0 && durations.publication !== null ? durations.publication / elapsed : null,
    childState: { activeChildIds: iteration.childStack ?? [], unresolved: Boolean(iteration.childStack?.length || iteration.childReconciliation?.blocked), reconciliation: iteration.childReconciliation ?? null },
    children: (iteration.children ?? []).map(child => ({ id: child.id, phaseId: child.phaseId, owner: child.owner,
      outcome: child.outcome, status: child.status, reason: child.reason, enteredAt: child.enteredAt, returnedAt: child.returnedAt,
      completion: child.completion ?? null, parentChildId: child.parentChildId ?? null })),
    learning: { delivered: iteration.workOutcome === 'success' ? iteration.scope?.outcomes ?? [] : [], carryover,
      repeatedBuilds, concurrencyEnforcement: 'Agent limits are harness instructions; physical build/output reservations protect cooperating runs only',
      recommendation: context.recommendation ?? null,
      evidenceStatement: context.recommendation ? 'Heuristic recommendation; evaluate subsequent comparable deliveries.' : 'Insufficient comparable evidence or no supported change within approved bounds.' },
    costs: iteration.costs ?? null, reopened: iteration.reopened ?? [],
  };
}

function signature(iteration, omitSetting = null) {
  const profile = iteration.profile;
  if (!profile || !iteration.scope?.deliveryClass) return null;
  return JSON.stringify({ repositories: (iteration.sourceRefs ?? []).map(ref => ref.repository).sort(),
    checks: (profile.checkpoints ?? []).map(step => ({ id: step.id, kind: step.kind, command: step.command, args: step.args, cwd: step.cwd, required: step.required !== false })).sort((a, b) => a.id.localeCompare(b.id)),
    featureProcedure: iteration.featureOperation?.procedureId ?? iteration.featureOperation?.id ?? null,
    featureEvidence: iteration.featureOperation?.evidenceLevel ?? null, featureTarget: iteration.featureOperation?.target ?? null,
    deliveryClass: iteration.scope.deliveryClass, iterationMinutes: omitSetting === 'iterationMinutes' ? null : profile.iterationMinutes,
    maxImplementers: omitSetting === 'maxImplementers' ? null : profile.team?.maxImplementers,
    publicationEvery: omitSetting === 'publicationEvery' ? null : profile.publication?.every,
  });
}

function publicationObservations(state) {
  return [...(state.publications ?? []), ...(state.releaseAttempts ?? []).map(attempt => ({
    iterationId: (state.candidates ?? []).find(candidate => (candidate.id ?? candidate.candidateId) === attempt.candidateId)?.iterationId,
    startedAt: attempt.startedAt, finishedAt: attempt.finishedAt,
  }))];
}

function samples(state) {
  const minimum = state.profile?.optimization?.minimumSamples ?? 3;
  const finished = (state.iterations ?? []).filter(iteration => iteration.finishedAt && iteration.workOutcome === 'success');
  const last = finished.at(-1), contract = last ? signature(last) : null;
  if (!contract) return [];
  const matching = finished.filter(iteration => signature(iteration) === contract && iterationReport(iteration, { publications: publicationObservations(state) }).timing.optimizationEligible);
  if (matching.length < minimum || matching.at(-1)?.id !== last.id) return [];
  return matching.slice(-minimum);
}

export function optimize(state) {
  const profile = state.profile;
  if (!profile || profile.optimization?.mode === 'off') return null;
  const done = samples(state);
  if (!done.length) return null;
  const recent = done.map(iteration => iterationReport(iteration, { publications: publicationObservations(state) }));
  const bounds = profile.optimization?.bounds ?? {};
  const basisIterationIds = done.map(iteration => iteration.id);
  const requiredHits = Math.ceil(done.length * 2 / 3);
  const suggest = (setting, value, reason, expectedEffect, metric) => {
    // One setting at a time: allow enough later deliveries to evaluate an applied change.
    const pending = (state.recommendations ?? []).filter(item => item.applied).at(-1);
    if (pending && done.filter(iteration => Date.parse(iteration.startedAt) > Date.parse(pending.recordedAt)).length < done.length) return null;
    const values = recent.map(item => item[metric]).filter(Number.isFinite);
    return { setting, value, reason, expectedEffect, basisIterationIds, heuristic: true,
      evidence: { minimumSamples: done.length, timingCoverageThreshold: coverageThreshold, metric, baseline: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null },
      followup: { status: 'pending', metric, expectedDirection: 'decrease', minimumSamples: done.length, outcome: null } };
  };
  if (recent.filter(item => item.resourceWaitShare > 0.2).length >= requiredHits && profile.team.maxImplementers > (bounds.maxImplementers?.[0] ?? 1)) {
    return suggest('maxImplementers', profile.team.maxImplementers - 1, `Resource blocking exceeded 20% in ${requiredHits} of ${done.length} comparable deliveries.`, 'Reduce measured resource waiting without reducing usable delivered scope.', 'resourceWaitShare');
  }
  if (profile.optimization.mode !== 'automatic' && recent.filter(item => item.buildRunShare > 0.35).length >= requiredHits && profile.iterationMinutes + 30 <= (bounds.iterationMinutes?.[1] ?? profile.iterationMinutes)) {
    return suggest('iterationMinutes', profile.iterationMinutes + 30, `Build and operation exceeded 35% in ${requiredHits} of ${done.length} comparable deliveries.`, 'Amortize required build costs across a larger independently usable increment.', 'buildRunShare');
  }
  if (profile.optimization.mode !== 'automatic' && ['every', 'count'].includes(profile.publication.mode) && recent.filter(item => item.publicationShare > 0.35).length >= requiredHits && profile.publication.every < (bounds.publicationEvery?.[1] ?? profile.publication.every)) {
    return suggest('publicationEvery', profile.publication.every + 1, `Publication exceeded 35% in ${requiredHits} of ${done.length} comparable deliveries.`, 'Reduce blocking publication overhead while preserving required local gates and existing publication debt.', 'publicationShare');
  }
  return null;
}

function followups(state) {
  return (state.recommendations ?? []).map(recommendation => {
    const minimum = recommendation.followup?.minimumSamples ?? state.profile?.optimization?.minimumSamples ?? 3;
    const metric = recommendation.followup?.metric;
    const later = (state.iterations ?? []).filter(iteration => recommendation.applied && Date.parse(iteration.startedAt) > Date.parse(recommendation.recordedAt) && iteration.workOutcome === 'success');
    const basis = (state.iterations ?? []).find(iteration => recommendation.basisIterationIds?.includes(iteration.id));
    const contract = basis ? signature(basis, recommendation.setting) : null;
    const eligible = later.filter(iteration => contract && signature(iteration, recommendation.setting) === contract).map(iteration => iterationReport(iteration, { publications: publicationObservations(state) }))
      .filter(report => report.timing.optimizationEligible && Number.isFinite(report[metric])).slice(0, minimum);
    const observed = eligible.length === minimum ? eligible.reduce((sum, report) => sum + report[metric], 0) / minimum : null;
    const baseline = recommendation.evidence?.baseline;
    return { ...recommendation, followup: { ...recommendation.followup,
      status: observed === null ? 'pending' : 'observed', basisIterationIds: eligible.map(report => report.id),
      outcome: observed === null ? null : { baseline, observed, difference: Number.isFinite(baseline) ? observed - baseline : null,
        interpretation: 'Observed association, not proof that the tuning change caused it.' } } };
  });
}

export function makeReport(state) {
  const recommendation = optimize(state);
  const iterations = (state.iterations ?? []).map(iteration => iterationReport(iteration, {
    publications: publicationObservations(state), recommendation: iteration.id === state.iterations.at(-1)?.id ? recommendation : null,
  }));
  const progress = accounting(iterations.flatMap(iteration => iteration.completionTimeline));
  return {
    schemaVersion: state.schemaVersion >= 3 ? 3 : 2, runId: state.runId, profile: state.profile?.name,
    iterationMinutes: state.profile?.iterationMinutes, iterations,
    pipeline: pipelineReport(state),
    uniqueCompleted: progress.counts.net, grossCompleted: progress.counts.gross, reopened: progress.counts.reopened,
    netCompleted: progress.counts.net, canonicalIds: { gross: progress.gross, reopened: progress.reopened, net: progress.net },
    uncertainCompletionOrder: progress.uncertain, historicalChildren: state.historicalChildren ?? [],
    publications: state.publications ?? [], publicationDue: state.publicationDue ?? false, publicationStatus: publicationStatus(state),
    recommendation, optimizationAssessment: recommendation ? 'A bounded heuristic change is supported; measure its subsequent outcome.' : 'Insufficient comparable evidence or no supported change within approved bounds.', recommendationEvaluations: followups(state),
    limitations: ['Counts are distinct within each dimension; never add tasks, changes and phases.',
      'Canonical receipt references are provenance, not independent validation of the KBD backend.',
      'Unknown timing remains unattributed; observed work is not inferred from elapsed time.',
      'Timing shares use iteration wall time and require at least 99% observed coverage; parallel effort is not wall-clock duration.',
      'Publication time includes trustworthy attached intervals outside iteration bounds; publicationWithinIteration alone contributes to wall-time shares.',
      'Historical child links are provenance only and contribute no duplicate completion credit.',
      'Parallel work-ahead and delivery intervals are unioned; task counts and overlap alone do not establish increased velocity.'],
  };
}
