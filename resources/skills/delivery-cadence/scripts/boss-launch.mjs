import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { minimalEnvironment } from './lib/process.mjs';
import { writeJson } from './lib/hook-registry.mjs';

function argumentsOf(values) {
  const args = {};
  for (let i = 0; i < values.length; i++) {
    const name = values[i];
    if (['--keep-open', '--require-scenario'].includes(name)) args[name.slice(2)] = true;
    else if (['--repository', '--app', '--scenario', '--receipt', '--timeout-ms'].includes(name)) {
      if (!values[i + 1] || values[i + 1].startsWith('--')) throw new Error(`${name} requires a value.`);
      args[name.slice(2)] = values[++i];
    } else throw new Error(`Unknown argument: ${name}`);
  }
  return args;
}
function cdp(url, signal) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let next = 1;
    const fail = error => { for (const waiter of pending.values()) waiter.reject(error); pending.clear(); };
    const cancel = () => { fail(new Error('Renderer operation cancelled or timed out.')); socket.close(); reject(new Error('Renderer connection cancelled.')); };
    signal.addEventListener('abort', cancel, { once: true });
    socket.addEventListener('error', () => { fail(new Error('Renderer connection failed.')); reject(new Error('Renderer connection failed.')); });
    socket.addEventListener('close', () => { signal.removeEventListener('abort', cancel); fail(new Error('Renderer connection closed.')); });
    socket.addEventListener('message', message => {
      const response = JSON.parse(String(message.data));
      const waiter = pending.get(response.id);
      if (!waiter) return;
      pending.delete(response.id);
      if (response.error || response.result?.exceptionDetails) waiter.reject(new Error('Renderer evaluation failed.'));
      else waiter.resolve(response.result?.result?.value);
    });
    socket.addEventListener('open', () => resolve({
      evaluate(expression) {
        signal.throwIfAborted();
        if (typeof expression !== 'string') throw new Error('evaluate requires JavaScript source text.');
        const id = next++;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
        });
      },
      close() { socket.close(); },
    }));
  });
}
const readinessExpression = `(() => {
  const root = document.querySelector('#root') || document.body;
  const bodyTextLength = (root?.innerText || '').trim().length;
  const visibleElementCount = [...(root?.querySelectorAll('*') || [])].filter(node => {
    const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }).length;
  return {readyState: document.readyState, title: document.title, url: location.href,
    bodyTextLength, visibleElementCount, ready: document.readyState === 'complete' && bodyTextLength > 0 && visibleElementCount > 0};
})()`;

export async function launchBoss(args) {
  if (process.platform !== 'darwin') throw new Error('This launcher supports the macOS .app build only.');
  if (!args.repository) throw new Error('--repository is required.');
  if (args['require-scenario'] && !args.scenario) throw new Error('Completed-feature functional acceptance requires --scenario.');
  const repository = fs.realpathSync(path.resolve(args.repository));
  const app = fs.realpathSync(path.resolve(args.app ?? path.join(repository, 'dist', 'mac-arm64', 'The Boss.app')));
  const executable = path.join(app, 'Contents', 'MacOS', 'The Boss');
  const executableStat = fs.statSync(executable);
  if (!executableStat.isFile()) throw new Error('The Boss executable is missing.');
  const timeoutMs = Number(args['timeout-ms'] ?? 60_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  const scenario = args.scenario ? fs.realpathSync(path.resolve(args.scenario)) : null;
  if (scenario && path.extname(scenario) !== '.mjs') throw new Error('Scenario must be a trusted .mjs file.');
  const scenarioDigest = scenario ? createHash('sha256').update(fs.readFileSync(scenario)).digest('hex') : null;
  const receiptFile = path.resolve(args.receipt ?? path.join(repository, '.prometheus', 'cadence', 'receipts', `boss-launch-${randomUUID()}.json`));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-boss-'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const abort = () => controller.abort('operator cancellation');
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const startedAt = new Date().toISOString();
  const child = spawn(executable, ['--lang=en-US', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${userData}`], {
    cwd: repository, env: minimalEnvironment(), detached: true, shell: false, stdio: 'ignore',
  });
  let launchError = false, closed = false, connection, retain = false;
  child.once('error', () => { launchError = true; });
  child.once('close', () => { closed = true; });
  const signal = controller.signal;
  const ensureAlive = () => {
    signal.throwIfAborted();
    if (launchError || closed) throw new Error('The Boss exited before the launch operation completed.');
  };
  const receipt = { schemaVersion: 1, kind: 'boss-launch', startedAt, repository, app, executable,
    executableModifiedAt: executableStat.mtime.toISOString(), executableBytes: executableStat.size,
    scenario, scenarioDigest, isolatedUserData: userData, launch: 'pending', functionalAcceptance: 'not-performed' };
  try {
    let port;
    while (!port) {
      ensureAlive();
      const activePort = path.join(userData, 'DevToolsActivePort');
      if (fs.existsSync(activePort)) {
        const firstLine = fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0];
        if (/^\d+$/.test(firstLine) && Number(firstLine) > 0 && Number(firstLine) <= 65535) port = Number(firstLine);
      }
      if (!port) await delay(200, undefined, { signal });
    }
    let targets, target;
    while (!target) {
      ensureAlive();
      targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal }).then(response => {
        if (!response.ok) throw new Error('DevTools targets could not be read.');
        return response.json();
      });
      target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url !== 'about:blank');
      if (!target) await delay(200, undefined, { signal });
    }
    const debugUrl = new URL(target.webSocketDebuggerUrl);
    if (!['127.0.0.1', 'localhost'].includes(debugUrl.hostname)) throw new Error('DevTools endpoint must remain local.');
    connection = await cdp(debugUrl.href, signal);
    let rendered;
    do {
      ensureAlive();
      rendered = await connection.evaluate(readinessExpression);
      if (!rendered?.ready) await delay(200, undefined, { signal });
    } while (!rendered?.ready);
    receipt.launch = 'renderer-ready';
    receipt.renderer = rendered;
    if (scenario) {
      const module = await import(pathToFileURL(scenario).href);
      if (typeof module.default !== 'function') throw new Error('Scenario must export a default async function.');
      const result = await Promise.race([
        module.default({ evaluate: connection.evaluate, targets, signal }),
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Scenario timed out or was cancelled.')), { once: true })),
      ]);
      ensureAlive();
      if (!result || typeof result.observedBehavior !== 'string' || !result.observedBehavior.trim() || result.passed === false) throw new Error('Scenario did not report a successful observed behavior.');
      receipt.functionalAcceptance = 'scenario-confirmed';
      receipt.observedBehavior = result.observedBehavior.slice(0, 2000);
    }
    retain = Boolean(args['keep-open']);
    receipt.status = 'success';
  } catch (error) {
    receipt.status = 'failed';
    receipt.failure = signal.aborted ? 'timeout-or-cancellation' : 'launch-or-scenario-failed';
    // Details go to the operator; arbitrary scenario output is not persisted.
    process.stderr.write(`${error instanceof Error ? error.message : 'Launch cancelled.'}\n`);
  } finally {
    connection?.close();
    clearTimeout(timeout);
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    if (retain) child.unref();
    else if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      await delay(300);
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    receipt.keptOpen = retain;
    receipt.pid = retain ? child.pid : null;
    receipt.finishedAt = new Date().toISOString();
    writeJson(receiptFile, receipt);
    // Preserve the isolated profile for inspection; never touch installed app data.
  }
  return { ...receipt, receiptFile };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await launchBoss(argumentsOf(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === 'success' ? 0 : 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
