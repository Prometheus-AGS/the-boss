import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { captureSources, sameSources, preserveSources } from './checkpoints.mjs';
import { assertOperationReady } from './delivery-contract.mjs';
import { assertChildrenResolved } from './children.mjs';
import { atomicJson } from './storage.mjs';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Candidates describe frozen inputs. Their lifecycle is stored on the iteration,
// so attempts and corrections never rewrite the original candidate manifest.
export async function freezeCandidate(root, state, iteration, input = {}) {
  assertChildrenResolved(iteration);
  if (iteration.status !== 'ready') throw new Error('Finish production scope with ready before freezing a candidate');
  await assertOperationReady(iteration.featureOperation, iteration.scope, {
    stage: 'ready', contractVersion: iteration.contractVersion,
    completedTaskRefs: input.completedTaskRefs ?? iteration.completedTaskRefs ?? [],
    satisfiedPrerequisiteIds: input.satisfiedPrerequisiteIds ?? iteration.satisfiedPrerequisiteIds ?? [],
    profile: iteration.profile
  });
  const refs = await captureSources(iteration.sourceRefs, root);
  if (!sameSources(refs, iteration.sourceRefs)) throw new Error('Release inputs changed; run ready against the completed repaired inputs');
  const previous = state.candidates.find(c => c.id === iteration.candidateId);
  const recipes = iteration.profile.checkpoints.map(({ id, kind, command, args, cwd, ...options }) =>
    ({ id, kind, command, args, cwd, options }));
  const portable = value => JSON.parse(JSON.stringify(value, (_key, v) => {
    if (typeof v !== 'string') return v;
    for (const ref of refs) v = v.replaceAll(ref.repository, `source:${path.basename(ref.repository)}`);
    return v;
  }));
  const manifest = {
    scope: iteration.scope, scopeRevision: iteration.scopeRevisions?.length ?? 0,
    sources: refs.map(({ repository, ...ref }) => ({ logicalId: path.basename(repository), ...ref })),
    recipes: portable(recipes), featureOperation: portable(iteration.featureOperation),
    platformRequirements: iteration.profile.publication.platforms ?? []
  };
  const contentManifestDigest = digest(manifest);
  if (previous?.contentManifestDigest === contentManifestDigest) return previous;
  const id = randomUUID();
  const executionRoots = input.executionRoots ?? refs.map(r => r.repository);
  const outputRoots = input.outputRoots ?? iteration.profile.checkpoints.flatMap(s => s.outputRoots ?? []);
  if (!Array.isArray(executionRoots) || !executionRoots.length || !Array.isArray(outputRoots) || !outputRoots.length) {
    throw new Error('Candidate freeze requires physical executionRoots and outputRoots for shared resource ownership');
  }
  const preservedSources = await preserveSources(root,refs);
  const candidate = { id, candidateId: id, iterationId: iteration.id, createdAt: new Date().toISOString(),
    contentManifestDigest, scopeRevision: manifest.scopeRevision, scope: structuredClone(iteration.scope),
    sourceRefs: refs, profile: structuredClone(iteration.profile), featureOperation: structuredClone(iteration.featureOperation),
    recipes, executionRoots: executionRoots.map(p => path.resolve(p)), outputRoots: outputRoots.map(p => path.resolve(p)),
    preservedSources, supersedesCandidateId: previous?.id ?? null };
  const file = path.join(root, 'candidates', `${id}.json`);
  await atomicJson(file, candidate);
  candidate.manifestHash = digest(candidate);
  candidate.manifestPath = file;
  state.candidates.push(candidate); iteration.candidateId = id;
  return candidate;
}

export function candidateStatus(state, input = {}) {
  const iteration = state.iterations.find(i => i.id === (input.iterationId ?? state.activeIterationId));
  return input.candidateId ? state.candidates.find(c => c.id === input.candidateId) ?? null
    : { current: state.candidates.find(c => c.id === iteration?.candidateId) ?? null, candidates: state.candidates };
}

export async function assertCandidateCurrent(root, state, iteration) {
  const candidate = state.candidates.find(c => c.id === iteration.candidateId);
  if (!candidate) throw new Error('Freeze a candidate for this completed increment before delivery');
  const bytes = JSON.parse(await fs.readFile(candidate.manifestPath, 'utf8'));
  if (digest(bytes) !== candidate.manifestHash) throw new Error('Frozen candidate manifest bytes changed');
  if (!sameSources(candidate.sourceRefs, iteration.sourceRefs) || !sameSources(await captureSources(candidate.sourceRefs, root), candidate.sourceRefs)) {
    throw new Error('Frozen candidate no longer matches release inputs; repair and freeze again');
  }
  const previous = [...state.iterations].reverse().find(i => i.id !== iteration.id && i.workOutcome === 'success');
  if (previous && sameSources(previous.sourceRefs, candidate.sourceRefs)) throw new Error('No changed release inputs: record a skipped-no-change opportunity rather than an empty delivery');
  return candidate;
}
