import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { relativeFile } from './validation.mjs';

export interface Change { file: string; absolute: string; before: string | null; after: string }
export const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Resolve existing links without allowing an instruction/config write outside the project. */
export function projectFile(root: string, file: string): string {
  relativeFile(file);
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    try { current = fs.realpathSync(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { if (fs.lstatSync(current).isSymbolicLink()) throw Error(`Broken project link cannot be safely updated: ${file}`); }
      catch (missing) { if ((missing as NodeJS.ErrnoException).code !== 'ENOENT') throw missing; }
    }
    const rel = path.relative(root, current);
    if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw Error(`Project path escapes through a link: ${file}`);
  }
  return current;
}
export function readFile(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function stage(changes: Map<string, Change>, root: string, file: string, content: string): void {
  const absolute = projectFile(root, file);
  const prior = changes.get(absolute);
  if (prior && prior.after !== content) throw Error(`Conflicting writes to linked project file: ${file}`);
  const before = readFile(absolute);
  if (before !== content) changes.set(absolute, { file, absolute, before, after: content });
}

function atomicReplace(file: string, content: string): void {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, content); fs.fsyncSync(descriptor); }
  catch (error) { fs.closeSync(descriptor); fs.rmSync(temporary, { force: true }); throw error; }
  fs.closeSync(descriptor);
  try {
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(temporary, file); break; }
      catch (error) {
        const transient = ['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '');
        if (process.platform !== 'win32' || !transient || attempt >= 6) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * 2 ** attempt);
      }
    }
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function commitChanges(root: string, changes: Change[], context?: Record<string, unknown>): string | null {
  if (!changes.length) return null;
  const receiptId = hash(JSON.stringify(changes.map(c => [c.file, c.before, c.after]))).slice(0, 24);
  const recovery = `.agent-team/recovery/${receiptId}.json`;
  const recoveryFile = projectFile(root, recovery);
  // Recovery is inspectable and contains exact previous bytes before the first edit.
  const receipt = JSON.stringify({ schemaVersion: 1, ...(context ? { context } : {}), files: changes.map(c => ({ file: path.relative(root, c.absolute).split(path.sep).join('/'), before: c.before, afterSha256: hash(c.after) })) }, null, 2) + '\n';
  const existing = readFile(recoveryFile);
  if (existing !== null && existing !== receipt) throw Error('Recovery receipt collision');
  fs.mkdirSync(path.dirname(recoveryFile), { recursive: true });
  if (existing === null) atomicReplace(recoveryFile, receipt);
  const written: Change[] = [];
  try {
    for (const change of changes) {
      if (readFile(change.absolute) !== change.before) throw Error(`Project changed after preflight: ${change.file}`);
      fs.mkdirSync(path.dirname(change.absolute), { recursive: true });
      atomicReplace(change.absolute, change.after);
      written.push(change);
    }
  } catch (error) {
    for (const change of written.reverse()) {
      if (change.before === null) fs.unlinkSync(change.absolute);
      else atomicReplace(change.absolute, change.before);
    }
    throw error;
  }
  return recovery;
}
