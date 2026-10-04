import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';

const ACTIVE_LIMIT = 512 * 1024 * 1024;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const archiveFile = root => path.join(root, 'event-archives.json');

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

async function archives(root) {
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(archiveFile(root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, segments: [] }; throw error; }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.segments)) throw new Error('Unsupported cadence archive manifest');
  let expected = 1;
  for (const segment of manifest.segments) {
    if (segment.firstSeq !== expected || !Number.isSafeInteger(segment.lastSeq) || segment.lastSeq < expected ||
        !/^[a-f0-9-]+\.jsonl\.gz$/.test(segment.file) || !/^[a-f0-9]{64}$/.test(segment.sha256) ||
        !/^[a-f0-9]{64}$/.test(segment.stateSha256)) {
      throw new Error(`Cadence archive sequence or metadata broken at ${expected}`);
    }
    const stat = await fs.stat(path.join(root, 'archives', segment.file));
    if (stat.size !== segment.bytes) throw new Error(`Cadence archive size changed: ${segment.file}`);
    expected = segment.lastSeq + 1;
  }
  return manifest;
}

async function tailLine(file, recover) {
  const handle = await fs.open(file, recover ? 'r+' : 'r');
  try {
    let { size } = await handle.stat();
    if (!size) return null;
    const lastByte = Buffer.allocUnsafe(1);
    await handle.read(lastByte, 0, 1, size - 1);
    let completeEnd = size;
    if (lastByte[0] !== 10) {
      if (!recover) throw new Error('Interrupted event append; use resume to preserve and recover the incomplete tail');
      let offset = size, newline = -1;
      while (offset > 0 && newline < 0) {
        const length = Math.min(1024 * 1024, offset), block = Buffer.allocUnsafe(length);
        offset -= length; await handle.read(block, 0, length, offset);
        const at = block.lastIndexOf(10); if (at >= 0) newline = offset + at;
      }
      completeEnd = newline + 1;
      const tailFile = path.join(path.dirname(file), `interrupted-tail-${randomUUID()}.jsonl`);
      await pipeline(createReadStream(file, { start: completeEnd }), createWriteStream(tailFile, { flags: 'wx', mode: 0o600 }));
      await handle.truncate(completeEnd); await handle.sync(); size = completeEnd;
    }
    if (!size) return null;
    let offset = size - 1, previous = -1;
    while (offset > 0 && previous < 0) {
      const length = Math.min(1024 * 1024, offset), block = Buffer.allocUnsafe(length);
      offset -= length; await handle.read(block, 0, length, offset);
      const at = block.lastIndexOf(10); if (at >= 0) previous = offset + at;
    }
    const start = previous + 1, length = size - start - 1;
    const line = Buffer.allocUnsafe(length);
    for (let read = 0; read < length;) {
      const result = await handle.read(line, read, length - read, start + read);
      if (!result.bytesRead) throw new Error('Cadence event changed while reading');
      read += result.bytesRead;
    }
    return JSON.parse(line.toString('utf8'));
  } finally { await handle.close(); }
}

async function firstSequence(file) {
  const handle = await fs.open(file, 'r');
  try {
    const prefix = Buffer.alloc(512);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    const match = prefix.subarray(0, bytesRead).toString('utf8').match(/"seq":(\d+),/);
    if (!match) throw new Error('Cadence active log has no readable first sequence');
    return Number(match[1]);
  } finally { await handle.close(); }
}

async function replayActive(file, firstSeq) {
  let expected = firstSeq, state = null;
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.seq !== expected || event.state?.eventsSeq !== expected) throw new Error(`Cadence event sequence broken at ${expected}`);
    expected++; state = event.state;
  }
  return { seq: expected - 1, state };
}

// saveEvent appends before it writes state.json, so a snapshot may trail the log
// after a crash but can never lead it or diverge from the event at the same seq.
async function reconcileSnapshot(root, event) {
  let snapshot;
  try { snapshot = JSON.parse(await fs.readFile(path.join(root, 'state.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return event.state; throw error; }
  if (snapshot.eventsSeq > event.seq) throw new Error(`Cadence snapshot sequence ${snapshot.eventsSeq} is ahead of event log ${event.seq}`);
  if (snapshot.eventsSeq !== event.seq) return event.state;
  if (digest(snapshot) !== digest(event.state)) throw new Error(`Cadence snapshot diverges from event ${event.seq}`);
  return snapshot;
}

export async function loadState(root, { optional = false, recover = false } = {}) {
  const manifest = await archives(root);
  const lastArchive = manifest.segments.at(-1);
  let event;
  try { event = await tailLine(path.join(root, 'events.jsonl'), recover); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (event) {
    const first = await firstSequence(path.join(root, 'events.jsonl'));
    const expected = (lastArchive?.lastSeq ?? 0) + 1;
    const pendingArchive = lastArchive && first === lastArchive.firstSeq && event.seq === lastArchive.lastSeq;
    if (!Number.isSafeInteger(event.seq) || event.seq < (lastArchive?.lastSeq ?? 0) || event.state?.eventsSeq !== event.seq) {
      throw new Error(`Cadence event sequence broken at ${event.seq}`);
    }
    if (first !== expected && !pendingArchive) throw new Error(`Cadence active log starts at ${first}, expected ${expected}`);
    if ((await fs.stat(path.join(root, 'events.jsonl'))).size <= ACTIVE_LIMIT) {
      const replay = await replayActive(path.join(root, 'events.jsonl'), first);
      if (replay.seq !== event.seq || digest(replay.state) !== digest(event.state)) throw new Error('Cadence active replay does not match its final event');
    }
    return reconcileSnapshot(root, event);
  }
  if (lastArchive) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path.join(root, 'archives', lastArchive.file))) hash.update(chunk);
    if (hash.digest('hex') !== lastArchive.sha256) throw new Error('Cadence archive checksum does not match its manifest');
    const state = JSON.parse(await fs.readFile(path.join(root, 'state.json'), 'utf8'));
    if (state.eventsSeq !== lastArchive.lastSeq || digest(state) !== lastArchive.stateSha256) {
      throw new Error('Cadence snapshot does not match its archived event boundary');
    }
    return state;
  }
  if (optional) return null;
  throw new Error('Cadence run has no committed state');
}

async function rotate(root, state) {
  const file = path.join(root, 'events.jsonl');
  const stat = await fs.stat(file);
  const manifest = await archives(root), previous = manifest.segments.at(-1);
  if (stat.size < ACTIVE_LIMIT && !previous) return;
  if (stat.size < ACTIVE_LIMIT && previous) {
    const first = stat.size ? await firstSequence(file) : previous.lastSeq + 1;
    if (first === previous.lastSeq + 1) return;
  }
  const activeLast = await tailLine(file, false);
  if (!activeLast || activeLast.seq !== state.eventsSeq) throw new Error('Cadence active log does not match its current sequence');
  if (previous?.lastSeq === state.eventsSeq && previous.stateSha256 === digest(activeLast.state)) {
    const handle = await fs.open(file, 'r+');
    try { await handle.truncate(0); await handle.sync(); } finally { await handle.close(); }
    return;
  }
  const firstSeq = (previous?.lastSeq ?? 0) + 1;
  const directory = path.join(root, 'archives'); await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  let expected = firstSeq, lastState = null;
  const source = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  async function* validatedLines() {
    for await (const line of source) {
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.seq !== expected || event.state?.eventsSeq !== expected) throw new Error(`Cadence event sequence broken at ${expected}`);
      expected++; lastState = event.state;
      yield `${line}\n`;
    }
  }
  try {
    await pipeline(Readable.from(validatedLines()), createGzip({ level: 6 }), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    if (expected - 1 !== state.eventsSeq || digest(lastState) !== digest(activeLast.state)) throw new Error('Cadence archive does not match the current event');
    const staged = await fs.open(temporary, 'r');
    try { await staged.sync(); } finally { await staged.close(); }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(temporary)) hash.update(chunk);
    const sha256 = hash.digest('hex');
    const name = `${firstSeq.toString(16)}-${state.eventsSeq.toString(16)}-${sha256}.jsonl.gz`;
    const archived = path.join(directory, name);
    try { await fs.rename(temporary, archived); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = createHash('sha256');
      for await (const chunk of createReadStream(archived)) existing.update(chunk);
      if (existing.digest('hex') !== sha256) throw new Error(`Conflicting cadence archive: ${name}`);
    }
    const segment = { file: name, firstSeq, lastSeq: state.eventsSeq, bytes: (await fs.stat(archived)).size,
      sha256, stateSha256: digest(activeLast.state) };
    await atomicJson(path.join(root, 'state.json'), activeLast.state);
    await atomicJson(archiveFile(root), { schemaVersion: 1, segments: [...manifest.segments, segment] });
    const handle = await fs.open(file, 'r+');
    try { await handle.truncate(0); await handle.sync(); } finally { await handle.close(); }
  } finally {
    try { await fs.unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export async function saveEvent(root, state, type, detail = {}) {
  if (state.eventsSeq) await rotate(root, state);
  state.eventsSeq = (state.eventsSeq ?? 0) + 1;
  const event = { schemaVersion: 1, id: randomUUID(), seq: state.eventsSeq, type,
    occurredAt: new Date().toISOString(), detail, state };
  const handle = await fs.open(path.join(root, 'events.jsonl'), 'a', 0o600);
  try { await handle.writeFile(`${JSON.stringify(event)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  await atomicJson(path.join(root, 'state.json'), state);
  return event;
}
