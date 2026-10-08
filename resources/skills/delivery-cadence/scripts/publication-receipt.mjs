// Run only after the existing project publisher has completed. Dispatch is not publication.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const args = process.argv.slice(2);
const value = key => args[args.indexOf(key) + 1];
if (!args.includes('--input') || !args.includes('--out')) throw new Error('Use --input publication-request.json --out receipt.json');
const input = JSON.parse(fs.readFileSync(value('--input'), 'utf8'));
if (!input.version || !Array.isArray(input.sourceRefs) || !input.sourceRefs.length || !input.websiteUrl || !input.artifacts?.length) throw new Error('version, sourceRefs, websiteUrl and artifacts are required');
const website = new URL(input.websiteUrl);
if (website.protocol !== 'https:') throw new Error('Publication website must use HTTPS');
const response = await fetch(website, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Website returned ${response.status}`);
let content = await response.text();
// Static landing applications keep generated download data in their first-party bundles.
const scripts = [...content.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(match => new URL(match[1], website));
for (const script of scripts.filter(url => url.origin === website.origin)) {
  const result = await fetch(script, { signal: AbortSignal.timeout(60_000) });
  if (!result.ok) throw new Error(`Website asset returned ${result.status}`);
  content += '\n' + await result.text();
}
const artifacts = [];
for (const artifact of input.artifacts) {
  if (!artifact.path || !artifact.platform || !artifact.url || new URL(artifact.url).protocol !== 'https:') throw new Error('Artifact needs local path, platform and HTTPS URL');
  if (!content.includes(artifact.url) || !content.includes(input.version)) throw new Error(`Website does not advertise ${artifact.platform} URL and version`);
  const local = createHash('sha256');
  for await (const chunk of fs.createReadStream(artifact.path)) local.update(chunk);
  const sha256 = local.digest('hex');
  const download = await fetch(artifact.url, { signal: AbortSignal.timeout(900_000) });
  if (!download.ok || !download.body) throw new Error(`${artifact.platform} download returned ${download.status}`);
  const remote = createHash('sha256'); let size = 0;
  for await (const chunk of download.body) { remote.update(chunk); size += chunk.length; }
  if (remote.digest('hex') !== sha256 || size !== fs.statSync(artifact.path).size) throw new Error(`${artifact.platform} downloaded bytes differ from local artifact`);
  artifacts.push({ platform: artifact.platform, url: artifact.url, sha256, size, verifiedAt: new Date().toISOString() });
}
const receipt = { schemaVersion: 1, version: input.version, sourceRefs: input.sourceRefs, artifacts,
  website: { url: website.href.replace(/\/$/, ''), version: input.version, verifiedAt: new Date().toISOString(),
    links: artifacts.map(({ platform, url }) => ({ platform, url })), method: 'first-party-published-HTML-and-script-links' } };
const out = path.resolve(value('--out'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ receipt: out, platforms: artifacts.map(a => a.platform) }));
