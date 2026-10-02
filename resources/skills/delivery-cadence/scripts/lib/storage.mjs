import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(temp, file); break; }
    catch (error) {
      if (!['EPERM', 'EBUSY'].includes(error.code) || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

export async function withLock(root, action) {
  await fs.mkdir(root, { recursive: true });
  const lockPath = path.join(root, 'run.lock');
  const owner = { id: randomUUID(), pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString() };
  let handle;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { handle = await fs.open(lockPath, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous;
      try { previous = JSON.parse(await fs.readFile(lockPath, 'utf8')); }
      catch { if (attempt < 99) { await new Promise(resolve => setTimeout(resolve, 20)); continue; } throw new Error(`Incomplete cadence lock at ${lockPath}; confirm its owner has exited before recovery`); }
      let alive = true;
      if (previous.hostname === os.hostname()) {
        try { process.kill(previous.pid, 0); } catch (check) { if (check.code === 'ESRCH') alive = false; }
      }
      if (alive) {
        if (attempt === 99) throw new Error(`Cadence transaction owned by ${previous.hostname} process ${previous.pid}; retry after it finishes`);
        await new Promise(resolve => setTimeout(resolve, 20)); continue;
      }
      const recoveryPath = path.join(root, 'lock-recovery');
      let recovery;
      try { recovery = await fs.open(recoveryPath, 'wx', 0o600); }
      catch (claim) { if (claim.code !== 'EEXIST') throw claim; throw new Error('Interrupted/concurrent lock recovery; inspect lock-recovery before resuming'); }
      try {
        let current;
        try { current = JSON.parse(await fs.readFile(lockPath, 'utf8')); } catch (read) { if (read.code !== 'ENOENT') throw read; }
        if (current?.id === previous.id) await fs.rename(lockPath, `${lockPath}.recovered.${randomUUID()}`);
      } finally { await recovery.close(); await fs.unlink(recoveryPath); }

    }
  }
  if (!handle) throw new Error('Could not acquire cadence ownership');
  try {
    await handle.writeFile(JSON.stringify(owner)); await handle.sync();
    return await action();
  } finally {
    await handle.close();
    try {
      const current = JSON.parse(await fs.readFile(lockPath, 'utf8'));
      if (current.id === owner.id) await fs.unlink(lockPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export async function loadState(root, { optional = false, recover = false } = {}) {
  const file = path.join(root, 'events.jsonl');
  let data;
  try { data = await fs.readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT' && optional) return null; throw error; }
  let state = null, seq = 0;
  const lines = data.split('\n');
  const incomplete = lines.pop();
  for (const line of lines) {
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.seq !== seq + 1 || event.state?.eventsSeq !== event.seq) throw new Error(`Cadence event sequence broken at ${seq + 1}`);
    seq = event.seq; state = event.state;
  }
  if (incomplete) {
    if (!recover) throw new Error('Interrupted event append; use resume to preserve and recover the incomplete tail');
    await fs.writeFile(path.join(root, `interrupted-tail-${randomUUID()}.jsonl`), incomplete, { flag: 'wx', mode: 0o600 });
    const boundary = data.lastIndexOf('\n') + 1;
    const handle = await fs.open(file, 'r+');
    try { await handle.truncate(Buffer.byteLength(data.slice(0, boundary))); await handle.sync(); }
    finally { await handle.close(); }
  }
  if (!state && !optional) throw new Error('Cadence run has no committed state');
  return state;
}

export async function saveEvent(root, state, type, detail = {}) {
  state.eventsSeq = (state.eventsSeq ?? 0) + 1;
  const event = { schemaVersion: 1, id: randomUUID(), seq: state.eventsSeq, type,
    occurredAt: new Date().toISOString(), detail, state };
  const handle = await fs.open(path.join(root, 'events.jsonl'), 'a', 0o600);
  try { await handle.writeFile(`${JSON.stringify(event)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  await atomicJson(path.join(root, 'state.json'), state);
  return event;
}
