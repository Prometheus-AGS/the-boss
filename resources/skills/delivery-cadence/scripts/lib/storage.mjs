import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const TAIL_CHUNK_BYTES = 64 * 1024;

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
  let handle;
  try { handle = await fs.open(file, 'r'); }
  catch (error) { if (error.code === 'ENOENT' && optional) return null; throw error; }
  let event = null, boundary = 0, incomplete = false;
  try {
    const { size } = await handle.stat();
    boundary = size;
    let eventEnd = size;
    if (size) {
      const last = Buffer.allocUnsafe(1);
      await handle.read(last, 0, 1, size - 1);
      if (last[0] === 0x0a) eventEnd--;
      else {
        incomplete = true;
        boundary = (await previousNewline(handle, size)) + 1;
        eventEnd = boundary - 1;
      }
    }
    while (eventEnd >= 0 && !event) {
      const previous = await previousNewline(handle, eventEnd);
      const length = eventEnd - previous - 1;
      if (length) {
        const line = Buffer.allocUnsafe(length);
        await handle.read(line, 0, length, previous + 1);
        event = JSON.parse(line.toString('utf8'));
      }
      eventEnd = previous;
    }
    if (incomplete && !recover) throw new Error('Interrupted event append; use resume to preserve and recover the incomplete tail');
    if (incomplete) await preserveIncompleteTail(root, file, boundary, size);
  } finally { await handle.close(); }
  if (incomplete) {
    const writable = await fs.open(file, 'r+');
    try { await writable.truncate(boundary); await writable.sync(); }
    finally { await writable.close(); }
  }
  if (event && (!Number.isSafeInteger(event.seq) || event.seq < 1 || event.state?.eventsSeq !== event.seq)) {
    throw new Error(`Cadence final event sequence is invalid at ${event?.seq ?? 'unknown'}`);
  }
  if (!event) {
    if (optional) return null;
    throw new Error('Cadence run has no committed state');
  }
  let snapshot = null;
  try { snapshot = JSON.parse(await fs.readFile(path.join(root, 'state.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (snapshot && snapshot.eventsSeq > event.seq) throw new Error(`Cadence snapshot sequence ${snapshot.eventsSeq} is ahead of event log ${event.seq}`);
  return snapshot?.eventsSeq === event.seq ? snapshot : event.state;
}

async function previousNewline(handle, before) {
  for (let cursor = before; cursor > 0;) {
    const length = Math.min(TAIL_CHUNK_BYTES, cursor), start = cursor - length;
    const chunk = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(chunk, 0, length, start);
    for (let index = bytesRead - 1; index >= 0; index--) if (chunk[index] === 0x0a) return start + index;
    cursor = start;
  }
  return -1;
}

async function preserveIncompleteTail(root, file, start, end) {
  const recovered = await fs.open(path.join(root, `interrupted-tail-${randomUUID()}.jsonl`), 'wx', 0o600);
  const source = await fs.open(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(TAIL_CHUNK_BYTES);
    for (let position = start; position < end;) {
      const { bytesRead } = await source.read(chunk, 0, Math.min(chunk.length, end - position), position);
      if (!bytesRead) throw new Error('Interrupted event tail changed during recovery');
      await recovered.write(chunk, 0, bytesRead);
      position += bytesRead;
    }
    await recovered.sync();
  } finally { await source.close(); await recovered.close(); }
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
