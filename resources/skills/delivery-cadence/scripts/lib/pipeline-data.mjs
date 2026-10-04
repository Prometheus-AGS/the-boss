import path from 'node:path';
import { createHash } from 'node:crypto';

export const fail = message => { throw new Error(message); };
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export const clone = value => structuredClone(value);
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
export function strings(value, label, required = false) {
  if (!Array.isArray(value) || value.some(item => !nonempty(item)) || (required && !value.length)) fail(`${label} requires ${required ? 'nonempty ' : ''}string references`);
  return [...new Set(value)];
}
export function timestamp(value = new Date().toISOString()) {
  if (!nonempty(value) || !Number.isFinite(Date.parse(value))) fail('A valid observed timestamp is required');
  return new Date(value).toISOString();
}
export function findCandidate(state, id) {
  const candidate = (state.candidates ?? []).find(item => (item.id ?? item.candidateId) === id);
  if (!candidate) fail(`Unknown frozen candidate: ${id}`);
  return candidate;
}
export const candidateId = candidate => candidate.id ?? candidate.candidateId;
export const candidateDigest = candidate => candidate.contentManifestDigest ?? candidate.manifestDigest ?? candidate.digest;
export const iterationFor = (state, candidate) => state.iterations.find(item => item.id === candidate.iterationId);
export function sourceIdentity(candidate) {
  return candidate.sourceRefs ?? candidate.repositories ?? candidate.manifest?.repositories ?? [];
}
export { physicalPath } from './resources.mjs';
export function overlaps(a, b) {
  const contained = (root, child) => { const relative = path.relative(root, child); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
  return contained(a, b) || contained(b, a);
}
export function rootsOf(candidate) {
  const roots = candidate.executionRoots ?? candidate.manifest?.executionRoots ?? {};
  if (Array.isArray(roots)) return [...roots.map(item => typeof item === 'string' ? item : item.path).filter(Boolean), ...(candidate.outputRoots ?? [])];
  return [...(roots.checkouts ?? roots.sourceRoots ?? []), ...(roots.outputs ?? roots.outputRoots ?? [])];
}
