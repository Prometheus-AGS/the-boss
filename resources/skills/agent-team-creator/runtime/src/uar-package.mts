import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  Json, ObjectValue, UarAuthoringDefinition,
  UarCompiledPackage, UarDefinitionKind,
} from './types.mjs';
import { object, relativeFile, text } from './validation.mjs';

const PROFILE = 'urn:prometheus:uar:collaboration:0.1.0-draft.1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const kinds = new Set<UarDefinitionKind>(['AgentDefinition', 'TeamDefinition', 'WorkflowDefinition']);
const requiredByKind: Record<UarDefinitionKind, string[]> = {
  AgentDefinition: ['provenance','requiredCapabilities','extensions','title','role','whenToUse','instructions','input','output','skills','models','permittedChildren','context','requestedLimits'],
  TeamDefinition: ['provenance','requiredCapabilities','extensions','title','purpose','members','coordinatorRole','communication','taskAcceptance','routing','limits','budget','input','output'],
  WorkflowDefinition: ['provenance','requiredCapabilities','extensions','title','input','output','steps','failurePolicy','maxActivations'],
};
const allowedByKind: Record<UarDefinitionKind, Set<string>> = {
  AgentDefinition: new Set(['profile','kind','id','version','contentDigest',...requiredByKind.AgentDefinition,'legacySections','sourceDescriptor']),
  TeamDefinition: new Set(['profile','kind','id','version','contentDigest',...requiredByKind.TeamDefinition]),
  WorkflowDefinition: new Set(['profile','kind','id','version','contentDigest',...requiredByKind.WorkflowDefinition]),
};

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function assertUnicode(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error('Canonical JSON refuses an unpaired high surrogate');
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('Canonical JSON refuses an unpaired low surrogate');
    }
  }
}

function canonical(value: Json): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON requires finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicode(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => {
    assertUnicode(key);
    return `${JSON.stringify(key)}:${canonical(value[key])}`;
  }).join(',')}}`;
}

function cloneObject(value: unknown, label: string): ObjectValue {
  return structuredClone(object(value, label));
}

function selfDigest(document: ObjectValue): string {
  const copy = structuredClone(document);
  delete copy.contentDigest;
  return sha256(canonical(copy));
}

function validateDefinitionSemantics(document: ObjectValue, kind: UarDefinitionKind): void {
  if (kind === 'AgentDefinition') {
    if (!Array.isArray(document.skills)) throw new Error('AgentDefinition.skills must be an array');
    for (const [index, entry] of document.skills.entries()) {
      const skill = object(entry, `skills[${index}]`);
      for (const field of ['id','version','digest']) text(skill[field], `skills[${index}].${field}`);
      if (!DIGEST.test(String(skill.digest))) throw new Error(`skills[${index}].digest must be sha256:<64 lowercase hex>`);
      if (typeof skill.required !== 'boolean') throw new Error(`skills[${index}].required must be boolean`);
      object(skill.config, `skills[${index}].config`);
    }
    if (!Array.isArray(document.models) || document.models.length === 0) throw new Error('AgentDefinition.models must be a nonempty array');
    object(document.context, 'AgentDefinition.context');
    object(document.requestedLimits, 'AgentDefinition.requestedLimits');
    return;
  }
  if (kind === 'TeamDefinition') {
    if (!Array.isArray(document.members) || document.members.length === 0) throw new Error('TeamDefinition.members must be a nonempty array');
    const roles = new Set<string>();
    let coordinatorIsAgent = false;
    for (const [index, entry] of document.members.entries()) {
      const member = object(entry, `members[${index}]`);
      const role = text(member.role, `members[${index}].role`);
      if (roles.has(role)) throw new Error(`Duplicate team member role ${role}`);
      roles.add(role);
      if (!['agent','team'].includes(String(member.kind))) throw new Error(`Invalid members[${index}].kind`);
      if (!Number.isSafeInteger(member.min) || !Number.isSafeInteger(member.max) || Number(member.min) < 0 || Number(member.max) < 1 || Number(member.min) > Number(member.max)) {
        throw new Error(`Invalid members[${index}] cardinality`);
      }
      if (role === document.coordinatorRole && member.kind === 'agent') coordinatorIsAgent = true;
    }
    if (!coordinatorIsAgent) throw new Error('coordinatorRole must name an agent member');
    if (!Array.isArray(document.communication)) throw new Error('TeamDefinition.communication must be an array');
    for (const [index, entry] of document.communication.entries()) {
      const edge = object(entry, `communication[${index}]`);
      for (const field of ['fromRole','toRole']) if (!roles.has(text(edge[field], `communication[${index}].${field}`))) {
        throw new Error(`communication[${index}].${field} is not a member role`);
      }
    }
    return;
  }
  if (!Array.isArray(document.steps) || document.steps.length === 0) throw new Error('WorkflowDefinition.steps must be a nonempty array');
  const steps = new Map<string, ObjectValue>();
  for (const [index, entry] of document.steps.entries()) {
    const step = object(entry, `steps[${index}]`);
    const stepId = text(step.id, `steps[${index}].id`);
    if (steps.has(stepId)) throw new Error(`Duplicate workflow step ${stepId}`);
    if (!Array.isArray(step.dependsOn)) throw new Error(`steps[${index}].dependsOn must be an array`);
    steps.set(stepId, step);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (stepId: string): void => {
    if (visiting.has(stepId)) throw new Error(`Workflow dependency cycle at ${stepId}`);
    if (visited.has(stepId)) return;
    const step = steps.get(stepId);
    if (!step) throw new Error(`Unknown workflow dependency ${stepId}`);
    visiting.add(stepId);
    for (const dependency of step.dependsOn as Json[]) visit(text(dependency, `${stepId}.dependsOn`));
    visiting.delete(stepId); visited.add(stepId);
  };
  for (const stepId of steps.keys()) visit(stepId);
}

function definitionIdentity(document: ObjectValue, label: string): { id: string; version: string; kind: UarDefinitionKind } {
  if (document.profile !== PROFILE) throw new Error(`${label}.profile must be ${PROFILE}`);
  const kind = text(document.kind, `${label}.kind`) as UarDefinitionKind;
  if (!kinds.has(kind)) throw new Error(`${label}.kind is not a collaboration definition`);
  for (const field of Object.keys(document)) if (!allowedByKind[kind].has(field)) {
    throw new Error(`${label} contains unknown ${kind} field ${field}`);
  }
  const id = text(document.id, `${label}.id`);
  const version = text(document.version, `${label}.version`);
  if (!SEMVER.test(version)) throw new Error(`${label}.version must be semantic version x.y.z`);
  for (const field of requiredByKind[kind]) if (document[field] === undefined) {
    throw new Error(`${label} is missing required ${kind} field ${field}`);
  }
  validateDefinitionSemantics(document, kind);
  return { id, version, kind };
}

function references(document: ObjectValue): { owner: string; reference: ObjectValue }[] {
  const owner = text(document.id, 'definition.id');
  const result: { owner: string; reference: ObjectValue }[] = [];
  const add = (value: unknown, label: string): void => {
    const reference = object(value, label);
    text(reference.id, `${label}.id`);
    const version = text(reference.version, `${label}.version`);
    if (!SEMVER.test(version)) throw new Error(`${label}.version must be semantic version x.y.z`);
    if (reference.digest !== undefined && !DIGEST.test(text(reference.digest, `${label}.digest`))) {
      throw new Error(`${label}.digest must be sha256:<64 lowercase hex>`);
    }
    result.push({ owner, reference });
  };
  if (document.kind === 'AgentDefinition') {
    const children = document.permittedChildren;
    if (!Array.isArray(children)) throw new Error('AgentDefinition.permittedChildren must be an array');
    children.forEach((entry, index) => add(entry, `permittedChildren[${index}]`));
  } else if (document.kind === 'TeamDefinition') {
    const members = document.members;
    if (!Array.isArray(members)) throw new Error('TeamDefinition.members must be an array');
    members.forEach((entry, index) => add(object(entry, `members[${index}]`).definition, `members[${index}].definition`));
    const acceptance = object(document.taskAcceptance, 'taskAcceptance');
    const workflows = acceptance.allowedWorkflows;
    if (!Array.isArray(workflows)) throw new Error('taskAcceptance.allowedWorkflows must be an array');
    workflows.forEach((entry, index) => add(entry, `taskAcceptance.allowedWorkflows[${index}]`));
  }
  return result;
}

function replaceReferences(document: ObjectValue, resolve: (reference: ObjectValue) => ObjectValue): void {
  if (document.kind === 'AgentDefinition') {
    document.permittedChildren = (document.permittedChildren as Json[]).map(item => resolve(object(item, 'permitted child')));
  } else if (document.kind === 'TeamDefinition') {
    document.members = (document.members as Json[]).map(item => {
      const member = cloneObject(item, 'team member');
      member.definition = resolve(object(member.definition, 'team member definition'));
      return member;
    });
    const acceptance = cloneObject(document.taskAcceptance, 'taskAcceptance');
    acceptance.allowedWorkflows = (acceptance.allowedWorkflows as Json[]).map(item => resolve(object(item, 'allowed workflow')));
    document.taskAcceptance = acceptance;
  }
}

export function compileUarPackage(value: unknown): UarCompiledPackage {
  const source = object(value, 'authoring package');
  const manifestInput = cloneObject(source.manifest, 'package manifest');
  if (!Array.isArray(source.definitions) || source.definitions.length === 0) {
    throw new Error('authoring package definitions must be a nonempty array');
  }
  const definitions = (source.definitions as unknown[]).map((entry, index): UarAuthoringDefinition => {
    const item = object(entry, `definitions[${index}]`);
    const file = relativeFile(text(item.path, `definitions[${index}].path`));
    if (file === 'manifest.json') throw new Error('manifest.json is reserved for the compiled package manifest');
    return { path: file, document: cloneObject(item.document, `definitions[${index}].document`) };
  });
  const byKey = new Map<string, UarAuthoringDefinition>();
  const byPath = new Set<string>();
  for (const definition of definitions) {
    const identity = definitionIdentity(definition.document, definition.path);
    const key = `${identity.id}\u0000${identity.version}`;
    if (byKey.has(key)) throw new Error(`Duplicate definition identity/version: ${identity.id}@${identity.version}`);
    const foldedPath = definition.path.normalize('NFC').toLowerCase();
    if (byPath.has(foldedPath)) throw new Error(`Case-insensitive definition path collision: ${definition.path}`);
    byKey.set(key, definition);
    byPath.add(foldedPath);
  }

  const compiled = new Map<string, UarAuthoringDefinition>();
  const visiting = new Set<string>();
  const compile = (key: string): UarAuthoringDefinition => {
    const done = compiled.get(key);
    if (done) return done;
    if (visiting.has(key)) throw new Error(`Definition dependency cycle at ${key.replace('\u0000', '@')}`);
    const sourceDefinition = byKey.get(key);
    if (!sourceDefinition) throw new Error(`Unresolved definition reference ${key.replace('\u0000', '@')}`);
    visiting.add(key);
    const document = cloneObject(sourceDefinition.document, sourceDefinition.path);
    const suppliedDigest = document.contentDigest;
    delete document.contentDigest;
    replaceReferences(document, reference => {
      const referenceKey = `${text(reference.id, 'reference.id')}\u0000${text(reference.version, 'reference.version')}`;
      const dependency = compile(referenceKey);
      const digest = text(dependency.document.contentDigest, 'compiled dependency digest');
      if (reference.digest !== undefined && reference.digest !== digest) {
        throw new Error(`Reference digest conflict for ${reference.id}@${reference.version}`);
      }
      return { id: reference.id, version: reference.version, digest };
    });
    const digest = selfDigest(document);
    if (suppliedDigest !== undefined && suppliedDigest !== digest) {
      throw new Error(`Definition contentDigest conflict for ${document.id}@${document.version}; remove the old digest before revising content`);
    }
    document.contentDigest = digest;
    const result = { path: sourceDefinition.path, document };
    compiled.set(key, result);
    visiting.delete(key);
    return result;
  };
  for (const key of byKey.keys()) compile(key);

  if (manifestInput.profile !== PROFILE || manifestInput.kind !== 'PackageManifest') {
    throw new Error(`package manifest must use profile ${PROFILE} and kind PackageManifest`);
  }
  const manifestFields = new Set(['profile','kind','id','version','contentDigest','provenance','requiredCapabilities','extensions','entrypoints','files','lock','capabilityDeclarations','resolution']);
  for (const field of Object.keys(manifestInput)) if (!manifestFields.has(field)) throw new Error(`package manifest contains unknown field ${field}`);
  text(manifestInput.id, 'manifest.id');
  const manifestVersion = text(manifestInput.version, 'manifest.version');
  if (!SEMVER.test(manifestVersion)) throw new Error('manifest.version must be semantic version x.y.z');
  for (const field of ['provenance','requiredCapabilities','extensions','entrypoints','capabilityDeclarations']) {
    if (manifestInput[field] === undefined) throw new Error(`package manifest is missing required field ${field}`);
  }
  if (manifestInput.resolution !== 'exact-version-and-digest') throw new Error('manifest.resolution must be exact-version-and-digest');
  const entrypoints = manifestInput.entrypoints;
  if (!Array.isArray(entrypoints) || entrypoints.length === 0) throw new Error('manifest.entrypoints must be a nonempty array');
  manifestInput.entrypoints = entrypoints.map((entry, index) => {
    const reference = object(entry, `manifest.entrypoints[${index}]`);
    const key = `${text(reference.id, 'entrypoint.id')}\u0000${text(reference.version, 'entrypoint.version')}`;
    const definition = compile(key);
    const digest = text(definition.document.contentDigest, 'entrypoint digest');
    if (reference.digest !== undefined && reference.digest !== digest) throw new Error(`Entrypoint digest conflict for ${reference.id}@${reference.version}`);
    return { id: reference.id, version: reference.version, digest };
  });

  const files = [...compiled.values()].sort((a, b) => a.path.localeCompare(b.path)).map(definition => ({
    path: definition.path,
    contentUtf8: `${JSON.stringify(definition.document, null, 2)}\n`,
  }));
  manifestInput.files = files.map(file => {
    const definition = compiled.get(`${text(JSON.parse(file.contentUtf8).id, 'file id')}\u0000${text(JSON.parse(file.contentUtf8).version, 'file version')}`)!;
    return {
      path: file.path,
      kind: definition.document.kind,
      definition: {
        id: definition.document.id,
        version: definition.document.version,
        digest: definition.document.contentDigest,
      },
      byteDigest: sha256(file.contentUtf8),
    };
  });
  const locks: ObjectValue[] = [];
  for (const definition of compiled.values()) for (const item of references(definition.document)) {
    const key = `${item.reference.id}\u0000${item.reference.version}`;
    const resolved = compiled.get(key);
    if (!resolved) throw new Error(`Unresolved compiled reference ${item.reference.id}@${item.reference.version}`);
    locks.push({
      requestedBy: item.owner,
      reference: item.reference,
      resolvedPath: resolved.path,
    });
  }
  manifestInput.lock = locks.sort((a, b) =>
    String(a.requestedBy).localeCompare(String(b.requestedBy)) ||
    String(object(a.reference).id).localeCompare(String(object(b.reference).id)));
  const suppliedManifestDigest = manifestInput.contentDigest;
  delete manifestInput.contentDigest;
  const digest = selfDigest(manifestInput);
  if (suppliedManifestDigest !== undefined && suppliedManifestDigest !== digest) {
    throw new Error('PackageManifest contentDigest conflict; remove the old digest before revising content');
  }
  manifestInput.contentDigest = digest;
  return { manifest: manifestInput, manifestUtf8: `${JSON.stringify(manifestInput, null, 2)}\n`, files };
}

export function compileUarBinding(value: unknown): ObjectValue {
  const binding = cloneObject(value, 'deployment binding');
  if (binding.profile !== PROFILE || binding.kind !== 'DeploymentBinding') {
    throw new Error(`deployment binding must use profile ${PROFILE} and kind DeploymentBinding`);
  }
  const required = [
    'id','version','provenance','requiredCapabilities','extensions','exportClass','package','ownerId','workspaceId',
    'runtimeInstanceId','revision','modelBindings','skillBindings','storage','policyRevision','effectiveLimits',
    'effectiveBudget','contextGrants','representationGrantRefs','status',
  ];
  const allowed = new Set(['profile','kind','contentDigest',...required]);
  for (const field of Object.keys(binding)) if (!allowed.has(field)) throw new Error(`deployment binding contains unknown field ${field}`);
  for (const field of required) if (binding[field] === undefined) throw new Error(`deployment binding is missing required field ${field}`);
  if (binding.exportClass !== 'private-installed-state') throw new Error('deployment binding exportClass must be private-installed-state');
  if (!SEMVER.test(text(binding.version, 'binding.version'))) throw new Error('binding.version must be semantic version x.y.z');
  for (const field of ['id','ownerId','workspaceId','runtimeInstanceId','policyRevision']) text(binding[field], `binding.${field}`);
  object(binding.provenance, 'binding.provenance');
  object(binding.extensions, 'binding.extensions');
  if (!['inactive','ready','suspended'].includes(String(binding.status))) throw new Error('Invalid deployment binding status');
  if (!Number.isSafeInteger(binding.revision) || Number(binding.revision) < 0) throw new Error('binding.revision must be a nonnegative safe integer');
  const packageRef = object(binding.package, 'binding.package');
  for (const field of ['id','version','digest']) text(packageRef[field], `binding.package.${field}`);
  if (!DIGEST.test(String(packageRef.digest))) throw new Error('binding.package.digest must be sha256:<64 lowercase hex>');
  if (!Array.isArray(binding.modelBindings) || binding.modelBindings.length === 0) throw new Error('binding.modelBindings must be a nonempty array');
  for (const field of ['requiredCapabilities','skillBindings','contextGrants','representationGrantRefs']) {
    if (!Array.isArray(binding[field])) throw new Error(`binding.${field} must be an array`);
  }
  for (const [index, entry] of binding.modelBindings.entries()) {
    const model = object(entry, `binding.modelBindings[${index}]`);
    for (const field of ['requestedAlias','providerId','modelId','credentialRef']) text(model[field], `binding.modelBindings[${index}].${field}`);
    if (/^(?:bearer|token|secret|password|api[-_]?key):/i.test(String(model.credentialRef))) {
      throw new Error(`binding.modelBindings[${index}].credentialRef must be an opaque host reference, not a credential value`);
    }
  }
  const storage = object(binding.storage, 'binding.storage');
  for (const field of ['backend','connectionRef']) text(storage[field], `binding.storage.${field}`);
  if (storage.durableTransactions !== true) throw new Error('binding.storage.durableTransactions must be true');
  object(binding.effectiveLimits, 'binding.effectiveLimits');
  object(binding.effectiveBudget, 'binding.effectiveBudget');
  const suppliedDigest = binding.contentDigest;
  delete binding.contentDigest;
  const digest = selfDigest(binding);
  if (suppliedDigest !== undefined && suppliedDigest !== digest) throw new Error('DeploymentBinding contentDigest conflict');
  binding.contentDigest = digest;
  return binding;
}

export function writeUarPackage(directoryValue: unknown, value: unknown): { directory: string; manifest: ObjectValue; files: string[] } {
  const compiled = compileUarPackage(value);
  const directory = path.resolve(text(directoryValue, 'out'));
  mkdirSync(path.dirname(directory), { recursive: true });
  mkdirSync(directory);
  for (const file of compiled.files) {
    const destination = path.join(directory, ...file.path.split('/'));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, file.contentUtf8, { flag: 'wx', mode: 0o600 });
  }
  writeFileSync(path.join(directory, 'manifest.json'), compiled.manifestUtf8, { flag: 'wx', mode: 0o600 });
  return { directory, manifest: compiled.manifest, files: ['manifest.json', ...compiled.files.map(file => file.path)] };
}

export function loadUarPackage(directoryValue: unknown): UarCompiledPackage {
  const directory = path.resolve(text(directoryValue, 'packageDirectory'));
  const manifestUtf8 = readFileSync(path.join(directory, 'manifest.json'), 'utf8');
  const manifest = cloneObject(JSON.parse(manifestUtf8), 'manifest');
  if (!Array.isArray(manifest.files)) throw new Error('Compiled package manifest.files must be an array');
  const files = manifest.files.map((entry, index) => {
    const item = object(entry, `manifest.files[${index}]`);
    const file = relativeFile(text(item.path, `manifest.files[${index}].path`));
    const contentUtf8 = readFileSync(path.join(directory, ...file.split('/')), 'utf8');
    if (sha256(contentUtf8) !== item.byteDigest) throw new Error(`Package byte digest mismatch: ${file}`);
    const document = object(JSON.parse(contentUtf8), file);
    if (selfDigest(document) !== document.contentDigest) throw new Error(`Package content digest mismatch: ${file}`);
    return { path: file, contentUtf8 };
  });
  if (selfDigest(manifest) !== manifest.contentDigest) throw new Error('Package manifest content digest mismatch');
  return { manifest, manifestUtf8, files };
}

function flatten(value: Json, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  const walk = (item: Json, current: string): void => {
    if (item && typeof item === 'object') {
      if (Array.isArray(item)) item.forEach((child, index) => walk(child, `${current}/${index}`));
      else Object.keys(item).sort().forEach(key => walk(item[key], `${current}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`));
    } else result.set(current || '/', canonical(item));
  };
  walk(value, prefix);
  return result;
}

export function diffUarPackages(beforeValue: unknown, afterValue: unknown): ObjectValue {
  const before = compileUarPackage(beforeValue);
  const after = compileUarPackage(afterValue);
  const beforeFiles = new Map(before.files.map(file => [file.path, JSON.parse(file.contentUtf8) as Json]));
  const afterFiles = new Map(after.files.map(file => [file.path, JSON.parse(file.contentUtf8) as Json]));
  const added = [...afterFiles.keys()].filter(file => !beforeFiles.has(file)).sort();
  const removed = [...beforeFiles.keys()].filter(file => !afterFiles.has(file)).sort();
  const changes: ObjectValue[] = [];
  for (const file of [...beforeFiles.keys()].filter(file => afterFiles.has(file)).sort()) {
    const left = flatten(beforeFiles.get(file)!);
    const right = flatten(afterFiles.get(file)!);
    const paths = [...new Set([...left.keys(), ...right.keys()])].filter(key => left.get(key) !== right.get(key)).sort();
    if (paths.length) changes.push({ file, paths });
  }
  const beforeId = text(before.manifest.id, 'before manifest id');
  const afterId = text(after.manifest.id, 'after manifest id');
  if (beforeId !== afterId) throw new Error('Package maintenance cannot change package identity');
  const sameVersion = before.manifest.version === after.manifest.version;
  if (sameVersion && before.manifest.contentDigest !== after.manifest.contentDigest) {
    throw new Error('Changed immutable package content requires a new semantic version');
  }
  return {
    packageId: beforeId,
    fromVersion: before.manifest.version,
    toVersion: after.manifest.version,
    added,
    removed,
    changed: changes,
    unchanged: before.manifest.contentDigest === after.manifest.contentDigest,
  };
}
