// Shared helpers for the certification scripts. No dependency outside node, so
// the skill works wherever it is installed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The raw frontmatter text of a SKILL.md, or null. */
export function frontmatterText(skillFile) {
  const match = fs.readFileSync(skillFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

function unquote(value) {
  const trimmed = value.trim();
  if (/^".*"$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed.replace(/\s+#.*$/, '');
}

/**
 * A deliberately small YAML reader for skill frontmatter: top-level keys, one
 * level of nested mapping, plain / quoted / block (`|`, `>`) scalars, and flow
 * or block lists. It records what it sees; it does not judge it. Anything it
 * cannot read is kept as the raw text so a check can still report on it.
 */
export function parseFrontmatter(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  let index = 0;
  const indentOf = line => line.match(/^ */)[0].length;
  const blockAt = (start, parentIndent) => {
    const collected = [];
    let cursor = start;
    while (cursor < lines.length && (lines[cursor].trim() === '' || indentOf(lines[cursor]) > parentIndent)) {
      collected.push(lines[cursor]);
      cursor += 1;
    }
    return { collected, next: cursor };
  };
  const scalarOrBlock = (rest, start, parentIndent) => {
    if (/^[|>][+-]?\s*$/.test(rest)) {
      const { collected, next } = blockAt(start, parentIndent);
      const body = collected.map(line => line.trim());
      return { value: rest.startsWith('>') ? body.join(' ').replace(/\s+/g, ' ').trim() : body.join('\n').trim(), next };
    }
    if (/^\[.*\]$/.test(rest)) {
      const inner = rest.slice(1, -1).trim();
      return { value: inner ? inner.split(',').map(unquote) : [], next: start };
    }
    if (rest !== '') {
      // A plain scalar may continue on more-indented lines.
      const { collected, next } = blockAt(start, parentIndent);
      const more = collected.map(line => line.trim()).filter(Boolean);
      if (more.length && !more.some(line => /^(- |[A-Za-z0-9_.-]+:(\s|$))/.test(line))) {
        return { value: unquote([rest, ...more].join(' ')), next };
      }
      return { value: unquote(rest), next: start };
    }
    return null;
  };
  while (index < lines.length) {
    const line = lines[index];
    const top = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!top) {
      index += 1;
      continue;
    }
    const [, key, rest] = top;
    index += 1;
    const direct = scalarOrBlock(rest, index, 0);
    if (direct) {
      result[key] = direct.value;
      index = direct.next;
      continue;
    }
    const { collected, next } = blockAt(index, 0);
    const body = collected.filter(entry => entry.trim() !== '');
    index = next;
    // A key with nothing after the colon and indented text below it is a plain
    // scalar continued over several lines, unless that text is a mapping or a list.
    const looksStructured = body.some(entry => /^\s*(- |[A-Za-z0-9_.-]+:(\s|$))/.test(entry));
    if (body.length === 0) result[key] = null;
    else if (!looksStructured) result[key] = unquote(body.map(entry => entry.trim()).join(' '));
    else if (body.every(entry => /^\s*- /.test(entry))) {
      result[key] = body.map(entry => unquote(entry.replace(/^\s*- /, '')));
    } else {
      const nested = {};
      const baseIndent = indentOf(body[0]);
      for (let position = 0; position < body.length; position += 1) {
        const entry = body[position];
        if (indentOf(entry) !== baseIndent) continue;
        const pair = entry.trim().match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
        if (!pair) continue;
        const deeper = [];
        while (position + 1 < body.length && indentOf(body[position + 1]) > baseIndent) {
          deeper.push(body[position + 1].trim());
          position += 1;
        }
        if (/^\[.*\]$/.test(pair[2])) nested[pair[1]] = pair[2].slice(1, -1).split(',').map(unquote);
        else if (pair[2] === '' && deeper.length) nested[pair[1]] = deeper.every(item => item.startsWith('- ')) ? deeper.map(item => unquote(item.slice(2))) : { raw: deeper.join('\n') };
        else if (/^[|>]/.test(pair[2])) nested[pair[1]] = deeper.join(' ');
        else nested[pair[1]] = unquote(pair[2]);
      }
      result[key] = nested;
    }
  }
  return result;
}

export function readSkill(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return { skillFile, text: null, frontmatter: null, body: '' };
  const raw = fs.readFileSync(skillFile, 'utf8');
  const text = frontmatterText(skillFile);
  return {
    skillFile,
    text,
    frontmatter: text === null ? null : parseFrontmatter(text),
    body: text === null ? raw : raw.slice(raw.indexOf('\n---', 3) + 4),
    lines: raw.split(/\r?\n/).length,
  };
}

const HASH_SKIP = new Set(['node_modules', '.git', 'target', '__pycache__', '.DS_Store']);

/** sha256 over the sorted files of a directory, skipping the named top-level entries. */
export function hashTree(root, skipTop = []) {
  const hash = crypto.createHash('sha256');
  const skip = new Set(skipTop);
  const visit = (directory, relative) => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (HASH_SKIP.has(name) || (relative === '' && skip.has(name))) continue;
      const absolute = path.join(directory, name);
      const rel = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) hash.update(`link\0${rel}\0${fs.readlinkSync(absolute)}\0`);
      else if (stat.isDirectory()) visit(absolute, rel);
      else if (stat.isFile()) hash.update(`file\0${rel}\0`).update(fs.readFileSync(absolute)).update('\0');
    }
  };
  if (fs.existsSync(root)) visit(root, '');
  return hash.digest('hex');
}

export const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);

/** Claude Code's listing cost of one skill, in characters (an estimate). */
export function listingChars(frontmatter, prefix = '') {
  if (!frontmatter?.name || frontmatter['disable-model-invocation'] === true || frontmatter['disable-model-invocation'] === 'true') return 0;
  const description = `${frontmatter.description ?? ''} ${frontmatter.when_to_use ?? ''}`.trim();
  return Math.min(description.length, 1536) + String(frontmatter.name).length + prefix.length + 6;
}
