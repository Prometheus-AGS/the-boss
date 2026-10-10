import { pathToFileURL } from 'node:url';

const controller = new AbortController();
let started = false;
process.on('message', async message => {
  if (message?.type === 'abort') { controller.abort(message.reason); return; }
  if (message?.type !== 'start' || started) return;
  started = true;
  let result;
  try {
    const module = await import(pathToFileURL(message.script).href);
    if (typeof module.default !== 'function') throw new Error('Hook must export a default function.');
    const value = await module.default(message.event, {
      signal: controller.signal,
      idempotencyKey: message.idempotencyKey,
      env: Object.fromEntries(message.envNames.map(name => [name, process.env[name]])),
    });
    result = { type: 'result', ok: true, value: value ?? { status: 'succeeded' } };
  } catch (error) {
    result = { type: 'result', ok: false, error: String(error?.message ?? error) };
  }
  try {
    process.send(result, error => { process.exit(error || !result.ok ? 1 : 0); });
  } catch { process.exit(1); }
});
process.on('disconnect', () => { controller.abort('parent disconnected'); process.exit(1); });
