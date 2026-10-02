import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { withLock } from './storage.mjs';
import { immutableJson } from './jobs.mjs';
import { fileURLToPath } from 'node:url';
import { digest, readRegistry, register, mutateRegistration, scriptDigest, writeJson } from './hook-registry.mjs';
import { minimalEnvironment, runCommand } from './process.mjs';

const runner = fileURLToPath(new URL('./hook-runner.mjs', import.meta.url));
const assets = fileURLToPath(new URL('../../assets/hooks/', import.meta.url));
const TEMPLATES = ['email-api', 'webhook', 'local-summary'];
const receiptDir = root => path.join(root, 'hooks', 'receipts');
function identity(event, handler) { return digest(`${event.id}\0${handler.id}\0${handler.revision}`); }
function result(receipt) { return { receiptId: receipt.id, handlerId: receipt.handlerId, revision: receipt.revision, status: receipt.status, reason: receipt.reason ?? null }; }

async function dispatch(root, event, handler, { retry = false } = {}) {
  if (typeof event.id !== 'string' || !event.id) throw new Error('Hook event requires a stable id.');
  const id = identity(event, handler);
  const file = path.join(receiptDir(root), `${id}.json`);
  fs.mkdirSync(receiptDir(root), { recursive: true });
  let current;
  const claim = await withLock(path.join(root, 'hooks', 'claims', id), async () => {
    let prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (!prior && fs.existsSync(path.join(receiptDir(root), id))) {
      const attempts = fs.readdirSync(path.join(receiptDir(root), id)).filter(name => /^\d+$/.test(name)).map(Number).sort((a, b) => b - a);
      if (attempts.length) prior = JSON.parse(fs.readFileSync(path.join(receiptDir(root), id, String(attempts[0]), 'claim.json'), 'utf8'));
    }
    if (prior?.attempt) {
      const resultFile = path.join(receiptDir(root), id, String(prior.attempt), 'result.json');
      if (fs.existsSync(resultFile)) {
        const terminal = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        if (terminal.operationToken !== prior.operationToken) throw new Error('Hook result ownership mismatch');
        prior = terminal; writeJson(file, terminal);
      }
    }
    if (prior?.status === 'succeeded') return { prior };
    if (prior && ['scheduled', 'running'].includes(prior.status)) {
      let ownerAlive = Boolean(prior.owner && prior.owner.hostname !== os.hostname());
      if (!ownerAlive && prior.owner?.pid) {
        try { process.kill(prior.owner.pid, 0); ownerAlive = true; } catch (e) { ownerAlive = e.code !== 'ESRCH'; }
      }
      if (ownerAlive) return { prior };
      prior = { ...prior, status: 'unknown', reason: 'interrupted-external-effects-unknown', finishedAt: new Date().toISOString() };
      writeJson(file, prior);
    }
    if (prior && !retry) return { prior };
    if (prior?.status === 'unknown' && !handler.idempotency) throw new Error('Unknown external effects require configured receiver idempotency or explicit reconciliation; do not replay');
    current = {
      schemaVersion: 1, id, eventId: event.id, event, handlerId: handler.id, revision: handler.revision,
      scriptDigest: handler.digest, status: 'scheduled', attempt: (prior?.attempt ?? 0) + 1,
      scheduledAt: new Date().toISOString(), idempotencyKey: id, operationToken: randomUUID(),
      owner: { pid: process.pid, hostname: os.hostname() },
    };
    await immutableJson(path.join(receiptDir(root), id, String(current.attempt), 'claim.json'), current);
    writeJson(file, current); return {};
  });
  if (claim.prior) return result(claim.prior);
  const finish = async (status, reason) => withLock(path.join(root, 'hooks', 'claims', id), async () => {
    const fresh = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (fresh.operationToken !== current.operationToken) throw new Error('Hook execution ownership changed');
    current = { ...fresh, status, reason, finishedAt: new Date().toISOString() };
    await immutableJson(path.join(receiptDir(root), id, String(current.attempt), 'result.json'), current);
    writeJson(file, current); return result(current);
  });
  let actualDigest;
  try { actualDigest = scriptDigest(handler.script); } catch { return finish('failed', 'script-unavailable'); }
  if (actualDigest !== handler.digest) return finish('failed', 'script-digest-changed-reregister-required');
  if (handler.envNames.some(name => !process.env[name])) return finish('failed', 'declared-environment-unavailable');
  current = { ...current, status: 'running', startedAt: new Date().toISOString() };
  writeJson(file, current);
  let execution;
  try {
    execution = await runCommand({
      command: process.execPath, args: [runner], timeoutMs: handler.timeoutMs, ipc: true,
      message: { type: 'start', script: handler.script, event, idempotencyKey: id, envNames: handler.envNames },
    }, { cwd: path.dirname(handler.script), env: minimalEnvironment(handler.envNames) });
  } catch { return finish('unknown', 'hook-process-error-external-effects-unknown'); }
  const message = execution.message;
  if (execution.status === 'success' && message?.ok === true && message.value?.status !== 'failed') return finish('succeeded', 'handler-completed');
  if (message?.ok === true && message.value?.status === 'failed' && message.value?.effects === 'none') return finish('failed', 'handler-reported-no-effects');
  return finish('unknown', execution.status === 'timeout' ? 'timeout-external-effects-unknown' : 'handler-failed-external-effects-unknown');
}

export async function runHooks(root, event) {
  const handlers = readRegistry(root).handlers.filter(h => h.enabled && !h.removedAt && h.events.includes(event.type) && h.outcomes.includes(event.outcome));
  const results = [];
  let blocked = false;
  for (const handler of handlers) {
    const receipt = await dispatch(root, event, handler);
    results.push(receipt);
    if (receipt.status !== 'succeeded' && handler.onFailure === 'error') blocked = true;
  }
  return { results, blocked };
}

export async function handleHooksCommand(root, args) {
  const positional = args._ ?? [];
  const action = positional[0] === 'hooks' ? positional[1] : positional[0];
  const input = { ...args, ...(args.input ?? {}) };
  if (action === 'list') return { handlers: readRegistry(root).handlers };
  if (action === 'add') return { handler: register(root, input), warning: 'Registered JavaScript runs with full user privileges; this is not a sandbox.' };
  if (['enable', 'disable', 'remove'].includes(action)) return { handler: mutateRegistration(root, input.id, action) };
  if (action === 'scaffold') {
    const template = input.template ?? 'local-summary';
    if (!TEMPLATES.includes(template)) throw new Error(`Templates: ${TEMPLATES.join(', ')}`);
    const destination = path.resolve(input.output ?? path.join(root, 'hooks', 'scripts', `${template}.mjs`));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(assets, `${template}.mjs`), destination, fs.constants.COPYFILE_EXCL);
    return { script: destination, registered: false, enabled: false, next: 'Configure the script, then explicitly run hooks add.' };
  }
  if (action === 'retry') {
    const receiptId = input.receipt ?? input['receipt-id'];
    if (!/^[a-f0-9]{64}$/.test(receiptId ?? '')) throw new Error('Retry requires --receipt <receiptId>.');
    const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir(root), `${receiptId}.json`), 'utf8'));
    const handler = readRegistry(root).handlers.find(h => h.id === receipt.handlerId && h.revision === receipt.revision);
    if (!handler || !handler.enabled || handler.removedAt) throw new Error('Retry requires the original enabled registration revision.');
    return { result: await dispatch(root, receipt.event, handler, { retry: true }) };
  }
  throw new Error('Use hooks scaffold|add|list|enable|disable|remove|retry.');
}

/** Called only after the work event is persisted and outside the run mutex. */
export async function dispatchEventHooks(root, event, ownerRef) {
  if (ownerRef?.eventId && ownerRef.eventId !== event.id) throw new Error('Hook owner event mismatch');
  const results = await runHooks(root, event);
  if (results.results.some(r => ['scheduled', 'running'].includes(r.status))) throw new Error('Hook effect is still owned by another execution session; resume when its receipt is available');
  return results;
}
