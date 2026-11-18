// Child processes for the certification scripts. Self-contained on purpose: a
// skill is copied on its own, so it cannot import the pack's lib/platform.
//
// Every command is spawned with an argument array and `shell: false`. On Windows
// npm installs a CLI as `<name>.cmd`, and Node cannot start a `.cmd` or `.bat`
// without a shell, so a name that resolves only to one of those is reported as
// unavailable instead of being run through a shell.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SHELL_SHIM = /\.(cmd|bat|ps1)$/i;

/** The file a bare command name resolves to on PATH, or null. */
export function resolveOnPath(name, env = process.env, platform = process.platform) {
  if (name.includes('/') || name.includes('\\')) return fs.existsSync(name) ? name : null;
  const directories = String(env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  const extensions = platform === 'win32'
    ? ['', ...String(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)]
    : [''];
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = path.join(directory, name + extension);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

/**
 * Run a real executable by name. Returns `{ available: false, reason }` when the
 * name is not on PATH or resolves to a shell shim; otherwise the spawn result
 * with `available: true`.
 */
export function runExecutable(name, args = [], options = {}) {
  const resolved = resolveOnPath(name, options.env ?? process.env);
  if (!resolved) return { available: false, reason: `${name} is not on PATH` };
  if (process.platform === 'win32' && SHELL_SHIM.test(resolved)) {
    return { available: false, reason: `${name} resolves to a shell shim (${path.basename(resolved)}), which cannot be started without a shell` };
  }
  const result = spawnSync(resolved, args, { encoding: 'utf8', maxBuffer: 32e6, timeout: 300_000, shell: false, windowsHide: true, ...options });
  if (result.error) return { available: false, reason: result.error.message };
  return { available: true, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Run one of this skill's own scripts (or any JavaScript file) with the current Node. */
export function runNode(file, args = [], options = {}) {
  const result = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', maxBuffer: 32e6, timeout: 300_000, shell: false, windowsHide: true, ...options });
  return { available: !result.error, reason: result.error?.message, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
