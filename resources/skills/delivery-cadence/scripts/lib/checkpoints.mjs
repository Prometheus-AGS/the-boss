import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCommand } from './process.mjs';
import { saveEvent } from './storage.mjs';
import { checkpointPurpose, evidenceInterval, publicationRequirements } from './delivery-contract.mjs';

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
    captured.push({ repository, revision, fingerprint: hash.digest('hex') });
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

export async function runCheckpoint(root, state, iteration, input, commandId) {
  if (!['ready', 'checkpoint-failed', 'checkpoint-running'].includes(iteration.status)) throw new Error('Complete production scope with ready before building or running');
  const step = iteration.profile.checkpoints.find((item) => item.id === input.id);
  if (!step) throw new Error(`No configured checkpoint ${input.id}`);
  const previous = iteration.checkpoints.find((item) => item.commandId === commandId);
  if (previous) return previous;
  if (input.timeoutMs !== undefined && (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0 || typeof input.reason !== 'string' || !input.reason.trim())) {
    throw new Error('A checkpoint timeout adjustment requires positive integer milliseconds and a recorded reason');
  }
  const requestedTimeoutMs = input.timeoutMs ?? step.timeoutMs ?? 14_400_000;
  const repeated = iteration.checkpoints.some((item) => item.id === step.id);
  if (step.kind === 'build' && repeated && (iteration.contractVersion ?? 1) >= 2 && (typeof input.reason !== 'string' || !input.reason.trim())) {
    throw new Error('Repeated builds require a reason identifying the repair or changed release input');
  }
  const purpose = checkpointPurpose(iteration, step);
  for (const pending of iteration.checkpoints.filter((item) => ['running', 'unknown'].includes(item.status))) {
    if (pending.hostname !== os.hostname() || !pending.pid) throw new Error(`Reconcile interrupted checkpoint ${pending.attemptId} before another build; its process ownership is unknown`);
    try { process.kill(pending.pid, 0); throw new Error(`Checkpoint ${pending.attemptId} is still running as process ${pending.pid}; wait for it to finish`); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  if (step.kind === 'run') {
    const builds = iteration.profile.checkpoints.filter((item) => item.kind === 'build' && item.required !== false);
    if (!builds.every((build) => {
      const receipt = iteration.checkpoints.filter((item) => item.id === build.id).at(-1);
      return receipt?.status === 'success' && !receipt.invalidatedAt && sameSources(receipt.sourceRefs, iteration.sourceRefs);
    })) {
      throw new Error('Build the frozen increment successfully before running the program');
    }
    if (purpose === 'feature' && (iteration.contractVersion ?? 1) >= 2) {
      const launches = iteration.profile.checkpoints.filter((item) => item.kind === 'run' && checkpointPurpose(iteration, item) === 'launch');
      if (!launches.some((launch) => {
        const receipt = iteration.checkpoints.filter((item) => item.id === launch.id).at(-1);
        return receipt?.status === 'success' && !receipt.invalidatedAt && sameSources(receipt.sourceRefs, iteration.sourceRefs);
      })) throw new Error('Launch the built increment before operating the delivered feature');
    }
  }
  const before = await captureSources(iteration.sourceRefs, root);
  if (!sameSources(before, iteration.sourceRefs)) throw new Error('Sources changed after ready; run ready with the repaired source set before rebuilding');
  const startedAt = new Date().toISOString();
  const attempt = { id: step.id, attemptId: randomUUID(), commandId, kind: step.kind, purpose, status: 'running', startedAt,
    ...(purpose === 'feature' ? { featureOperationId: iteration.featureOperation.id } : {}),
    reason: input.reason ?? (repeated ? 'Unspecified legacy retry' : 'Initial delivery checkpoint'),
    configuredTimeoutMs: step.timeoutMs ?? 14_400_000, requestedTimeoutMs,
    sourceRefs: iteration.sourceRefs, command: step.command, args: step.args, cwd: path.resolve(step.cwd), hostname: os.hostname() };
  iteration.checkpoints.push(attempt); iteration.status = 'checkpoint-running';
  await saveEvent(root, state, 'checkpoint.started', { iterationId: iteration.id, attemptId: attempt.attemptId });
  const logDir = path.join(root, 'logs'); await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `${attempt.attemptId}.log`);
  const log = await fs.open(logPath, 'a', 0o600);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let outputQueue = Promise.resolve();
  let spawnSave = Promise.resolve();
  const secrets = (step.secretEnv ?? []).map((key) => process.env[key]).filter(Boolean);
  const redact = (text) => secrets.reduce((result, secret) => result.replaceAll(secret, '[REDACTED]'), text);
  const remaining = state.profile.budgets.maxRunMinutes
    ? Date.parse(state.startedAt) + state.profile.budgets.maxRunMinutes * 60_000 - Date.now() : Infinity;
  try {
    if (remaining <= 0) throw new Error('Run budget exhausted before checkpoint dispatch');
    const result = await runCommand({ ...step, timeoutMs: Math.min(requestedTimeoutMs, remaining) }, {
      cwd: step.cwd, signal: controller.signal,
      onSpawn(pid) { attempt.pid = pid; spawnSave = saveEvent(root, state, 'checkpoint.process', { attemptId: attempt.attemptId, pid }); },
      onOutput(stream, text) {
        const safe = redact(text);
        outputQueue = outputQueue.then(() => log.write(`[${stream}] ${safe}`));
        process.stderr.write(safe);
      }
    });
    Object.assign(attempt, { status: result.status, exitCode: result.exitCode, signal: result.signal,
      startedAt: result.startedAt ?? startedAt, finishedAt: result.finishedAt ?? new Date().toISOString(), logPath });
    const after = await captureSources(iteration.sourceRefs, root);
    if (!sameSources(after, iteration.sourceRefs)) {
      attempt.status = 'failed'; attempt.reason = 'Source changed during checkpoint; rebuild the repaired frozen increment';
    }
    if (attempt.status === 'success') attempt.artifacts = await artifactReceipts(input.artifacts ?? []);
  } catch (error) {
    attempt.status = controller.signal.aborted ? 'cancelled' : 'failed';
    attempt.reason = redact(error.message); attempt.finishedAt = new Date().toISOString();
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    await spawnSave; await outputQueue; await log.sync(); await log.close();
  }
  iteration.status = attempt.status === 'success' ? 'ready' : 'checkpoint-failed';
  await saveEvent(root, state, 'checkpoint.finished', { iterationId: iteration.id, attemptId: attempt.attemptId });
  return attempt;
}
