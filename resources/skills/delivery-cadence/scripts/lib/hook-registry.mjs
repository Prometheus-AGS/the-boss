import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const EVENTS = ['iteration:after', 'publication:after'];
export const OUTCOMES = ['success', 'failed', 'cancelled'];
export function digest(value) { return createHash('sha256').update(value).digest('hex'); }
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}
export function readRegistry(root) {
  const file = path.join(root, 'hooks', 'registry.json');
  if (!fs.existsSync(file)) return { schemaVersion: 1, handlers: [] };
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.schemaVersion !== 1 || !Array.isArray(value.handlers)) throw new Error('Unsupported hook registry.');
  return value;
}
export function writeRegistry(root, registry) { writeJson(path.join(root, 'hooks', 'registry.json'), registry); }
export function scriptDigest(script) { return digest(fs.readFileSync(script)); }
const list = (value, fallback) => value === undefined ? fallback : Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
export function register(root, input) {
  const registry = readRegistry(root);
  const id = input.id;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id ?? '')) throw new Error('Hook id must be 1–80 letters, digits, dots, underscores or hyphens.');
  if (typeof input.script !== 'string') throw new Error('Hook script is required.');
  const script = fs.realpathSync(path.resolve(input.script));
  if (path.extname(script) !== '.mjs' || !fs.statSync(script).isFile()) throw new Error('Hook script must be an existing .mjs file.');
  const events = list(input.events ?? input.event, ['iteration:after']);
  const outcomes = list(input.outcomes ?? input.outcome, ['success']);
  const envNames = list(input.envNames ?? input.env, []);
  if (!events.length || !events.every(e => EVENTS.includes(e))) throw new Error('Unknown hook event.');
  if (!outcomes.length || !outcomes.every(e => OUTCOMES.includes(e))) throw new Error('Unknown hook outcome.');
  if (!envNames.every(e => /^[A-Za-z_][A-Za-z0-9_]*$/.test(e))) throw new Error('Credential references must be environment variable names.');
  const onFailure = input.onFailure ?? input['on-failure'] ?? 'warn';
  if (!['warn', 'error'].includes(onFailure)) throw new Error('onFailure must be warn or error.');
  const timeoutMs = Number(input.timeoutMs ?? input['timeout-ms'] ?? 30_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) throw new Error('Hook timeout must be between 1 and 3600000 ms.');
  const prior = registry.handlers.find(h => h.id === id);
  const handler = { id, revision: (prior?.revision ?? 0) + 1, script, digest: scriptDigest(script), events, outcomes, envNames, timeoutMs, onFailure, enabled: true, idempotency: input.idempotency === true || input.idempotency === 'true', registeredAt: new Date().toISOString() };
  registry.handlers = [...registry.handlers.filter(h => h.id !== id), handler];
  writeRegistry(root, registry);
  return handler;
}
export function mutateRegistration(root, id, action) {
  const registry = readRegistry(root);
  const handler = registry.handlers.find(h => h.id === id);
  if (!handler) throw new Error('Unknown hook id.');
  if (action === 'remove') handler.enabled = false, handler.removedAt = new Date().toISOString();
  else {
    if (handler.removedAt) throw new Error('Removed handler must be registered again with add.');
    if (action === 'enable' && scriptDigest(handler.script) !== handler.digest) throw new Error('Script changed; use hooks add to trust its new revision.');
    handler.enabled = action === 'enable';
  }
  writeRegistry(root, registry);
  return handler;
}
