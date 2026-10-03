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
function inventory(root) {
  const files = {};
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Copy-only skill cannot contain symlinks: ' + relative);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else if (entry.isFile()) files[relative] = hash(path.join(directory, entry.name));
      else throw new Error('Unsupported payload entry: ' + relative);
    }
  }
  if (fs.existsSync(root)) {
    if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('Skill root must be a real directory');
    visit(root);
  }
  return files;
}
const files = inventory(source);
const actual = inventory(target);
// A stale owned file can be removed; an edited or added user file must survive by refusal.
for (const [relative, digest] of Object.entries(actual)) {
  if (digest !== files[relative] && digest !== previous.files?.[relative]) {
    throw new Error('Preserving differing local file: ' + path.join(target, relative));
  }
}
for (const relative of Object.keys(previous.files ?? {})) {
  if (!Object.hasOwn(actual, relative)) throw new Error('Preserving locally removed owned file: ' + relative);
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const digest = crypto.createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');
const manifest = { schemaVersion: 1, source: 'prometheus-skill-pack/skills/process/delivery-cadence',
  sourceRevision: revision, payloadDigest: digest, files,
  note: 'Payload digest identifies working source bytes independently of source HEAD.' };
fs.mkdirSync(path.dirname(target), { recursive: true });
const staged = fs.mkdtempSync(path.join(path.dirname(target), '.cadence-stage-'));
const backup = fs.existsSync(target) ? path.join(mini, '.prometheus', 'delivery-cadence-backups', Date.now() + '-' + crypto.randomUUID()) : null;
const priorManifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : null;
let replaced = false;
try {
  fs.cpSync(source, staged, { recursive: true });
  // Source writers must be finished before synchronization.
  if (JSON.stringify(Object.entries(inventory(staged)).sort()) !== JSON.stringify(Object.entries(files).sort())) {
    throw new Error('Source changed during payload copy; leave destination untouched');
  }
  if (JSON.stringify(Object.entries(inventory(target)).sort()) !== JSON.stringify(Object.entries(actual).sort())) {
    throw new Error('Destination changed during payload copy; preserve it and retry after writers stop');
  }
  if (backup) {
    fs.mkdirSync(backup, { recursive: true });
    if (priorManifest) fs.writeFileSync(path.join(backup, 'source.json'), priorManifest);
    fs.renameSync(target, path.join(backup, 'skill'));
  }
  fs.renameSync(staged, target);
  replaced = true;
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const tempManifest = manifestPath + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(tempManifest, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  try { fs.renameSync(tempManifest, manifestPath); }
  finally { fs.rmSync(tempManifest, { force: true }); }
} catch (error) {
  if (replaced) fs.rmSync(target, { recursive: true, force: true });
  if (backup && fs.existsSync(path.join(backup, 'skill'))) fs.renameSync(path.join(backup, 'skill'), target);
  throw error;
} finally { fs.rmSync(staged, { recursive: true, force: true }); }
console.log(JSON.stringify({ target, files: Object.keys(files).length, payloadDigest: digest, backup }));
