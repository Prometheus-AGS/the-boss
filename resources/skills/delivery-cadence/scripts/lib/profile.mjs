/** Portable cadence profiles. No harness-specific execution lives here. */
export const DEFAULT_PROFILE = {
  schemaVersion: 1, name: 'delivery-cadence', mode: 'standalone',
  iterationMinutes: 60, reviewEvery: 1,
  publication: { mode: 'manual', every: 2 },
  budgets: { maxIterations: null, maxRunMinutes: null },
  checkpoints: [], binding: {},
  team: { maxImplementers: 3, maxBuildWriters: 1 },
  optimization: { mode: 'recommend', minimumSamples: 3,
    bounds: { iterationMinutes: [60, 120], publicationEvery: [1, 3], maxImplementers: [1, 3] } }
};

export function mergeProfile(base, patch) {
  const result = { ...base, ...patch };
  for (const key of ['publication', 'budgets', 'team', 'binding', 'optimization']) {
    result[key] = { ...base[key], ...patch[key] };
  }
  result.optimization.bounds = { ...base.optimization.bounds, ...patch.optimization?.bounds };
  return validateProfile(result);
}

export function validateProfile(profile) {
  const fail = (message) => { throw new Error(`Invalid cadence profile: ${message}`); };
  if (profile.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (!['standalone', 'kbd', 'goal'].includes(profile.mode)) fail('unknown execution mode');
  if (typeof profile.name !== 'string' || !profile.name.trim()) fail('name is required');
  if (!Number.isFinite(profile.iterationMinutes) || profile.iterationMinutes <= 0) fail('iterationMinutes must be positive');
  if (!Number.isInteger(profile.reviewEvery) || profile.reviewEvery < 0) fail('reviewEvery must be a nonnegative integer');
  if (!['manual', 'every'].includes(profile.publication.mode)) fail('publication.mode must be manual or every');
  if (!Number.isInteger(profile.publication.every) || profile.publication.every < 1) fail('publication.every must be positive');
  for (const [key, value] of Object.entries(profile.budgets)) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) fail(`${key} must be positive or null`);
  }
  if (profile.budgets.maxIterations !== null && !Number.isInteger(profile.budgets.maxIterations)) fail('maxIterations must be an integer');
  if (!Array.isArray(profile.checkpoints)) fail('checkpoints must be an array');
  const seen = new Set();
  for (const step of profile.checkpoints) {
    if (!step.id || seen.has(step.id)) fail('checkpoint IDs must be present and unique');
    seen.add(step.id);
    if (!['build', 'run'].includes(step.kind)) fail('checkpoint kind must be build or run');
    if (typeof step.command !== 'string' || !step.command) fail(`${step.id} needs a command`);
    if (!Array.isArray(step.args) || step.args.some((arg) => typeof arg !== 'string')) fail(`${step.id} needs a string argument array`);
    if (typeof step.cwd !== 'string' || !step.cwd) fail(`${step.id} needs an explicit working directory`);
    if (step.required !== undefined && typeof step.required !== 'boolean') fail(`${step.id}.required must be boolean`);
    if (step.timeoutMs !== undefined && (!Number.isFinite(step.timeoutMs) || step.timeoutMs <= 0)) fail(`${step.id}.timeoutMs must be positive`);
    if (step.secretEnv !== undefined && (!Array.isArray(step.secretEnv) || step.secretEnv.some((key) => typeof key !== 'string'))) fail(`${step.id}.secretEnv must contain environment variable names`);
  }
  if (!Number.isInteger(profile.team.maxImplementers) || profile.team.maxImplementers < 1) fail('team.maxImplementers must be positive');
  if (profile.team.maxBuildWriters !== 1) fail('one shared build writer is required');
  if (!['recommend', 'automatic', 'off'].includes(profile.optimization.mode)) fail('unknown optimization mode');
  if (!Number.isInteger(profile.optimization.minimumSamples) || profile.optimization.minimumSamples < 3) fail('optimization needs at least three samples');
  for (const [key, range] of Object.entries(profile.optimization.bounds)) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] <= 0 || range[0] > range[1]) fail(`invalid bounds for ${key}`);
  }
  return profile;
}

export function normalizedScope(scope = {}) {
  const result = {};
  for (const key of ['tasks', 'changes', 'phases', 'outcomes']) {
    const values = scope[key] ?? [];
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw new Error(`scope.${key} must contain string IDs`);
    result[key] = [...new Set(values)];
  }
  result.deliveryClass = typeof scope.deliveryClass === 'string' && scope.deliveryClass.trim() ? scope.deliveryClass : 'unclassified';
  result.owners = Array.isArray(scope.owners) ? structuredClone(scope.owners) : [];
  if (!result.outcomes.length) throw new Error('An independently usable outcome must be named in scope.outcomes');
  return result;
}

export function budgetReason(state, now = Date.now()) {
  const { budgets } = state.profile;
  if (budgets.maxRunMinutes && now >= Date.parse(state.startedAt) + budgets.maxRunMinutes * 60_000) return 'Run time budget exhausted';
  if (!state.activeIterationId && budgets.maxIterations && state.iterations.length >= budgets.maxIterations) return 'Iteration budget exhausted';
  return null;
}
