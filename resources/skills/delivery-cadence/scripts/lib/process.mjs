import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const LIMIT = 32_000;
export function minimalEnvironment(names = [], supplied = process.env) {
  const keep = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL'];
  return Object.fromEntries([...new Set([...keep, ...names])].filter(k => supplied[k] !== undefined).map(k => [k, supplied[k]]));
}

function executable(spec, cwd, env) {
  let command = spec.command;
  let args = spec.args ?? [];
  if (process.platform === 'win32' && /^(pnpm|pnpm\.cmd)$/i.test(command)) {
    const candidates = [];
    try {
      const require = createRequire(path.join(cwd, 'package.json'));
      candidates.push(require.resolve('pnpm/bin/pnpm.cjs'));
    } catch {}
    for (const directory of String(env.PATH ?? env.Path ?? '').split(path.delimiter)) {
      candidates.push(path.join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
      candidates.push(path.join(directory, 'pnpm.cjs'));
    }
    const entry = candidates.find(existsSync);
    if (!entry) throw new Error('Cannot resolve pnpm JavaScript entry; configure command as node with the pnpm.cjs path.');
    command = process.execPath;
    args = [entry, ...args];
  }
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) throw new Error('Shell shims are unsupported; configure their JavaScript entry.');
  return { command, args };
}

/** Array-only subprocess API. IPC is reserved for the hook adapter. */
export async function runCommand(spec, { cwd = process.cwd(), env = process.env, signal, onOutput, onSpawn } = {}) {
  if (!spec || typeof spec.command !== 'string' || !Array.isArray(spec.args ?? []) || !(spec.args ?? []).every(a => typeof a === 'string')) throw new Error('Command requires a program and string argument array.');
  const timeoutMs = spec.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  const startedAt = new Date().toISOString();
  if (signal?.aborted) return { status: 'cancelled', exitCode: null, signal: null, stdout: '', stderr: '', processStopped: true, startedAt, finishedAt: startedAt };
  const launch = executable(spec, cwd, env);
  return new Promise(resolve => {
    let stdout = '', stderr = '', reason = null, settled = false, killTimer, message, termination = null;
    const child = spawn(launch.command, launch.args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: spec.ipc ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe'] });
    const capture = (stream, data) => {
      const text = String(data);
      if (stream === 'stdout') stdout = (stdout + text).slice(-LIMIT);
      else stderr = (stderr + text).slice(-LIMIT);
      onOutput?.(stream, text);
    };
    child.stdout.on('data', d => capture('stdout', d));
    child.stderr.on('data', d => capture('stderr', d));
    child.on('spawn', () => onSpawn?.(child.pid));
    child.on('message', value => { if (value?.type === 'result') message = value; });
    const killTree = force => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        return new Promise(done => {
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', ...(force ? ['/F'] : [])], { shell: false, windowsHide: true, stdio: 'ignore' });
          killer.on('error', () => done(false));
          killer.on('close', code => done(code === 0));
        });
      } else {
        try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); return true; } catch (error) { return error.code === 'ESRCH'; }
      }
    };
    const stop = why => {
      if (reason || settled) return;
      reason = why;
      if (child.connected) child.send({ type: 'abort', reason: why }, () => {});
      // Give the handler's AbortSignal a brief opportunity to cancel its requests.
      killTimer = setTimeout(() => { termination = Promise.resolve(killTree(true)); }, 100);
    };
    const abort = () => stop('cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const finish = async (code, terminationSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Kill remaining descendants even if the parent exits during graceful cancellation.
      let processStopped = true;
      if (reason) {
        processStopped = await (termination ?? Promise.resolve(killTree(true)));
        if (processStopped && child.pid && process.platform !== 'win32') {
          processStopped = false;
          for (let attempt = 0; attempt < 50; attempt++) {
            try { process.kill(-child.pid, 0); }
            catch (error) { processStopped = error.code === 'ESRCH'; break; }
            await new Promise(done => setTimeout(done, 20));
          }
        }
      }
      else if (child.pid && process.platform !== 'win32') {
        try { process.kill(-child.pid, 0); processStopped = false; } catch (error) { processStopped = error.code === 'ESRCH'; }
      }
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      resolve({ status: !processStopped ? 'unknown' : reason ?? (code === 0 ? 'success' : 'failed'), processStopped, exitCode: code, signal: terminationSignal, stdout, stderr, startedAt, finishedAt: new Date().toISOString(), ...(message ? { message } : {}) });
    };
    child.on('error', error => { stderr = error.message; finish(null, null); });
    child.on('close', finish);
    if (spec.ipc) child.on('spawn', () => child.send(spec.message, error => { if (error) stop('failed'); }));
    if (spec.input !== undefined) child.stdin.end(String(spec.input)); else child.stdin.end();
  });
}
