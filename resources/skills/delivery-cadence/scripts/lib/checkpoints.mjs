import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCommand } from './process.mjs';
import { claimResources, releaseResources } from './resources.mjs';
import { claimCommand, jobTransaction, immutableJson, attemptDirectory, reconcileJob, digest, now } from './jobs.mjs';
import { assertChildrenResolved } from './children.mjs';
import { saveEvent, atomicJson } from './storage.mjs';
import { checkpointPurpose, evidenceInterval, publicationRequirements, assertOperationReady } from './delivery-contract.mjs';

const exec = promisify(execFile);
async function git(repository, args, encoding = 'utf8') {
  return (await exec('git', ['-C', repository, ...args], { encoding, maxBuffer: 128 * 1024 * 1024 })).stdout;
}

export async function captureSources(refs, root) {
  if (!Array.isArray(refs) || !refs.length) throw new Error('sourceRefs must name at least one actual Git repository');
  const captured = [];
  for (const ref of refs) {
    const repository = path.resolve(ref.repository);
    const revision = (await git(repository, ['rev-parse', 'HEAD'])).trim();
    if (ref.revision && ref.revision !== revision) throw new Error(`Source revision changed for ${repository}; provide its current commit`);
    const hash = createHash('sha256').update(revision);
    const excluded = path.relative(repository, root).replaceAll(path.sep, '/');
    const pathspec = excluded && !excluded.startsWith('../') && !path.isAbsolute(excluded) ? ['.', `:(exclude)${excluded}`] : ['.'];
    hash.update(await git(repository, ['diff', 'HEAD', '--binary', '--', ...pathspec], 'buffer'));
    const files = (await git(repository, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec])).split('\0').filter(Boolean).sort();
    for (const name of files) {
      hash.update(name).update('\0');
      const file = path.join(repository, name);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) hash.update(await fs.readlink(file));
      else if (stat.isFile()) for await (const chunk of createReadStream(file)) hash.update(chunk);
    }
    const entries = (await git(repository, ['ls-files', '--stage', '-z'])).split('\0').filter(line => line.startsWith('160000 '));
    const submoduleRefs = [];
    for (const entry of entries) {
      const name = entry.slice(entry.indexOf('\t') + 1), nested = path.join(repository, name);
      const initialized = await fs.access(path.join(nested, '.git')).then(() => true, () => false);
      if (!initialized) {
        const pinned = entry.split(' ')[1];
        submoduleRefs.push({ repository: nested, name, initialized: false, revision: pinned, workingTree: 'unobserved' });
        hash.update(name).update(pinned); continue;
      }
      const [snapshot] = await captureSources([{ repository: nested }], root);
      submoduleRefs.push({ ...snapshot, name }); hash.update(name).update(snapshot.fingerprint);
    }
    captured.push({ repository, revision, fingerprint: hash.digest('hex'), ...(submoduleRefs.length ? { submoduleRefs } : {}) });
  }
  return captured.sort((a, b) => a.repository.localeCompare(b.repository));
}

export function sameSources(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export async function artifactReceipts(artifacts = []) {
  if (!Array.isArray(artifacts)) throw new Error('artifacts must be an array');
  const receipts = [];
  for (const artifact of artifacts) {
    if (!artifact.path) throw new Error('Artifact receipt requires an existing local file path');
    const file = path.resolve(artifact.path);
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error(`Artifact is not a file: ${file}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    const timing = artifact.startedAt !== undefined || artifact.finishedAt !== undefined
      ? evidenceInterval(artifact, artifact.kind ?? 'run') : null;
    if ((artifact.startedAt !== undefined || artifact.finishedAt !== undefined) && !timing) throw new Error(`Artifact timing needs an ordered startedAt/finishedAt pair: ${file}`);
    receipts.push({ path: file, sha256: hash.digest('hex'), size: stat.size,
      ...(artifact.url ? { url: artifact.url } : {}), ...(artifact.platform ? { platform: artifact.platform } : {}),
      ...(artifact.signingStatus ? { signingStatus: artifact.signingStatus } : {}),
      ...(timing ? { kind: timing.kind, startedAt: timing.startedAt, finishedAt: timing.finishedAt } : {}) });
  }
  return receipts;
}

export async function publicationReceipt(file, artifacts, sourceRefs, profile) {
  const resolved = path.resolve(file);
  const text = await fs.readFile(resolved, 'utf8');
  const receipt = JSON.parse(text);
  if (!receipt.version || !sameSources(receipt.sourceRefs, sourceRefs)) throw new Error('Publication receipt must identify its version and exact frozen sourceRefs');
  if (!Array.isArray(receipt.artifacts)) throw new Error('Publication receipt needs checksummed artifact entries');
  const missing = publicationRequirements(receipt, artifacts, sourceRefs, profile);
  if (missing.length) throw new Error(`Publication obligations lack evidence: ${missing.join(', ')}`);
  const expected = profile.publication.platforms ?? [];
  for (const platform of expected) {
    if (!artifacts.some((item) => item.platform === platform)) throw new Error(`Publication is missing ${platform}`);
  }
  if (expected.length && artifacts.some((item) => !expected.includes(item.platform))) throw new Error('Publication contains an unconfigured platform');
  for (const artifact of artifacts) {
    const match = receipt.artifacts.find((item) => item.sha256 === artifact.sha256 && item.size === artifact.size && item.platform === artifact.platform && item.url === artifact.url);
    if (!match || !match.url || !match.verifiedAt) throw new Error(`Publication receipt lacks downloaded-byte evidence for ${artifact.path}`);
  }
  if (profile.publication.websiteUrl) {
    const site = receipt.website;
    if (!site || site.url !== profile.publication.websiteUrl || site.version !== receipt.version || !site.verifiedAt || !Array.isArray(site.links)) {
      throw new Error('Website receipt must identify the configured URL, matching version and live verification time');
    }
    for (const artifact of artifacts) {
      if (!site.links.some((link) => link.platform === artifact.platform && link.url === artifact.url)) throw new Error(`Website receipt lacks ${artifact.platform} download URL`);
    }
  }
  return { ...receipt, path: resolved, sha256: createHash('sha256').update(text).digest('hex') };
}


/** Preserve dirty source bytes; references alone cannot reconstruct a frozen candidate. */
export async function preserveSources(root, sourceRefs) {
  const before = await captureSources(sourceRefs, root);
  if (!sameSources(before, sourceRefs)) throw new Error('Sources changed before preservation');
  const snapshots = [];
  for (const ref of sourceRefs) {
    const directory = path.join(root, 'sources', ref.fingerprint, randomUUID());
    await fs.mkdir(directory, { recursive: true });
    const excluded = path.relative(ref.repository, root).replaceAll(path.sep, '/');
    const pathspec = excluded && !excluded.startsWith('../') && !path.isAbsolute(excluded) ? ['.', `:(exclude)${excluded}`] : ['.'];
    const patch = await git(ref.repository, ['diff', 'HEAD', '--binary', '--', ...pathspec], 'buffer');
    await fs.writeFile(path.join(directory, 'tracked.patch'), patch, { mode: 0o600 });
    const files = (await git(ref.repository, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec])).split('\0').filter(Boolean);
    for (const name of files) {
      const from = path.join(ref.repository, name), to = path.join(directory, 'untracked', name);
      await fs.mkdir(path.dirname(to), { recursive: true });
      const stat = await fs.lstat(from);
      if (stat.isSymbolicLink()) throw new Error(`Frozen untracked symlink requires explicit source ownership: ${name}`);
      if (stat.isFile()) await fs.copyFile(from, to);
    }
    const submodules = (await git(ref.repository, ['submodule', 'status', '--recursive'])).trim();
    const initializedRefs = (ref.submoduleRefs ?? []).filter(nested => nested.initialized !== false).map(({ name, ...nested }) => nested);
    const preservedSubmodules = initializedRefs.length ? await preserveSources(root, initializedRefs) : [];
    snapshots.push({ ...ref, directory, preservedSubmodules, patchSha256: createHash('sha256').update(patch).digest('hex'), untrackedFiles: files, submodules });
  }
  if (!sameSources(await captureSources(sourceRefs, root), sourceRefs)) throw new Error('Sources changed during preservation');
  return snapshots;
}
function current(state, id) {
  const iteration = state.iterations.find(i => i.id === (id ?? state.activeIterationId));
  if (!iteration) throw new Error('No matching iteration'); return iteration;
}
function prerequisites(iteration, step) {
  if (step.kind !== 'run') return;
  const successful = id => iteration.checkpoints.some(r => r.id === id && r.status === 'success' && !r.invalidatedAt && sameSources(r.sourceRefs, iteration.sourceRefs));
  if (!iteration.profile.checkpoints.filter(c => c.kind === 'build' && c.required !== false).every(c => successful(c.id))) throw new Error('Build the frozen increment before running it');
  if (checkpointPurpose(iteration, step) === 'feature' && !iteration.profile.checkpoints.some(c => c.kind === 'run' && checkpointPurpose(iteration, c) === 'launch' && successful(c.id))) throw new Error('Launch the built increment before operating its feature');
}
export async function dispatchCheckpoint(root, input = {}, args = {}) {
  const claim = await jobTransaction(root, async state => {
    const prior = claimCommand(state, 'checkpoint', input, args); if (prior) return { prior };
    const duplicate = state.jobs?.find(j => j.commandId === args.commandId);
    if (duplicate) return { duplicate: duplicate.id };
    const iteration = current(state, input.iterationId); assertChildrenResolved(iteration);
    if (!['ready', 'checkpoint-failed'].includes(iteration.status)) throw new Error('Complete and freeze the production increment before checkpoint');
    const candidateId = input.candidateId ?? iteration.candidateId;
    const candidate = state.candidates?.find(c => (c.id ?? c.candidateId) === candidateId);
    if (!candidate || candidate.iterationId !== iteration.id || candidateId !== iteration.candidateId) throw new Error('Checkpoint requires the current frozen candidate');
    if (state.jobs?.some(j => j.iterationId === iteration.id && ['claimed','launching','running','unknown','cancelRequested'].includes(j.state))) throw new Error('Reconcile the existing candidate job before another checkpoint');
    const step = iteration.profile.checkpoints.find(c => c.id === input.id);
    if (!step) throw new Error(`No configured checkpoint ${input.id}`);
    prerequisites(iteration, step);
    if (input.timeoutMs !== undefined && (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0 || !input.reason?.trim())) throw new Error('Timeout adjustment requires positive integer milliseconds and reason');
    if (step.kind === 'build' && iteration.checkpoints.some(c => c.id === step.id) && !input.reason?.trim()) throw new Error('Repeated builds require a recorded reason');
    const requestedTimeoutMs = input.timeoutMs ?? step.timeoutMs ?? 14_400_000;
    const remaining = state.profile.budgets?.maxRunMinutes ? Date.parse(state.startedAt) + state.profile.budgets.maxRunMinutes * 60_000 - Date.now() : Infinity;
    if (remaining <= 0) throw new Error('Run budget exhausted before dispatch');
    const job = { id: randomUUID(), commandId: args.commandId, candidateId, iterationId: iteration.id, kind: step.kind,
      operationToken: randomUUID(), state: 'claimed', claimedAt: now(), owner: { pid: process.pid, hostname: os.hostname() },
      contractDigest: digest(step), contentManifestDigest: candidate.contentManifestDigest,
      command: { ...step, timeoutMs: Math.min(requestedTimeoutMs, remaining) }, sourceRefs: structuredClone(iteration.sourceRefs),
      resourcePaths: [...new Set([path.resolve(step.cwd), ...(candidate.outputRoots ?? []), ...(step.resourcePaths ?? [])])],
      registry: state.profile.resources?.registryRoot ?? state.profile.resourceRegistryRoot, requestedTimeoutMs, resourceClaims: [] };
    const receipt = { id: step.id, attemptId: job.id, candidateId, commandId: args.commandId, kind: step.kind, purpose: checkpointPurpose(iteration, step), status: 'running', startedAt: job.claimedAt,
      sourceRefs: job.sourceRefs, contentManifestDigest: job.contentManifestDigest, reason: input.reason ?? 'Initial delivery checkpoint', configuredTimeoutMs: step.timeoutMs ?? 14_400_000, requestedTimeoutMs,
      command: step.command, args: step.args, cwd: path.resolve(step.cwd), hostname: os.hostname(), ...(checkpointPurpose(iteration, step) === 'feature' ? { featureOperationId: iteration.featureOperation.id } : {}) };
    state.jobs ??= []; state.jobs.push(job); iteration.checkpoints.push(receipt); iteration.status = 'checkpoint-running';
    await immutableJson(path.join(attemptDirectory(root, job.id), 'claim.json'), job);
    await saveEvent(root, state, 'job.claimed', { attemptId: job.id, candidateId });
    return { job, iteration: structuredClone(iteration) };
  });
  if (claim.prior) return claim.prior;
  if (claim.duplicate) return reconcileJob(root, claim.duplicate);
  const { job, iteration } = claim, directory = attemptDirectory(root, job.id);
  let claims = [], execution, spawned = false, launchRecord = Promise.resolve(), log, outputQueue = Promise.resolve(), poll;
  const controller = new AbortController(), cancel = () => controller.abort();
  const secrets = (job.command.secretEnv ?? []).map(k => process.env[k]).filter(Boolean);
  const redact = text => secrets.reduce((s, secret) => s.replaceAll(secret, '[REDACTED]'), String(text));
  const buffered = new Map();
  const keep = Math.max(0, ...secrets.map(s => s.length - 1));
  const output = (stream, text, flush = false) => {
    const safe = redact((buffered.get(stream) ?? '') + text);
    const boundary = flush ? safe.length : Math.max(0, safe.length - keep);
    buffered.set(stream, safe.slice(boundary));
    const emitted = safe.slice(0, boundary);
    if (emitted) { outputQueue = outputQueue.then(() => log.write(`[${stream}] ${emitted}`)); process.stderr.write(emitted); }
  };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    if (!sameSources(await captureSources(job.sourceRefs, root), job.sourceRefs)) throw new Error('Source changed after freeze');
    if (checkpointPurpose(iteration, job.command) === 'feature') await assertOperationReady(iteration.featureOperation, iteration.scope, {
      stage: 'after-build', contractVersion: iteration.contractVersion, profile: iteration.profile,
      completedTaskRefs: iteration.completedTaskRefs ?? [], satisfiedPrerequisiteIds: iteration.satisfiedPrerequisiteIds ?? []
    });
    claims = await claimResources(job.resourcePaths, { runId: (await jobTransaction(root, async s => s.runId)), attemptId: job.id, operationToken: job.operationToken, owner: job.owner }, job.registry);
    await immutableJson(path.join(directory, 'resources.json'), claims);
    await jobTransaction(root, async state => { const fresh = state.jobs.find(j => j.id === job.id); fresh.resourceClaims = claims; fresh.state = 'launching'; await saveEvent(root, state, 'job.launch-intent', { attemptId: job.id }); });
    const checkCancel = async () => { try { const request = JSON.parse(await fs.readFile(path.join(directory, 'cancel.json'), 'utf8')); if (request.operationToken === job.operationToken) controller.abort(); } catch (e) { if (e.code !== 'ENOENT') controller.abort(); } };
    await checkCancel(); poll = setInterval(() => { void checkCancel(); }, 250);
    const logPath = path.join(directory, 'output.log'); log = await fs.open(logPath, 'a', 0o600);
    execution = await runCommand(job.command, { cwd: job.command.cwd, signal: controller.signal,
      onSpawn(pid) { spawned = true; launchRecord = (async () => {
        await immutableJson(path.join(directory, 'process.json'), { pid, operationToken: job.operationToken, owner: job.owner, startedAt: now() });
        await jobTransaction(root, async state => { const fresh = state.jobs.find(j => j.id === job.id); fresh.pid = pid; fresh.state = 'running'; fresh.startedAt = now(); await saveEvent(root, state, 'job.process', { attemptId: job.id, pid }); });
      })().catch(error => { controller.abort(); job.launchError = error.message; }); },
      onOutput(stream, text) { output(stream, text); }
    });
    await launchRecord;
    if (job.launchError) throw new Error(job.launchError);
    execution.logPath = logPath;
    if (!sameSources(await captureSources(job.sourceRefs, root), job.sourceRefs)) { execution.status = 'failed'; execution.reason = 'Source changed during checkpoint'; }
    if (execution.status === 'success') execution.artifacts = await artifactReceipts(input.artifacts ?? []);
  } catch (error) {
    execution = { ...execution, status: execution?.status === 'unknown' || (spawned && execution?.processStopped !== true) ? 'unknown' : controller.signal.aborted ? 'cancelled' : 'failed', reason: redact(error.message), startedAt: execution?.startedAt ?? job.claimedAt, finishedAt: now(), processStopped: execution?.processStopped ?? !spawned };
  } finally {
    clearInterval(poll); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    if (log) for (const stream of buffered.keys()) output(stream, '', true);
    await outputQueue; if (log) { await log.sync(); await log.close(); }
  }
  delete execution.stdout; delete execution.stderr; delete execution.message;
  const result = { ...execution, attemptId: job.id, candidateId: job.candidateId, operationToken: job.operationToken, sourceRefs: job.sourceRefs, contentManifestDigest: job.contentManifestDigest };
  await immutableJson(path.join(directory, 'result.json'), result);
  await reconcileJob(root, job.id);
  if (result.processStopped === true) await releaseResources(claims, job.operationToken);
  return jobTransaction(root, async state => state.iterations.find(i => i.id === job.iterationId).checkpoints.find(r => r.attemptId === job.id));
}
// The legacy helper must never reintroduce a long operation within a caller-held lock.
export async function runCheckpoint() { throw new Error('Use dispatchCheckpoint outside the run transaction'); }
