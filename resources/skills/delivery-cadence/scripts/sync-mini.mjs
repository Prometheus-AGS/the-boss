import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--mini');
if (at < 0 || !process.argv[at + 1]) throw new Error('Usage: node sync-mini.mjs --mini <mini-repository>');
const mini = path.resolve(process.argv[at + 1]);
const target = path.join(mini, 'skills', 'delivery-cadence');
const manifestPath = path.join(mini, '.prometheus', 'delivery-cadence-source.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { files: {} };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = {};
function inventory(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Copy-only skill cannot contain symlinks: ${relative}`);
    if (entry.isDirectory()) inventory(path.join(directory, entry.name), relative);
    else files[relative] = hash(path.join(directory, entry.name));
  }
}
inventory(source);
// Inspect every destination before changing any file. A local edit is not ours to replace.
for (const relative of Object.keys(files)) {
  const file = path.join(target, relative);
  if (fs.existsSync(file) && hash(file) !== files[relative] && hash(file) !== previous.files[relative]) {
    throw new Error(`Preserving differing local file: ${file}`);
  }
}
for (const relative of Object.keys(files)) {
  const file = path.join(target, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(source, relative), file);
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const digest = crypto.createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, source: 'prometheus-skill-pack/skills/process/delivery-cadence',
  sourceRevision: revision, payloadDigest: digest, files, note: 'Payload digest identifies working source bytes independently of source HEAD.' }, null, 2) + '\n');
console.log(JSON.stringify({ target, files: Object.keys(files).length, payloadDigest: digest }));
