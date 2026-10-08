import type {
  Json, ObjectValue, UarAuthoringDefinition, UarCompiledPackage,
  UarDefinitionKind, UarMigrationReceipt,
} from '../types.mjs';
import { UAR_PROFILE_V2 } from '../types.mjs';
import { object, relativeFile, text } from '../validation.mjs';
import { cloneObject, DIGEST, selfDigest, SEMVER, sha256 } from './canonical.mjs';
import { validateGraph } from './graph-validation.mjs';
import { assertMigrationAllowsBuild, normalizeAuthoring } from './migration.mjs';
import { assertPortable } from './private-authority.mjs';
import { validateProfileDocument } from './profile-validation.mjs';

const kinds = new Set<UarDefinitionKind>(['AgentDefinition', 'TeamDefinition', 'WorkflowDefinition']);

function identity(document: ObjectValue, label: string): { id: string; version: string; kind: UarDefinitionKind } {
  if (document.profile !== UAR_PROFILE_V2) throw new Error(`${label}.profile must be ${UAR_PROFILE_V2}`);
  const kind = text(document.kind, `${label}.kind`) as UarDefinitionKind;
  if (!kinds.has(kind)) throw new Error(`${label}.kind is not a portable collaboration definition`);
  const id = text(document.id, `${label}.id`), version = text(document.version, `${label}.version`);
  if (!SEMVER.test(version)) throw new Error(`${label}.version must be semantic version x.y.z`);
  return { id, version, kind };
}

function referenceKey(value: ObjectValue, label: string): string {
  const id = text(value.id, `${label}.id`), version = text(value.version, `${label}.version`);
  if (!SEMVER.test(version)) throw new Error(`${label}.version must be semantic version x.y.z`);
  if (value.digest !== undefined && !DIGEST.test(text(value.digest, `${label}.digest`))) throw new Error(`${label}.digest must be sha256:<64 lowercase hex>`);
  return `${id}\u0000${version}`;
}

function replaceReferences(document: ObjectValue, resolve: (reference: ObjectValue, pointer: string) => ObjectValue): void {
  if (document.kind === 'AgentDefinition') {
    if (!Array.isArray(document.permittedChildren)) throw new Error('AgentDefinition.permittedChildren must be an array');
    document.permittedChildren = document.permittedChildren.map((item, index) => resolve(object(item, `permittedChildren[${index}]`), `/permittedChildren/${index}`));
  }
  if (document.kind === 'TeamDefinition') {
    if (!Array.isArray(document.members)) throw new Error('TeamDefinition.members must be an array');
    document.members = document.members.map((item, index) => {
      const member = cloneObject(item, `members[${index}]`);
      member.definition = resolve(object(member.definition, `members[${index}].definition`), `/members/${index}/definition`);
      return member;
    });
    const acceptance = cloneObject(document.taskAcceptance, 'taskAcceptance');
    if (!Array.isArray(acceptance.allowedWorkflows)) throw new Error('taskAcceptance.allowedWorkflows must be an array');
    acceptance.allowedWorkflows = acceptance.allowedWorkflows.map((item, index) => resolve(object(item, `taskAcceptance.allowedWorkflows[${index}]`), `/taskAcceptance/allowedWorkflows/${index}`));
    document.taskAcceptance = acceptance;
  }
}

function references(document: ObjectValue): { pointer: string; reference: ObjectValue }[] {
  const result: { pointer: string; reference: ObjectValue }[] = [];
  if (document.kind === 'AgentDefinition') (document.permittedChildren as Json[]).forEach((item, index) => result.push({ pointer: `/permittedChildren/${index}`, reference: object(item) }));
  if (document.kind === 'TeamDefinition') {
    (document.members as Json[]).forEach((item, index) => result.push({ pointer: `/members/${index}/definition`, reference: object(object(item).definition) }));
    const acceptance = object(document.taskAcceptance);
    (acceptance.allowedWorkflows as Json[]).forEach((item, index) => result.push({ pointer: `/taskAcceptance/allowedWorkflows/${index}`, reference: object(item) }));
  }
  return result;
}

export function compileUarPackage(value: unknown, workspaceReceipt?: UarMigrationReceipt): UarCompiledPackage {
  const normalized = normalizeAuthoring(value);
  const receipt = workspaceReceipt ?? normalized.receipt;
  assertMigrationAllowsBuild(receipt);
  const manifestInput = cloneObject(normalized.package.manifest, 'package manifest');
  if (manifestInput.profile !== UAR_PROFILE_V2 || manifestInput.kind !== 'PackageManifest') throw new Error(`package manifest must use profile ${UAR_PROFILE_V2} and kind PackageManifest`);
  assertPortable(manifestInput as Json, 'manifest.json');
  if (!Array.isArray(normalized.package.definitions) || normalized.package.definitions.length === 0) throw new Error('authoring package definitions must be a nonempty array');
  const definitions = normalized.package.definitions.map((source, index): UarAuthoringDefinition => {
    const file = relativeFile(text(source.path, `definitions[${index}].path`));
    if (file === 'manifest.json') throw new Error('manifest.json is reserved for the compiled package manifest');
    const document = cloneObject(source.document, file);
    assertPortable(document as Json, file);
    return { path: file, document };
  });
  const byKey = new Map<string, UarAuthoringDefinition>(), paths = new Set<string>();
  for (const definition of definitions) {
    const found = identity(definition.document, definition.path);
    const key = `${found.id}\u0000${found.version}`;
    if (byKey.has(key)) throw new Error(`Duplicate definition identity/version: ${found.id}@${found.version}`);
    const folded = definition.path.normalize('NFC').toLocaleLowerCase('en-US');
    if (paths.has(folded)) throw new Error(`Case-insensitive definition path collision: ${definition.path}`);
    byKey.set(key, definition); paths.add(folded);
  }

  const compiled = new Map<string, UarAuthoringDefinition>(), visiting = new Set<string>();
  const compile = (key: string): UarAuthoringDefinition => {
    const complete = compiled.get(key); if (complete) return complete;
    if (visiting.has(key)) throw new Error(`Definition dependency cycle at ${key.replace('\u0000', '@')}`);
    const source = byKey.get(key); if (!source) throw new Error(`Unresolved definition reference ${key.replace('\u0000', '@')}`);
    visiting.add(key);
    const document = cloneObject(source.document, source.path), supplied = document.contentDigest;
    delete document.contentDigest;
    replaceReferences(document, (reference, pointer) => {
      const dependency = compile(referenceKey(reference, `${source.path}${pointer}`));
      const digest = text(dependency.document.contentDigest, `${dependency.path}.contentDigest`);
      if (reference.digest !== undefined && reference.digest !== digest) throw new Error(`${source.path}${pointer}/digest conflicts with resolved definition`);
      return { id: reference.id, version: reference.version, digest };
    });
    const digest = selfDigest(document);
    if (supplied !== undefined && supplied !== digest) throw new Error(`Definition contentDigest conflict for ${document.id}@${document.version}; use a new version for changed content`);
    document.contentDigest = digest;
    validateProfileDocument(document);
    if (document.kind === 'TeamDefinition' && document.instructions !== undefined) {
      const instructions = object(document.instructions, `${source.path}/instructions`);
      const guidance = instructions.text as string; // Shape and nonempty text were checked by the provider schema.
      if (Buffer.byteLength(guidance, 'utf8') > 16_384) throw new Error(`${source.path}/instructions/text exceeds 16384 UTF-8 bytes`);
      if (instructions.digest !== sha256(guidance)) throw new Error(`${source.path}/instructions/digest does not match exact UTF-8 text`);
    }
    const result = { path: source.path, document };
    compiled.set(key, result); visiting.delete(key);
    return result;
  };
  for (const key of byKey.keys()) compile(key);

  text(manifestInput.id, 'manifest.id');
  if (!SEMVER.test(text(manifestInput.version, 'manifest.version'))) throw new Error('manifest.version must be semantic version x.y.z');
  if (manifestInput.resolution !== 'exact-version-and-digest') throw new Error('manifest.resolution must be exact-version-and-digest');
  if (!Array.isArray(manifestInput.entrypoints)) throw new Error('manifest.entrypoints must be an array');
  manifestInput.entrypoints = manifestInput.entrypoints.map((entry, index) => {
    const reference = object(entry, `manifest.entrypoints[${index}]`);
    const definition = compile(referenceKey(reference, `manifest.entrypoints[${index}]`));
    const digest = text(definition.document.contentDigest, `${definition.path}.contentDigest`);
    if (reference.digest !== undefined && reference.digest !== digest) throw new Error(`Entrypoint digest conflict for ${reference.id}@${reference.version}`);
    return { id: reference.id, version: reference.version, digest };
  });

  const files = [...compiled.values()].sort((a, b) => a.path.localeCompare(b.path)).map(definition => ({
    path: definition.path, contentUtf8: `${JSON.stringify(definition.document, null, 2)}\n`,
  }));
  manifestInput.files = files.map(file => {
    const document = object(JSON.parse(file.contentUtf8));
    return { path: file.path, kind: document.kind, definition: { id: document.id, version: document.version, digest: document.contentDigest }, byteDigest: sha256(file.contentUtf8) };
  });
  const locks: ObjectValue[] = [];
  for (const definition of compiled.values()) for (const item of references(definition.document)) {
    const resolved = compiled.get(referenceKey(item.reference, `${definition.path}${item.pointer}`));
    if (!resolved) throw new Error(`Unresolved compiled reference at ${definition.path}${item.pointer}`);
    locks.push({ requestedBy: definition.document.id, reference: item.reference, resolvedPath: resolved.path });
  }
  manifestInput.lock = locks.sort((left, right) => String(left.requestedBy).localeCompare(String(right.requestedBy)) || String(object(left.reference).id).localeCompare(String(object(right.reference).id)));
  const suppliedManifestDigest = manifestInput.contentDigest;
  delete manifestInput.contentDigest;
  const manifestDigest = selfDigest(manifestInput);
  if (suppliedManifestDigest !== undefined && suppliedManifestDigest !== manifestDigest) throw new Error('PackageManifest contentDigest conflict; changed content requires a new version');
  manifestInput.contentDigest = manifestDigest;
  validateProfileDocument(manifestInput);
  validateGraph(manifestInput, [...compiled.values()]);
  return { manifest: manifestInput, manifestUtf8: `${JSON.stringify(manifestInput, null, 2)}\n`, files };
}
