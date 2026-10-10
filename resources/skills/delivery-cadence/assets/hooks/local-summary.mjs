import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Configure CADENCE_SUMMARY_DIR and register with --idempotency. */
export default async function run(event, { signal, idempotencyKey, env }) {
  if (!env.CADENCE_SUMMARY_DIR) return { status: 'failed', effects: 'none' };
  signal.throwIfAborted();
  await mkdir(env.CADENCE_SUMMARY_DIR, { recursive: true });
  const target = path.join(env.CADENCE_SUMMARY_DIR, `${idempotencyKey}.md`);
  const summary = `# Delivery summary\n\nRun: ${event.runId}\nIteration: ${event.iterationIndex}\nEvent: ${event.type}\nOutcome: ${event.outcome}\n`;
  try { await writeFile(target, summary, { flag: 'wx', signal }); }
  catch (error) {
    if (error.code !== 'EEXIST' || await readFile(target, 'utf8') !== summary) throw error;
  }
  return { status: 'succeeded' };
}
