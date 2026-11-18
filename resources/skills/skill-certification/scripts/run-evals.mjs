// Run a skill's certification cases (<skill>/evals/) with `claude plugin eval`.
//
// Two modes measure different things:
//   isolated  the skill directory is the only thing loaded. Measures whether the
//             skill changes the outcome (level C3) and whether its description
//             triggers when nothing competes with it.
//   pack      a whole plugin is loaded. Measures triggering under real
//             competition (level C2 as users experience it).
//
// These are real, billed model runs. Run them at a phase boundary, not as a
// development loop.
//
// Usage:
//   node run-evals.mjs --mode isolated|pack --out <dir> [--runs 5] [--model <id>]
//                      [--max-cost-usd 8] [--jobs 3] [--plugin <plugin-dir>] <skill-dir>...
//
// --plugin names the plugin directory that pack mode loads (a directory with
// skills/ at its top level). Inside the mini pack's repository it defaults to the
// generated plugin, dist/plugins/claude/prometheus-skills-mini.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveOnPath, runExecutable } from './process.mjs';

const DEFAULT_PLUGIN = path.join('dist', 'plugins', 'claude', 'prometheus-skills-mini');

function fail(message, code) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

const options = { mode: '', out: '', runs: '5', model: '', maxCost: '8', jobs: '3', plugin: '' };
const skills = [];
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const value = argv[index];
  const next = () => argv[++index] ?? fail(`missing value for ${value}`, 64);
  if (value === '--mode') options.mode = next();
  else if (value === '--out') options.out = next();
  else if (value === '--runs') options.runs = next();
  else if (value === '--model') options.model = next();
  else if (value === '--max-cost-usd') options.maxCost = next();
  else if (value === '--jobs') options.jobs = next();
  else if (value === '--plugin') options.plugin = next();
  else skills.push(path.resolve(value));
}
if (!['isolated', 'pack'].includes(options.mode)) fail('--mode must be isolated or pack', 64);
if (!options.out) fail('--out <dir> is required', 64);
if (skills.length === 0) fail('give at least one skill directory', 64);

// `claude` must be a real executable. An npm-installed shim (claude.cmd) cannot be
// started without a shell on Windows; install the native build instead.
const claude = resolveOnPath('claude');
if (!claude) fail('claude CLI not found on PATH', 69);
if (process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(claude)) {
  fail(`claude resolves to a shell shim (${path.basename(claude)}); install the native Claude Code build to run evals on Windows`, 69);
}

const out = path.resolve(options.out);
fs.mkdirSync(out, { recursive: true });

// --no-publish keeps the HTML report on this machine. --scaffold is never
// passed: a scaffold script is bash, and this pack ships no shell script.
const common = ['--runs', options.runs, '-j', options.jobs, '--max-cost-usd', options.maxCost, '--no-publish', '--trust-plugin'];
if (options.model) common.push('--model', options.model);

function evaluate(cwd, extra, target) {
  fs.mkdirSync(target, { recursive: true });
  const result = spawnSync(claude, ['plugin', 'eval', '.', ...extra, ...common, '--output-dir', target, '--json', path.join(target, 'result.json')], {
    cwd, encoding: 'utf8', maxBuffer: 64e6, shell: false, windowsHide: true,
  });
  fs.writeFileSync(path.join(target, 'stdout.txt'), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result.status === 0;
}

let clean = true;
if (options.mode === 'isolated') {
  for (const skill of skills) {
    if (!fs.existsSync(path.join(skill, 'evals'))) {
      process.stderr.write(`skip ${skill} (no evals/)\n`);
      continue;
    }
    const name = path.basename(skill);
    process.stdout.write(`== isolated: ${name}\n`);
    if (!evaluate(skill, [], path.join(out, name))) clean = false;
  }
} else {
  // `claude plugin eval` refuses an eval directory inside a loaded skills/ tree,
  // so the plugin is evaluated from a scratch copy with the cases copied beside it.
  let source = options.plugin ? path.resolve(options.plugin) : '';
  if (!source) {
    const top = runExecutable('git', ['rev-parse', '--show-toplevel']);
    if (top.available && top.status === 0) source = path.join(top.stdout.trim(), DEFAULT_PLUGIN);
  }
  if (!source || !fs.existsSync(path.join(source, 'skills'))) {
    fail('no plugin to load; pass --plugin <plugin-dir> (or run npm run build:distribution in the mini pack)', 66);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-cert-pack-'));
  const pack = path.join(work, 'pack');
  fs.cpSync(source, pack, { recursive: true });
  for (const skill of skills) {
    if (!fs.existsSync(path.join(skill, 'evals'))) {
      process.stderr.write(`skip ${skill} (no evals/)\n`);
      continue;
    }
    fs.cpSync(path.join(skill, 'evals'), path.join(pack, 'certevals', path.basename(skill)), { recursive: true });
  }
  process.stdout.write(`== pack: ${skills.length} skill(s), scratch copy at ${work}\n`);
  if (!evaluate(pack, ['--eval-dir', 'certevals'], out)) clean = false;
}

// A non-zero status means at least one case scored below its threshold, which is
// a finding and not a tool failure. Read the summary, not the exit code.
process.stdout.write(`results in ${out} (summarise with summarize-evals.mjs, or pass them to certify.mjs --results)\n`);
process.exitCode = clean ? 0 : 1;
