import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const names = ['AGENTS.md', 'CLAUDE.md'];
const heading = '## Goals-first development';
const axiom = 'Always think in terms of user goals and value—not in tests or assumptions.';
const policy = [
  heading, '', axiom, '',
  '- In KBD Assess → Analyze → Plan → Execute → Reflect, name the actual user or operator, goal, value, real inputs and conditions, and observable outcome. Trace the real workflow and source of truth first. Record the rule, expected outcome, evidence, exceptions and unresolved assumptions in the accepted specification or behavior contract.',
  '- Verify meaningful reachable outcomes through scoped phase-end VLBV/Gherkin in the existing approved process. Exercise the actual user-facing workflow, including the browser when relevant. Preserve established build, verification and release processes and signed gates. Do not invent unrelated checks or wait for a full suite unless required or warranted by material risk.',
  '- Record evidence, limits and how the user gets the value. Complete the authorized handoff or PR after the applicable compile and changed-behavior checks at the approved boundary. Do not bypass approval or delay a ready handoff for unrelated nits or an unnecessary draft.', '',
].join('\n');

class Usage extends Error {}
const reject = (message) => { throw new Error(message); };
const sha = (text) => createHash('sha256').update(text).digest('hex');

export function isExistingProjectMode(args) {
  return args.some((arg) => ['--audit', '--preview', '--apply'].includes(arg) || arg.startsWith('--apply='));
}

function parse(args) {
  let root, mode, digest;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--path' && root === undefined && args[i + 1] && !args[i + 1].startsWith('--')) root = args[++i];
    else if (!mode && ['--audit', '--preview', '--apply'].includes(arg)) {
      mode = arg.slice(2);
      if (mode === 'apply') digest = args[++i];
    } else throw new Usage('use --path <Git root> and exactly one of --audit, --preview, --apply <sha256>');
  }
  if (!root || !mode || (mode === 'apply' && !/^[a-f0-9]{64}$/.test(digest ?? ''))) {
    throw new Usage('use --path <Git root> and exactly one of --audit, --preview, --apply <sha256>');
  }
  return { root: fs.realpathSync(root), mode, digest };
}

function git(root, args, codes = [0]) {
  // Keep Git scoped to this working tree; caller environment cannot select another index/worktree.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const literal = args[0] === 'check-ignore' ? [] : ['--literal-pathspecs'];
  const r = spawnSync('git', ['--no-optional-locks', ...literal, '-C', root, ...args], {
    encoding: 'utf8', env, windowsHide: true,
  });
  if (r.error || !codes.includes(r.status)) reject('Git could not inspect the exact project root or named instructions');
  return r;
}

function readEntry(root, name, head) {
  const file = path.join(root, name);
  const index = git(root, ['ls-files', '--stage', '--', name]).stdout.trim();
  if (index.includes('\n') || (index && !/^(100644|100755|120000) [0-9a-f]+ 0\t/.test(index))) {
    reject(name + ': unresolved index or unsupported Git entry');
  }
  const ignored = !index && git(root, ['check-ignore', '--quiet', '--', name], [0, 1]).status === 0;
  if (ignored) reject(name + ': ignored local instruction; resolve portability before automatic update');
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const inHead = head && git(root, ['ls-tree', '--full-tree', '--name-only', '-z', head]).stdout.split('\0').includes(name);
    if (index || inHead) reject(name + ': tracked instruction is absent; preserve its deliberate deletion');
    return { name, file, kind: 'missing', index };
  }
  const identity = { dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777 };
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(file);
    const peer = names.find((other) => other !== name);
    if (target !== peer && target !== './' + peer && !(process.platform === 'win32' && target === '.\\' + peer)) {
      reject(name + ': only a relative link to the other named root entry is supported');
    }
    return { name, file, kind: 'link', peer, target, index, identity };
  }
  if (!stat.isFile() || stat.nlink !== 1) reject(name + ': expected a regular, single-link instruction file');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const current = fs.fstatSync(fd);
    if (!current.isFile() || current.nlink !== 1 || current.dev !== stat.dev || current.ino !== stat.ino) {
      reject(name + ': entry changed while reading; retry audit without concurrent writers');
    }
    bytes = fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch {
    reject(name + ': non-UTF-8 instructions, review manually');
  }
  if (text.includes('\0')) reject(name + ': binary instructions, review manually');
  return { name, file, kind: 'file', text, index, identity };
}

// Narrow Markdown projection for instruction inference only. Never rewrite this view into a file.
function liveMarkdown(text, name) {
  let fence = null;
  let comment = false;
  const out = [];
  const fenceLine = /^[ \t]*(\x60{3,}|~{3,})(.*)$/;
  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      const close = fenceLine.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length && !close[2].trim()) fence = null;
      out.push('');
      continue;
    }
    if (!comment) {
      const opener = fenceLine.exec(line);
      if (opener) {
        if (opener[1][0] === '\x60' && opener[2].includes('\x60')) reject(name + ': ambiguous Markdown fence; review manually');
        fence = opener[1];
        out.push('');
        continue;
      }
    }
    let at = 0, visible = '';
    while (at < line.length) {
      const marker = comment ? '-->' : '<!--';
      const i = line.indexOf(marker, at);
      if (i < 0) {
        if (!comment) visible += line.slice(at);
        break;
      }
      if (!comment) visible += line.slice(at, i) + ' ';
      comment = !comment;
      at = i + marker.length;
    }
    // A fence appearing only after a comment was removed is ambiguous, not a live route.
    if (fenceLine.test(visible)) reject(name + ': ambiguous Markdown fence following a comment; review manually');
    out.push(visible);
  }
  if (fence || comment) reject(name + ': unterminated Markdown fence or HTML comment; review manually');
  return out.join('\n');
}

function classify(entry, other) {
  if (entry.kind === 'link') return 'pointer';
  if (entry.kind !== 'file') return 'missing';
  const text = entry.text;
  // With core.symlinks=false Git can materialize a tracked link as a text stub.
  if (entry.index.startsWith('120000 ')) {
    if (text === other.name || text === './' + other.name) return 'pointer';
    reject(entry.name + ': tracked symlink and working entry differ; resolve manually');
  }
  const visible = liveMarkdown(text, entry.name);
  const imports = visible.split(/\r?\n/).filter((line) => /^\s*(?:Project-wide agent rules:\s*)?@.*(?:AGENTS|CLAUDE)\.md\s*$/i.test(line));
  const expected = [other.name, './' + other.name];
  const explicitImport = imports.length === 1
    && expected.includes(imports[0].trim().replace(/^(?:Project-wide agent rules:\s*)?@/, ''));
  const documentedRoute = entry.name === 'AGENTS.md'
    && /^(?:\*\*)?(?:Canonical instructions live in|The full project instructions live in)\s+(?:\*\*)?\[[\x60]?CLAUDE\.md[\x60]?\]\((?:\.\/)?CLAUDE\.md\)/m.test(visible);
  const bareLegacyPointer = entry.name === 'AGENTS.md' && text.trim() === 'CLAUDE.md';
  const opposite = /^(?:\s*[-*]\s+)?(?:\*\*)?(?:Do not|Never) (?:think in terms of|prioriti[sz]e|consider) (?:the )?user goals(?: and value)?\b|^(?:\s*[-*]\s+)?(?:\*\*)?Tests (?:must |shall )?define (?:the )?(?:user value|business requirements|user goals)\b/im;
  if (opposite.test(visible)) reject(entry.name + ': explicit conflicting user-goal instruction; review manually');
  if (imports.length > 1 || (imports.length && !explicitImport)) reject(entry.name + ': unclear instruction import');
  if (explicitImport || bareLegacyPointer || documentedRoute) {
    if (visible.includes(axiom) || /^\s*##\s+Goals.first development\s*$/im.test(visible)) {
      reject(entry.name + ': imported and independent goals policy both present; resolve authority');
    }
    return entry.name === 'AGENTS.md' ? 'documented-route' : 'pointer';
  }
  // Recognize ownership markers rather than splice a generated or broken region.
  const managed = /\b(?:generated by|auto.generated)\b/i.test(text.split(/\r?\n/).slice(0, 4).join('\n'));
  if (managed && !text.includes(axiom)) reject(entry.name + ': generated instructions must be updated at their owning source');
  for (const marker of ['prometheus-base', 'prometheus-mini-context']) {
    const starts = [...text.matchAll(new RegExp('<!--\\s*' + marker + ':start[^>]*-->', 'g'))];
    const ends = [...text.matchAll(new RegExp('<!--\\s*' + marker + ':end\\s*-->', 'g'))];
    if (starts.length !== ends.length || starts.length > 1 || (starts.length && starts[0].index >= ends[0].index)) {
      reject(entry.name + ': malformed managed instructions');
    }
  }
  const axiomCount = visible.split(axiom).length - 1;
  const ownHeadings = [...visible.matchAll(/^\s*##\s+Goals.first development\s*$/gim)].length;
  const canonicalCoverage = axiomCount === 1 && /\bVLBV\b/.test(visible)
    && /accepted spec|adopted (?:phase )?contract/i.test(visible)
    && /(?:preserve|existing|established).{0,85}(?:gates|release|verification)/i.test(visible);
  if (axiomCount > 1 || ownHeadings > 1 || (managed && !canonicalCoverage)) reject(entry.name + ': duplicate or generated goals authority');
  if (canonicalCoverage) return 'covered';
  if (axiomCount || ownHeadings || /^\s*#+\s+(?:User goals, value, and business rules|Goals.first)\s*$/im.test(visible)) {
    reject(entry.name + ': partial or conflicting goals section; review manually');
  }
  return 'append';
}

function projectIdentity(root) {
  const top = git(root, ['rev-parse', '--show-toplevel']).stdout.trim();
  if (!top || fs.realpathSync(top) !== root) reject('--path must be the exact existing Git top-level');
  const head = git(root, ['rev-parse', '--verify', 'HEAD'], [0, 128]).stdout.trim();
  const ref = git(root, ['symbolic-ref', '--quiet', 'HEAD'], [0, 1]).stdout.trim();
  if (!head && !ref) reject('Git HEAD identity is unavailable');
  const common = fs.realpathSync(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']).stdout.trim());
  const { dev, ino } = fs.statSync(root);
  const commonStat = fs.statSync(common);
  return { root, dev, ino, head, ref, common, commonDev: commonStat.dev, commonIno: commonStat.ino };
}

function plan(root) {
  const identity = projectIdentity(root);
  const entries = names.map((name) => readEntry(root, name, identity.head));
  const modes = entries.map((entry, i) => classify(entry, entries[1 - i]));
  if (modes.every((mode) => mode === 'missing')) reject('both root instruction files are missing; use an explicitly authorized initializer');
  const isPointer = (mode) => mode === 'pointer' || mode === 'documented-route';
  if (modes.some((mode, i) => isPointer(mode) && entries[1 - i].kind !== 'file') || modes.every(isPointer)) {
    reject('broken or circular canonical instruction link');
  }
  const writes = entries.flatMap((entry, index) => {
    if (!['append', 'missing'].includes(modes[index])) return [];
    const existing = entry.text ?? '';
    const eol = existing.includes('\r\n') ? '\r\n' : '\n';
    const prefix = existing ? (existing.endsWith('\n') ? eol : eol + eol) : '';
    return [{ entry, after: existing + prefix + policy.replaceAll('\n', eol) }];
  });
  const digest = sha(JSON.stringify([2, identity, entries, writes]));
  return { identity, entries, modes, writes, digest };
}

function displayDiff({ entry, after }) {
  const split = (text) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const before = split(entry.text ?? '');
  const next = split(after);
  let same = 0;
  while (same < before.length && before[same] === next[same]) same++;
  const context = Math.max(0, same - 2);
  const line = (prefix, value) => {
    process.stdout.write(prefix + value);
    if (!value.endsWith('\n')) process.stdout.write('\n\\ No newline at end of file\n');
  };
  console.log('--- ' + (entry.kind === 'missing' ? '/dev/null' : 'a/' + entry.name));
  console.log('+++ b/' + entry.name);
  console.log('@@ -' + (before.length ? context + 1 : 0) + ',' + (before.length - context) + ' +' + (context + 1) + ',' + (next.length - context) + ' @@');
  for (const value of before.slice(context, same)) line(' ', value);
  for (const value of before.slice(same)) line('-', value);
  for (const value of next.slice(same)) line('+', value);
}

function apply(root, snapshot) {
  const staged = [];
  let written = 0;
  try {
    for (const { entry, after } of snapshot.writes) {
      const temp = path.join(root, '.' + entry.name + '.prometheus-' + randomBytes(12).toString('hex'));
      const file = fs.openSync(temp, 'wx', entry.identity?.mode ?? 0o644);
      staged.push({ entry, temp });
      try {
        fs.writeFileSync(file, after, 'utf8');
        if (entry.identity && process.platform !== 'win32') fs.fchmodSync(file, entry.identity.mode);
        fs.fsyncSync(file);
      } finally { fs.closeSync(file); }
    }
    if (plan(root).digest !== snapshot.digest) reject('preview became stale before writes; run --preview again');
    const expectedEntries = snapshot.entries.slice();
    for (const { entry, temp } of staged) {
      if (JSON.stringify(projectIdentity(root)) !== JSON.stringify(snapshot.identity)
        || expectedEntries.some((expected) => JSON.stringify(readEntry(root, expected.name, snapshot.identity.head)) !== JSON.stringify(expected))) {
        reject('project identity or named instructions changed during apply');
      }
      if (entry.kind === 'missing') fs.copyFileSync(temp, entry.file, fs.constants.COPYFILE_EXCL);
      else fs.renameSync(temp, entry.file);
      written++;
      const updated = readEntry(root, entry.name, snapshot.identity.head);
      const expectedBytes = snapshot.writes.find((write) => write.entry === entry).after;
      if (updated.kind !== 'file' || updated.text !== expectedBytes || updated.index !== entry.index
        || (entry.identity && updated.identity.mode !== entry.identity.mode)) reject(entry.name + ': apply readback disagrees');
      expectedEntries[names.indexOf(entry.name)] = updated;
    }
  } catch (error) {
    if (written) reject('partial apply: ' + written + ' named file(s) changed; audit and reconcile before retrying (' + error.message + ')');
    throw error;
  } finally {
    for (const { temp } of staged) fs.rmSync(temp, { force: true });
  }
  return written;
}

export function runExistingProjectMode(args) {
  try {
    const { root, mode, digest } = parse(args);
    const snapshot = plan(root);
    if (mode === 'apply' && digest !== snapshot.digest) reject('preview digest is stale or belongs to another root; run --preview again');
    for (const [i, entry] of snapshot.entries.entries()) {
      const change = snapshot.writes.some((write) => write.entry === entry);
      console.log((change ? 'CHANGE' : 'COVERED') + ' ' + entry.name + ' (' + snapshot.modes[i] + '; ' + (entry.index ? 'tracked' : 'untracked') + ')');
    }
    if (mode === 'preview') {
      for (const write of snapshot.writes) displayDiff(write);
      console.log('PLAN_SHA256=' + snapshot.digest);
    } else if (mode === 'apply') console.log('Applied ' + apply(root, snapshot) + ' named instruction change(s).');
    if (mode !== 'apply') {
      console.log('Review operator prose for semantic conflicts; only recognized patterns are checked.');
      if (snapshot.modes.includes('documented-route')) console.log('Documented AGENTS.md route: follow the existing CLAUDE.md reference explicitly; automatic harness import is not established.');
    }
    return 0;
  } catch (error) {
    console.error((error instanceof Usage ? 'USAGE ' : 'BLOCKED ') + error.message);
    return error instanceof Usage ? 1 : 2;
  }
}
