// Delivery evidence stays separate from canonical work completion.
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const time = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function validateFeatureOperation(value, scope) {
  if (!value || typeof value !== 'object') throw new Error('start requires a featureOperation describing the delivered function');
  for (const key of ['id', 'outcome', 'procedure', 'checkpointId']) {
    if (!text(value[key])) throw new Error(`featureOperation.${key} must be a nonempty string`);
  }
  if (!scope?.outcomes?.includes(value.outcome)) throw new Error('featureOperation.outcome must identify one selected user-visible outcome');
  return Object.fromEntries(['id', 'outcome', 'procedure', 'checkpointId'].map((key) => [key, value[key]]));
}

export function checkpointPurpose(iteration, step) {
  if (step.kind === 'build') return 'build';
  return iteration.featureOperation?.checkpointId === step.id ? 'feature' : (step.purpose ?? 'launch');
}

export function validateDelivery(iteration) {
  const steps = iteration.profile.checkpoints;
  const applicable = (step) => {
    const receipt = iteration.checkpoints.filter((item) => item.id === step.id).at(-1);
    return receipt?.status === 'success' && !receipt.invalidatedAt && same(receipt.sourceRefs, iteration.sourceRefs) ? receipt : null;
  };
  const missing = steps.filter((step) => step.required !== false && !applicable(step));
  if (missing.length) throw new Error(`Required build/run receipts missing: ${missing.map((step) => step.id).join(', ')}`);
  if ((iteration.contractVersion ?? 1) < 2) return { contractVersion: 1, featureOperation: 'unknown' };
  const feature = validateFeatureOperation(iteration.featureOperation, iteration.scope);
  const featureStep = steps.find((step) => step.id === feature.checkpointId && step.kind === 'run');
  if (!featureStep) throw new Error('The selected feature operation requires its own configured run checkpoint');
  const launch = steps.filter((step) => step.kind === 'run' && step.id !== feature.checkpointId && checkpointPurpose(iteration, step) === 'launch');
  if (!launch.length || !launch.some(applicable)) throw new Error('Successful delivery requires separate source-bound launch evidence');
  const receipt = applicable(featureStep);
  if (!receipt || receipt.purpose !== 'feature' || receipt.featureOperationId !== feature.id) {
    throw new Error('Baseline launch does not prove the delivered function; execute its feature-operation checkpoint');
  }
  return { contractVersion: 2, launch: 'passed', featureOperation: 'passed', featureOperationId: feature.id };
}

// Imported timing is evidence only when the receipt explicitly identifies an interval.
export function evidenceInterval(receipt, kind) {
  const startedAt = receipt.startedAt, finishedAt = receipt.finishedAt;
  if (!time(startedAt) || !time(finishedAt) || Date.parse(finishedAt) < Date.parse(startedAt)) return null;
  return { kind, startedAt, finishedAt, evidencePath: receipt.path ?? receipt.evidencePath ?? null, evidenceSha256: receipt.sha256 ?? null };
}

export function publicationRequirements(receipt, artifacts, sourceRefs, profile) {
  const policy = profile.publication ?? {};
  const missing = [];
  const version = receipt?.version;
  if (!version || !same(receipt?.sourceRefs, sourceRefs)) missing.push('version-and-frozen-sources');
  for (const platform of policy.platforms ?? []) {
    const artifact = artifacts.find((item) => item.platform === platform);
    const published = receipt?.artifacts?.find((item) => artifact && item.platform === platform && item.sha256 === artifact.sha256 && item.size === artifact.size && item.url === artifact.url);
    if (!artifact || !published?.url || !time(published.verifiedAt)) missing.push(`artifact:${platform}`);
  }
  if (policy.websiteUrl) {
    const site = receipt?.website;
    if (site?.url !== policy.websiteUrl || site?.version !== version || !time(site?.verifiedAt)) missing.push('website');
    for (const artifact of artifacts) {
      if (!site?.links?.some((link) => link.platform === artifact.platform && link.url === artifact.url)) missing.push(`website-link:${artifact.platform}`);
    }
  }
  if (policy.requireMetadata) {
    const metadata = receipt?.metadata;
    if (!metadata?.url || metadata.version !== version || !same(metadata.sourceRefs, sourceRefs) || !time(metadata.verifiedAt)) missing.push('release-metadata');
  }
  for (const platform of policy.acceptancePlatforms ?? []) {
    const accepted = receipt?.acceptance?.find((item) => item.platform === platform && item.status === 'passed' && time(item.verifiedAt) && (item.evidencePath || item.url));
    if (!accepted || !artifacts.some((item) => item.platform === platform && item.sha256 === accepted.sha256)) missing.push(`installed-acceptance:${platform}`);
  }
  return [...new Set(missing)];
}

export function publicationStatus(state) {
  const latest = [...(state.iterations ?? [])].reverse().find((item) => item.workOutcome === 'success');
  const policy = state.profile;
  const publication = [...(state.publications ?? [])].reverse().find((item) => item.iterationId === latest?.id && item.outcome === 'success' && !item.hookBlocked && item.hookResults);
  const missing = latest ? publicationRequirements(publication?.receipt, publication?.artifacts ?? [], latest.sourceRefs, policy) : ['successful-local-delivery'];
  const latestAttempt = [...(state.publications ?? [])].reverse().find((item) => item.iterationId === latest?.id);
  if (latestAttempt?.hookBlocked) missing.push('required-publication-hooks');
  return {
    due: Boolean(state.publicationDue), latestIterationId: latest?.id ?? null,
    reason: state.publicationDue ? 'The scheduled publication requires evidence for the latest successful delivery.' : 'No scheduled publication debt is recorded.',
    missing: [...new Set(missing)], publicationId: publication?.id ?? null,
    metadata: publication?.receipt?.metadata ? 'recorded' : 'unproven',
    installedAcceptance: (publication?.receipt?.acceptance ?? []).filter((item) => item.status === 'passed').map((item) => item.platform),
    acceptanceRequired: policy.publication?.acceptancePlatforms ?? []
  };
}
