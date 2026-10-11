import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';

import { captureSources, sameSources } from './checkpoints.mjs';
import { claimCommand, immutableJson, jobTransaction, now } from './jobs.mjs';
import { digest } from './candidates.mjs';
import { saveEvent } from './storage.mjs';

const execute = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = async (repository, args, encoding = 'utf8') =>
  (await execute('git', ['-C', repository, ...args], { encoding, maxBuffer: 128 * 1024 * 1024 })).stdout;

async function artifact(file, expected) {
  const resolved = path.resolve(file);
  const size = (await fs.stat(resolved)).size;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolved)) hash.update(chunk);
  if (hash.digest('hex') !== expected.sha256 || size !== expected.size) throw new Error(`Frozen artifact changed: ${resolved}`);
  return { path: resolved, sha256: expected.sha256, size: expected.size };
}

async function preserved(snapshot) {
  const patch = await fs.readFile(path.join(snapshot.directory, 'tracked.patch'));
  if (sha(patch) !== snapshot.patchSha256) throw new Error('Preserved frozen source patch changed');
  const hash = createHash('sha256').update(snapshot.revision).update(patch);
  const files = snapshot.untrackedFiles ?? [];
  if (new Set(files).size !== files.length) throw new Error('Preserved source repeats an untracked path');
  for (const name of [...files].sort()) {
    const file = inside(path.join(snapshot.directory, 'untracked'), name);
    if (!(await fs.lstat(file)).isFile()) throw new Error('Preserved untracked source is not a regular file');
    hash.update(name).update('\0');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
  }
  const nestedSnapshots = snapshot.preservedSubmodules ?? [];
  const initialized = (snapshot.submoduleRefs ?? []).filter(item => item.initialized !== false);
  if (nestedSnapshots.length !== initialized.length || new Set(nestedSnapshots.map(item => item.repository)).size !== initialized.length)
    throw new Error('Preserved nested source snapshots are incomplete');
  for (const ref of snapshot.submoduleRefs ?? []) {
    if (ref.initialized === false) { hash.update(ref.name).update(ref.revision); continue; }
    const nested = nestedSnapshots.find(item => item.repository === ref.repository);
    if (!nested || !sameSources([sourceIdentity(nested)], [sourceIdentity(ref)])) throw new Error('Preserved nested source identity changed');
    await preserved(nested);
    hash.update(ref.name).update(ref.fingerprint);
  }
  if (hash.digest('hex') !== snapshot.fingerprint) throw new Error('Preserved frozen source fingerprint changed');
  return patch;
}

function sourceIdentity(ref) {
  const { directory, preservedSubmodules, patchSha256, untrackedFiles, submodules, name, ...identity } = ref;
  return identity;
}

function inside(directory, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative) || path.posix.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Source evidence path escapes its declared root');
  return path.join(directory, relative);
}

// Keep opaque Git patch bytes for every path except the exact admitted files.
function withoutPaths(patch, paths) {
  const marker = Buffer.from('\ndiff --git '), chunks = [];
  let start = 0, next;
  while ((next = patch.indexOf(marker, start)) !== -1) { chunks.push(patch.subarray(start, next + 1)); start = next + 1; }
  chunks.push(patch.subarray(start));
  return Buffer.concat(chunks.filter(chunk => !paths.some(file => chunk.subarray(0, chunk.indexOf(10) + 1)
    .equals(Buffer.from(`diff --git a/${file} b/${file}\n`)))));
}

function pathspec(repository, root, omitted = []) {
  const relative = path.relative(repository, root).replaceAll(path.sep, '/');
  return ['.', ...(relative && !relative.startsWith('../') && !path.isAbsolute(relative) ? [`:(exclude)${relative}`] : []),
    ...omitted.map(file => `:(exclude,literal)${file}`)];
}

async function unchangedApplication(root, snapshot, current, admitted) {
  const original = withoutPaths(await preserved(snapshot), admitted);
  const selectors = pathspec(snapshot.repository, root, admitted);
  const checkout = await git(snapshot.repository, ['diff', snapshot.revision, '--binary', '--', ...selectors], 'buffer');
  if (!original.equals(checkout) || !sameSources(snapshot.submoduleRefs ?? [], current.submoduleRefs ?? []))
    throw new Error('Application source changed outside the exact drivers and proven generated skill outputs');
  const originalFiles = (snapshot.untrackedFiles ?? []).filter(name => !admitted.includes(name)).sort();
  const currentFiles = (await git(snapshot.repository, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...selectors]))
    .split('\0').filter(Boolean).sort();
  if (JSON.stringify(originalFiles) !== JSON.stringify(currentFiles)) throw new Error('Application untracked source changed outside admitted paths');
  for (const name of originalFiles) {
    const originalFile = inside(path.join(snapshot.directory, 'untracked'), name);
    const currentFile = inside(snapshot.repository, name);
    if (!(await fs.lstat(currentFile)).isFile() || !(await fs.readFile(originalFile)).equals(await fs.readFile(currentFile)))
      throw new Error(`Original untracked source changed: ${name}`);
  }
}

const renderFunction = 'function renderPackSkillText(text, skillDirectory) {\n' +
  '  return text.replace(/\\bnode scripts\\/([a-zA-Z0-9_./-]+\\.mjs)\\b/g, (command, helper) =>\n' +
  '    fs.existsSync(path.join(skillDirectory, \'scripts\', helper)) ? command : `boss-mini ${helper}`\n' +
  '  )\n}';

async function generatedSkills(repository, application, provenance, artifacts) {
  const declaration = provenance.generatedOutputDeclaration;
  if (!declaration) return { paths: [], artifacts: [] };
  const mini = application.submoduleRefs?.find(item => item.repository === declaration.source?.repository);
  if (!mini || mini.revision !== declaration.source.revision || mini.initialized === false ||
      declaration.transform !== 'mini-pack-skill-text-v1') throw new Error('Generated skills lack a frozen mini producer source');
  const producers = declaration.producerSources;
  const producerPaths = ['scripts/before-pack.js', 'scripts/package-prometheus.js'];
  if (!Array.isArray(producers) || producers.length !== producerPaths.length ||
      producerPaths.some(file => producers.filter(item => item.path === file).length !== 1)) throw new Error('Bind both frozen skill packaging producers');
  const texts = [];
  for (const file of producerPaths) {
    const bytes = await git(repository, ['show', `${application.revision}:${file}`], 'buffer');
    if (sha(bytes) !== producers.find(item => item.path === file).sha256) throw new Error('Skill producer differs from frozen application');
    texts.push(bytes.toString('utf8'));
  }
  if (!texts[0].includes("require('./package-prometheus').packagePrometheus()") || !texts[1].includes(renderFunction) ||
      !texts[1].includes("path.join(root, 'resources', 'skills', skill)")) throw new Error('Frozen producer does not implement the declared mini skill transform');
  const asar = artifacts.find(item => item.path.endsWith('/app.asar'));
  const pack = path.join(path.dirname(asar.path), 'app.asar.unpacked', 'resources', 'prometheus-skills-mini');
  const manifestPath = path.join(pack, 'release-manifest.json');
  const manifestBytes = await fs.readFile(manifestPath), manifest = JSON.parse(manifestBytes);
  if (manifest.revision !== mini.revision) throw new Error('Packaged mini manifest identifies another source');
  const paths = declaration.paths;
  if (!Array.isArray(paths) || !paths.length || new Set(paths.map(item => item.path)).size !== paths.length)
    throw new Error('Name each generated skill output exactly once');
  const outputs = [];
  for (const item of paths) {
    inside(repository, item.path);
    if (!/^resources\/skills\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+$/.test(item.path)) throw new Error('Generated output is not a declared mini skill file');
    const sourcePath = item.path.slice('resources/'.length);
    let bytes = await git(mini.repository, ['show', `${mini.revision}:${sourcePath}`], 'buffer');
    if (sourcePath.endsWith('.md')) {
      const skill = sourcePath.split('/')[1], helpers = new Set();
      for (const match of bytes.toString('utf8').matchAll(/\bnode scripts\/([a-zA-Z0-9_./-]+\.mjs)\b/g)) {
        const helper = `skills/${skill}/scripts/${match[1]}`;
        const exists = await git(mini.repository, ['cat-file', '-e', `${mini.revision}:${helper}`]).then(() => true, error => {
          if (error.code === 128 || error.code === 1) return false; throw error;
        });
        if (exists) helpers.add(match[1]);
      }
      bytes = Buffer.from(bytes.toString('utf8').replace(/\bnode scripts\/([a-zA-Z0-9_./-]+\.mjs)\b/g,
        (command, helper) => helpers.has(helper) ? command : `boss-mini ${helper}`));
    }
    if (sha(bytes) !== item.sha256 || bytes.length !== item.size ||
        !manifest.files?.some(file => file.path === sourcePath && file.sha256 === item.sha256))
      throw new Error(`Generated skill does not match its frozen producer: ${item.path}`);
    await artifact(inside(repository, item.path), item);
    outputs.push(await artifact(inside(pack, sourcePath), item));
  }
  return { paths: paths.map(item => item.path), artifacts: [...outputs,
    { path: manifestPath, sha256: sha(manifestBytes), size: manifestBytes.length }], declaration };
}

export async function assertFrozenReconciliation(root, state, candidate, iteration) {
  const record = (state.frozenSourceReconciliations ?? []).findLast(item => item.candidateId === candidate.id);
  if (!record) return null;
  const bytes = await fs.readFile(record.path);
  if (sha(bytes) !== record.sha256) throw new Error('Frozen source reconciliation receipt changed');
  const stored = JSON.parse(bytes);
  if (digest(stored.candidateSourceRefs) !== digest(candidate.sourceRefs) ||
      stored.candidateManifestHash !== candidate.manifestHash ||
      stored.iterationId !== iteration.id || stored.candidateId !== candidate.id) throw new Error('Frozen source reconciliation belongs to another candidate');
  const manifest = JSON.parse(await fs.readFile(candidate.manifestPath, 'utf8'));
  if (digest(manifest) !== candidate.manifestHash) throw new Error('Frozen candidate manifest changed');
  if (candidate.preservedSources?.length !== candidate.sourceRefs.length)
    throw new Error('Frozen candidate lacks preserved source snapshots');
  if (!sameSources(candidate.preservedSources.map(sourceIdentity), candidate.sourceRefs)) throw new Error('Preserved source does not identify the frozen candidate');
  for (const snapshot of candidate.preservedSources ?? []) {
    await preserved(snapshot);
  }
  for (const item of stored.artifacts) await artifact(item.path, item);
  for (const item of stored.generatedArtifacts ?? []) await artifact(item.path, item);
  const operation = await fs.readFile(stored.operationEvidence.path);
  if (sha(operation) !== stored.operationEvidence.sha256) throw new Error('Feature operation evidence changed');
  const provenance = await fs.readFile(stored.provenance.path);
  if (sha(provenance) !== stored.provenance.sha256) throw new Error('Frozen build provenance changed');
  if (!sameSources(await captureSources(candidate.sourceRefs.map(item => ({ repository: item.repository })), root),
    stored.checkoutAtReconciliation)) throw new Error('Checkout advanced again after frozen source reconciliation');
  return { ...stored, path: record.path, sha256: record.sha256 };
}

export async function reconcileFrozenSource(root, input = {}, args = {}) {
  const candidateId = input.candidateId;
  if (!candidateId || !input.authorityRef?.trim() || !input.reason?.trim()) throw new Error('Frozen source reconciliation requires candidate, authority and reason');
  const evidencePath = path.resolve(input.operationEvidencePath);
  const provenancePath = path.resolve(input.provenancePath);
  const evidenceBytes = await fs.readFile(evidencePath), provenanceBytes = await fs.readFile(provenancePath);
  const evidence = JSON.parse(evidenceBytes), provenance = JSON.parse(provenanceBytes);
  if (evidence.complete !== true || !Number.isFinite(Date.parse(evidence.startedAt)) || !Number.isFinite(Date.parse(evidence.finishedAt)) ||
      Date.parse(evidence.finishedAt) < Date.parse(evidence.startedAt) || provenance.applicationBuildSource !== evidence.sourceRefs?.boss)
    throw new Error('Operation/provenance does not identify one completed frozen build');
  const result = await jobTransaction(root, async state => {
    const prior = claimCommand(state, 'candidate:reconcile-frozen', input, args); if (prior) return prior;
    const candidate = state.candidates.find(item => item.id === candidateId);
    const iteration = state.iterations.find(item => item.id === candidate?.iterationId);
    if (!candidate || !iteration || iteration.candidateId !== candidateId || iteration.workOutcome)
      throw new Error('Reconcile only the unfinished active frozen candidate');
    const manifest = JSON.parse(await fs.readFile(candidate.manifestPath, 'utf8'));
    if (digest(manifest) !== candidate.manifestHash) throw new Error('Frozen candidate manifest changed');
    const previous = (state.frozenSourceReconciliations ?? []).findLast(item => item.candidateId === candidateId);
    if (previous && (previous.operationEvidence.sha256 !== sha(evidenceBytes) || previous.provenance.sha256 !== sha(provenanceBytes)))
      throw new Error('Existing frozen candidate operation/provenance differs; use a new delivery candidate');
    const source = candidate.sourceRefs;
    const repository = input.applicationRepository ? path.resolve(input.applicationRepository) : source.length === 1 ? source[0].repository : null;
    const application = source.find(item => item.repository === repository);
    if (!application || source.filter(item => item.repository === repository).length !== 1 ||
        application.revision !== evidence.sourceRefs.boss || !sameSources(iteration.sourceRefs, source))
      throw new Error('Select the exact frozen application repository among the original sourceRefs');
    if (provenance.candidateSourceRefs && !sameSources(provenance.candidateSourceRefs, source))
      throw new Error('Frozen provenance identifies another source set');
    const namedDrivers = input.driverPaths ?? [input.driverPath];
    if (!Array.isArray(namedDrivers) || !namedDrivers.length || new Set(namedDrivers).size !== namedDrivers.length ||
        namedDrivers.some(file => typeof file !== 'string' || !/^scripts\/[a-zA-Z0-9_./-]+$/.test(file)) ||
        !Array.isArray(evidence.operationDriverSources)) throw new Error('Name the exact separately operated scripts/ drivers');
    const drivers = [...namedDrivers].sort();
    for (const driver of drivers) inside(repository, driver);
    if (!/^[a-f0-9]{64}$/.test(evidence.sourceRefs.bossDiffSha256 ?? '')) throw new Error('Retain the operation-time whole-checkout diff digest separately');
    const frozenBuilder = await git(repository, ['show', `${application.revision}:electron-builder.yml`]);
    if (!/^\s*-\s*["']?!scripts["']?\s*$/m.test(frozenBuilder)) throw new Error('Frozen application packaging does not exclude scripts/');
    const operationCommit = input.operationDriverCommit;
    await git(repository, ['merge-base', '--is-ancestor', application.revision, operationCommit]);
    const diff = await git(repository, ['diff', '--binary', application.revision, operationCommit, '--', ...drivers], 'buffer');
    const diffSha256 = evidence.operationDriverDiffSha256 ?? (drivers.length === 1 && !provenance.generatedOutputDeclaration ? evidence.sourceRefs.bossDiffSha256 : null);
    if (!diff.length || sha(diff) !== diffSha256) throw new Error('Operated driver-only diff differs from operation evidence');
    const driverSources = [];
    for (const driver of drivers) {
      const changed = await git(repository, ['diff', '--binary', application.revision, operationCommit, '--', driver], 'buffer');
      const bytes = await git(repository, ['show', `${operationCommit}:${driver}`], 'buffer');
      const matches = evidence.operationDriverSources.filter(item => item.path === path.join(repository, driver));
      if (!changed.length || matches.length !== 1 || sha(bytes) !== matches[0].sha256 ||
          !(await fs.readFile(inside(repository, driver))).equals(bytes)) throw new Error('Operated driver bytes differ from proof commit, current checkout or evidence');
      driverSources.push({ path: path.join(repository, driver), sha256: sha(bytes) });
    }
    const builds = iteration.checkpoints.filter(item => item.candidateId === candidateId && item.id === input.buildCheckpointId && item.status === 'success' && !item.invalidatedAt && sameSources(item.sourceRefs, source));
    const launches = iteration.checkpoints.filter(item => item.candidateId === candidateId && item.id === input.launchCheckpointId && item.status === 'success' && !item.invalidatedAt && sameSources(item.sourceRefs, source));
    if (!builds.some(item => item.finishedAt <= evidence.startedAt) || !launches.some(item => item.finishedAt <= evidence.startedAt))
      throw new Error('Frozen build and launch must precede the successful operation');
    const artifactNames = input.artifacts;
    if (!Array.isArray(artifactNames) || artifactNames.length !== 2) throw new Error('Bind the actual application archive and app.asar');
    const artifacts = [];
    for (const file of artifactNames) {
      const relative = path.relative(repository, path.resolve(file));
      const expected = provenance.artifacts?.[relative];
      if (!expected) throw new Error(`Artifact is absent from frozen build provenance: ${relative}`);
      artifacts.push(await artifact(file, expected));
    }
    if (!artifacts.some(item => item.path.endsWith('/app.asar') && item.sha256 === evidence.sourceRefs.appAsarSha256) ||
        !artifacts.some(item => item.path.endsWith('.dmg'))) throw new Error('Operation did not use the frozen application artifact');
    const generated = await generatedSkills(repository, application, provenance, artifacts);
    if (generated.paths.length && !/^beforePack:\s*scripts\/before-pack\.js\s*$/m.test(frozenBuilder))
      throw new Error('Frozen builder does not bind the declared skill producer hook');
    const currentSourceRefs = await captureSources(source.map(item => ({ repository: item.repository })), root);
    if (candidate.preservedSources?.length !== source.length) throw new Error('Frozen source snapshots are incomplete');
    if (!sameSources(candidate.preservedSources.map(sourceIdentity), source)) throw new Error('Preserved source does not identify the frozen candidate');
    for (const snapshot of candidate.preservedSources) {
      await preserved(snapshot);
    }
    const applicationSnapshot = candidate.preservedSources.find(item => item.repository === repository);
    await unchangedApplication(root, applicationSnapshot, currentSourceRefs.find(item => item.repository === repository), [...drivers, ...generated.paths]);
    const record = {
      schemaVersion: 1, candidateId, iterationId: iteration.id, candidateManifestHash: candidate.manifestHash,
      candidateSourceRefs: source, applicationRepository: repository,
      operatedSource: { baseRevision: application.revision, operationDriverCommit: operationCommit,
        driverPaths: drivers, driverSources, ...(drivers.length === 1 ? { driverPath: drivers[0] } : {}),
        dirtyDiffSha256: sha(diff), driverSha256: drivers.length === 1 ? driverSources[0].sha256 : digest(driverSources),
        wholeCheckoutDirtyDiffSha256: evidence.sourceRefs.bossDiffSha256, capturedAt: evidence.startedAt },
      checkoutAtReconciliation: currentSourceRefs, checkoutAdvanced: !sameSources(currentSourceRefs, source),
      operationEvidence: { path: evidencePath, sha256: sha(evidenceBytes) },
      provenance: { path: provenancePath, sha256: sha(provenanceBytes) }, artifacts,
      ...(generated.paths.length ? { generatedOutputDeclaration: generated.declaration, generatedArtifacts: generated.artifacts } : {}),
      buildCheckpointId: input.buildCheckpointId, launchCheckpointId: input.launchCheckpointId,
      authorityRef: input.authorityRef, reason: input.reason, recordedAt: now()
    };
    const file = path.join(root, 'source-reconciliations', `${candidateId}-${sha(Buffer.from(JSON.stringify(record)))}.json`);
    await immutableJson(file, record);
    const saved = { ...record, path: file, sha256: sha(await fs.readFile(file)) };
    state.frozenSourceReconciliations ??= []; state.frozenSourceReconciliations.push(saved);
    state.commandResults[args.commandId] = saved;
    await saveEvent(root, state, 'candidate.frozen-source-reconciled', { candidateId, operationEvidence: record.operationEvidence });
    return saved;
  });
  return result;
}
