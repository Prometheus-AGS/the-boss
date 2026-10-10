import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HandoffCanonicalIdentity, HandoffFileIdentity, HandoffMemoryIdentity, HandoffProvenance, Json, KbdIdentity, ObjectValue, TeamState, TeamTask } from './types.mjs';
import { assertNoCredentials } from './models-http.mjs';
import { observeCanonicalTask } from './state-kbd.mjs';
import { object, strings, text, validateState } from './state-validation.mjs';

function canonical(value: Json): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const digest = (value: unknown): string => sha256(canonical(value as Json));
const optionalText = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;

/** Only identity fields cross the handoff boundary, never arbitrary provenance bodies. */
function kbdIdentity(value: unknown): KbdIdentity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['projectId', 'runId', 'phaseId', 'changeId', 'taskId']) {
    const field = optionalText(source[key]);
    if (field === null) return null;
    result[key] = field;
  }
  return result as unknown as KbdIdentity;
}

function fileIdentity(path: string, cwd: string): HandoffFileIdentity {
  const selected = resolve(cwd, path);
  try {
    const bytes = readFileSync(selected);
    return { path: selected, observation: 'observed', bytes: bytes.length, sha256: sha256(bytes) };
  } catch (error) {
    return { path: selected, observation: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unknown', bytes: null, sha256: null };
  }
}

function memoryIdentity(state: TeamState, id: string): HandoffMemoryIdentity {
  const record = state.outbox.find(entry => entry.id === id);
  const result: HandoffMemoryIdentity = { id, status: null, observation: 'unknown', projectId: null, teamId: state.team.id,
    scope: null, contentSha256: null, provenanceSha256: null, kbd: null, publication: null };
  if (!record) return result;
  const receipt = record.receipt && typeof record.receipt === 'object' && !Array.isArray(record.receipt) ? record.receipt as ObjectValue : null;
  return { ...result, status: record.status, observation: 'observed', projectId: record.projectId ?? null, scope: record.scope,
    contentSha256: sha256(record.content.normalize('NFC').trim().replace(/\s+/g, ' ')),
    provenanceSha256: digest(record.provenance), kbd: kbdIdentity(record.provenance.kbd),
    publication: receipt ? {
      outcome: optionalText(receipt.outcome), publicationKey: optionalText(receipt.publicationKey),
      remoteIdSha256: receipt.remoteId === undefined ? null : digest(receipt.remoteId),
      receiptSha256: digest(receipt), uncertain: typeof receipt.uncertain === 'boolean' ? receipt.uncertain : null,
    } : null };
}

export function captureProvenance(state: TeamState, task: TeamTask, cwd: string, input: Json | undefined): HandoffProvenance {
  const selected = input === undefined ? {} : object(input, 'handoff.provenance selection');
  for (const key of Object.keys(selected)) if (!['sourceFiles', 'evidenceFiles', 'karpathyFiles', 'memoryIds', 'kbdCli', 'kbdPath'].includes(key)) {
    throw new Error('Unsupported handoff provenance selection field');
  }
  assertNoCredentials(selected);
  const files = (key: string): HandoffFileIdentity[] => strings(selected[key] ?? [], key).map(path => fileIdentity(path, cwd));
  const reader = selected.kbdCli === undefined ? undefined : text(selected.kbdCli, 'kbdCli');
  const directory = selected.kbdPath === undefined ? cwd : text(selected.kbdPath, 'kbdPath');
  const result: HandoffProvenance = { schemaVersion: 1, capturedAt: new Date().toISOString(),
    canonical: observeCanonicalTask(kbdIdentity(task.kbd) ?? undefined, reader, directory),
    sources: files('sourceFiles'), evidence: files('evidenceFiles'), karpathy: files('karpathyFiles'),
    memory: strings(selected.memoryIds ?? [], 'memoryIds').map(id => memoryIdentity(state, id)),
  };
  assertNoCredentials(result);
  return result;
}

type Comparison = 'matches' | 'changed' | 'missing' | 'unobserved';
function comparison(captured: { observation: string }, current: { observation: string }): Comparison {
  if (current.observation === 'missing') return 'missing';
  if (captured.observation !== 'observed' || current.observation !== 'observed') return 'unobserved';
  return digest(captured) === digest(current) ? 'matches' : 'changed';
}

/** Inspection never returns a prompt, source bodies, memory bodies or native authority. */
export function inspectHandoff(state: TeamState, id: string, cwd: string, input: ObjectValue): unknown {
  validateState(state);
  const handoff = state.handoffs.find(item => item.id === text(id, 'handoff id'));
  if (!handoff) throw new Error('Unknown handoff');
  const task = state.tasks.find(item => item.id === handoff.taskId)!;
  const accepted = handoff.acceptedAt !== undefined;
  const endpoint = accepted ? handoff.to : handoff.from;
  const stale = task.revision !== handoff.taskRevision + (accepted ? 1 : 0) ||
    task.owner !== endpoint.owner || task.harness !== endpoint.harness || ['complete', 'cancelled'].includes(task.status);
  const captured = handoff.provenance ?? null;
  const result = { id: handoff.id, taskId: handoff.taskId, taskRevision: handoff.taskRevision, legacy: captured === null,
    ownership: { owner: task.owner, harness: task.harness, revision: task.revision, acceptedAt: handoff.acceptedAt ?? null, stale },
    captured, current: null as unknown,
  };
  if (!captured) return result;
  const files = (items: HandoffFileIdentity[]) => items.map(before => {
    const current = fileIdentity(before.path, cwd);
    return { captured: before, current, comparison: comparison(before, current) };
  });
  const memory = captured.memory.map(before => {
    const current = memoryIdentity(state, before.id);
    return { captured: before, current, comparison: comparison(before, current) };
  });
  const reader = input.kbdCli === undefined ? undefined : text(input.kbdCli, 'kbdCli');
  const directory = input.kbdPath === undefined ? captured.canonical.path : text(input.kbdPath, 'kbdPath');
  const current: HandoffCanonicalIdentity = observeCanonicalTask(captured.canonical.identity ?? undefined, reader, directory);
  result.current = { sources: files(captured.sources), evidence: files(captured.evidence), karpathy: files(captured.karpathy), memory,
    canonical: { captured: captured.canonical, current, comparison: comparison(captured.canonical, current) } };
  assertNoCredentials(result);
  return result;
}

export function provenancePrompt(provenance: HandoffProvenance): string {
  return 'Selected provenance (identities and hashes only; inspect current references before accepting):\n' +
    JSON.stringify(provenance, null, 2) +
    '\nCanonical observation, Karpathy references and memory receipts do not certify execution or transfer authority.';
}
