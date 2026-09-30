import type {
  Json, MigrationDiagnostic, ObjectValue, Team, UarAuthoringDefinition,
  UarAuthoringPackage, UarMigrationReceipt,
} from '../types.mjs';
import { UAR_PROFILE_V1, UAR_PROFILE_V2 } from '../types.mjs';
import { object, text, validateTeam } from '../validation.mjs';
import { canonical, cloneObject, pointerSegment, selfDigest, sha256 } from './canonical.mjs';
import { assertPortable } from './private-authority.mjs';

export interface NormalizedAuthoring {
  package: UarAuthoringPackage;
  receipt: UarMigrationReceipt;
}

const supportedCapabilities = new Set(['collaboration_definition_packages_v2']);
const contract = (): ObjectValue => ({ type: 'object', additionalProperties: true });
const limits = (): ObjectValue => ({ concurrentTurns: 1, maxMembers: 16, maxDepth: 3, maxPendingTasks: 1000 });
const budget = (): ObjectValue => ({ maxTokens: 100000, maxCostMicrounits: 0, currency: 'USD', maxElapsedSeconds: 3600 });

function safeId(value: string): string {
  const cleaned = value.normalize('NFC').toLowerCase().replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'imported';
}

function diagnostic(sourceDocument: string, sourcePointer: string, disposition: MigrationDiagnostic['disposition'], reason: string, targetDocument?: string, targetPointer?: string): MigrationDiagnostic {
  return { sourceDocument, sourcePointer, disposition, reason, ...(targetDocument ? { targetDocument } : {}), ...(targetPointer ? { targetPointer } : {}) };
}

function leafDiagnostics(value: Json, sourceDocument: string, targetDocument: string, disposition: MigrationDiagnostic['disposition']): MigrationDiagnostic[] {
  const result: MigrationDiagnostic[] = [];
  const walk = (item: Json, pointer: string): void => {
    if (item && typeof item === 'object') {
      if (Array.isArray(item)) item.forEach((child, index) => walk(child, `${pointer}/${index}`));
      else Object.entries(item).forEach(([key, child]) => walk(child, `${pointer}/${pointerSegment(key)}`));
      return;
    }
    result.push(diagnostic(sourceDocument, pointer || '/', disposition, disposition === 'exact' ? 'field retained without semantic translation' : 'field retained through explicit profile translation', targetDocument, pointer || '/'));
  };
  walk(value, '');
  return result;
}

function supportDiagnostics(document: ObjectValue, sourceDocument: string): MigrationDiagnostic[] {
  const result: MigrationDiagnostic[] = [];
  const extensions = object(document.extensions ?? {}, `${sourceDocument}.extensions`);
  for (const [name, raw] of Object.entries(extensions)) {
    const extension = object(raw, `${sourceDocument}.extensions.${name}`);
    if (extension.required === true) result.push(diagnostic(sourceDocument, `/extensions/${pointerSegment(name)}`, 'required-unsupported', `required extension ${name} has no mini execution adapter`));
    else result.push(diagnostic(sourceDocument, `/extensions/${pointerSegment(name)}`, 'optional-unsupported', `optional extension ${name} is preserved but not executable`));
  }
  if (Array.isArray(document.requiredCapabilities)) document.requiredCapabilities.forEach((capability, index) => {
    if (typeof capability === 'string' && !supportedCapabilities.has(capability)) result.push(diagnostic(sourceDocument, `/requiredCapabilities/${index}`, 'required-unsupported', `required capability ${capability} is not implemented by mini`));
  });
  if (Array.isArray(document.capabilityDeclarations)) document.capabilityDeclarations.forEach((raw, index) => {
    const declaration = object(raw, `${sourceDocument}.capabilityDeclarations[${index}]`);
    const capability = String(declaration.capability ?? '');
    if (!supportedCapabilities.has(capability)) result.push(diagnostic(sourceDocument, `/capabilityDeclarations/${index}`, declaration.required === true ? 'required-unsupported' : 'optional-unsupported', `${declaration.required === true ? 'required' : 'optional'} capability ${capability} is not implemented by mini`));
  });
  return result;
}

function migrateDraft1Definition(source: UarAuthoringDefinition, diagnostics: MigrationDiagnostic[]): UarAuthoringDefinition {
  const document = cloneObject(source.document, source.path);
  const original = structuredClone(document);
  document.profile = UAR_PROFILE_V2;
  delete document.contentDigest;
  diagnostics.push(...leafDiagnostics(original as Json, source.path, source.path, 'exact').map(item => {
    if (item.sourcePointer === '/profile') return { ...item, disposition: 'translated' as const, reason: 'draft.1 profile identifier translated to the accepted draft.2 profile' };
    if (item.sourcePointer === '/contentDigest') return { ...item, disposition: 'translated' as const, reason: 'source digest retained in source identity while draft.2 content receives a new digest' };
    return item;
  }));
  if (document.kind === 'AgentDefinition') {
    const sourceDigest = typeof original.contentDigest === 'string' ? original.contentDigest : selfDigest(original);
    document.sourceIdentity = { profile: UAR_PROFILE_V1, id: document.id, version: document.version, digest: sourceDigest, revision: null };
    document.renameMapping = { sourceId: document.id, targetId: document.id, reason: 'unchanged' };
    document.authoredFields = [];
    for (const field of ['modelRequirements','promptDialect','ragConfiguration','contextStrategy','apiHarness']) document[field] = { required: false, value: {} };
    document.legacySections = document.legacySections ?? {};
    document.sourceDescriptor = document.sourceDescriptor ?? original;
    if (Array.isArray(document.skills)) document.skills = document.skills.map(raw => {
      const skill = cloneObject(raw, `${source.path}.skills`);
      skill.entrypoint ??= null;
      skill.requiredTools ??= [];
      return skill;
    });
  }
  diagnostics.push(...supportDiagnostics(document, source.path));
  return { path: source.path, document };
}

function migrateInline(value: ObjectValue): NormalizedAuthoring {
  const manifest = cloneObject(value.manifest, 'manifest');
  if (!Array.isArray(value.definitions)) throw new Error('authoring package definitions must be an array');
  const sourceDefinitions = value.definitions.map((entry, index) => {
    const item = object(entry, `definitions[${index}]`);
    return { path: text(item.path, `definitions[${index}].path`), document: cloneObject(item.document, `definitions[${index}].document`) };
  });
  assertPortable({ manifest, definitions: sourceDefinitions } as unknown as Json, 'inline-package');
  const sourceProfile = text(manifest.profile, 'manifest.profile');
  const diagnostics: MigrationDiagnostic[] = [];
  let definitions: UarAuthoringDefinition[];
  if (sourceProfile === UAR_PROFILE_V1) {
    definitions = sourceDefinitions.map(item => migrateDraft1Definition(item, diagnostics));
    manifest.profile = UAR_PROFILE_V2;
    manifest.requiredCapabilities = ['collaboration_definition_packages_v2'];
    if (Array.isArray(manifest.capabilityDeclarations)) manifest.capabilityDeclarations = [{ capability: 'collaboration_definition_packages_v2', required: true }];
    delete manifest.contentDigest; delete manifest.files; delete manifest.lock;
    diagnostics.push(diagnostic('manifest.json', '/profile', 'translated', 'draft.1 manifest normalized to the accepted draft.2 profile', 'manifest.json', '/profile'));
  } else if (sourceProfile === UAR_PROFILE_V2) {
    definitions = sourceDefinitions;
    diagnostics.push(...leafDiagnostics({ manifest, definitions } as unknown as Json, 'inline-package', 'workspace', 'exact'));
    diagnostics.push(...supportDiagnostics(manifest, 'manifest.json'));
    for (const item of definitions) diagnostics.push(...supportDiagnostics(item.document, item.path));
  } else throw new Error(`Unsupported collaboration source profile: ${sourceProfile}`);
  const receipt: UarMigrationReceipt = {
    schemaVersion: 1, sourceProfile, targetProfile: UAR_PROFILE_V2, diagnostics,
    activationBlocked: diagnostics.some(item => item.disposition === 'required-unsupported'),
    preservedSource: structuredClone(value) as Json,
  };
  return { package: { manifest, definitions }, receipt };
}

function skillReference(skill: string): ObjectValue {
  const id = `urn:prometheus:skill:${safeId(skill)}`;
  return { id, version: '0.0.0', digest: sha256(canonical(skill)), required: false, config: { legacyName: skill }, entrypoint: null, requiredTools: [] };
}

function flatTeamPackage(value: unknown): NormalizedAuthoring {
  const team = validateTeam(value);
  assertPortable(team as unknown as Json, 'flat-team');
  const version = '1.0.0';
  const base = `urn:prometheus:agent-team:${team.id}`;
  const definitions: UarAuthoringDefinition[] = team.roles.map(role => {
    const id = `${base}:agent:${role.id}`;
    const source = role as unknown as Json;
    return { path: `agents/${role.id}.json`, document: {
      profile: UAR_PROFILE_V2, kind: 'AgentDefinition', id, version,
      provenance: { source: 'prometheus portable flat team migration', authors: ['agent-team-creator'] },
      requiredCapabilities: [], extensions: {}, title: role.id, role: role.id,
      whenToUse: role.description, instructions: role.prompt, input: contract(), output: contract(),
      skills: role.skills.map(skillReference),
      models: [{ role: 'primary', capabilities: role.modelPolicy?.capabilities ?? [], preferredAliases: role.modelPolicy?.model ? [role.modelPolicy.model] : [] }],
      permittedChildren: [], context: { mode: 'selected', artifacts: [], history: 'authorized-summary', memoryScopes: [] }, requestedLimits: limits(),
      sourceIdentity: { profile: 'prometheus.agent-team/1', id: `${base}:legacy:${role.id}`, version, digest: sha256(canonical(source)), revision: null },
      renameMapping: { sourceId: `${base}:legacy:${role.id}`, targetId: id, reason: 'explicit-rename' }, authoredFields: [],
      modelRequirements: { required: false, value: (role.modelPolicy ?? {}) as unknown as Json }, promptDialect: { required: false, value: {} },
      ragConfiguration: { required: false, value: {} }, contextStrategy: { required: false, value: {} }, apiHarness: { required: false, value: { id: team.harness } },
      legacySections: {}, sourceDescriptor: structuredClone(role) as unknown as Json,
    } };
  });
  const workflowId = `${base}:workflow:default`;
  definitions.push({ path: 'workflows/default.json', document: {
    profile: UAR_PROFILE_V2, kind: 'WorkflowDefinition', id: workflowId, version,
    provenance: { source: 'prometheus portable flat team migration', authors: ['agent-team-creator'] }, requiredCapabilities: [], extensions: {},
    title: team.outcome, input: contract(), output: contract(), steps: team.roles.map(role => ({
      id: role.id, role: role.id, dependsOn: role.dependsOn, inputMapping: {}, output: contract(), effect: 'none', approval: 'none',
      retry: { maxAttempts: 1, onUnknownEffect: 'reconcile-before-retry' }, completion: 'artifact', instructions: role.prompt,
    })), failurePolicy: 'stop-dependent', maxActivations: 1000,
  } });
  definitions.push({ path: 'teams/root.json', document: {
    profile: UAR_PROFILE_V2, kind: 'TeamDefinition', id: `${base}:team`, version,
    provenance: { source: 'prometheus portable flat team migration', authors: ['agent-team-creator'] }, requiredCapabilities: [], extensions: {},
    title: team.id, purpose: team.outcome, members: team.roles.map(role => ({ role: role.id, kind: 'agent', definition: { id: `${base}:agent:${role.id}`, version }, min: 1, max: 1, responsibility: role.description })),
    coordinatorRole: team.roles[0]!.id, communication: [], taskAcceptance: { mode: 'operator', allowedWorkflows: [{ id: workflowId, version }] },
    routing: { eligibilityFirst: true, strategy: 'operator-role-capacity-cost-stable-id', explain: true }, limits: limits(), budget: budget(), input: contract(), output: contract(),
  } });
  const manifest: ObjectValue = {
    profile: UAR_PROFILE_V2, kind: 'PackageManifest', id: `${base}:package`, version,
    provenance: { source: 'prometheus portable flat team migration', authors: ['agent-team-creator'] },
    requiredCapabilities: ['collaboration_definition_packages_v2'], extensions: {}, entrypoints: [{ id: `${base}:team`, version }],
    capabilityDeclarations: [{ capability: 'collaboration_definition_packages_v2', required: true }], resolution: 'exact-version-and-digest',
  };
  const diagnostics = leafDiagnostics(team as unknown as Json, 'flat-team.json', 'workspace', 'translated');
  return { package: { manifest, definitions }, receipt: {
    schemaVersion: 1, sourceProfile: 'prometheus.agent-team/1', targetProfile: UAR_PROFILE_V2,
    diagnostics, activationBlocked: false, preservedSource: structuredClone(team) as unknown as Json,
  } };
}

function agentArtifactPackage(value: ObjectValue): NormalizedAuthoring {
  const artifactId = safeId(text(value.id, 'AgentArtifact.id'));
  const metadata = object(value.metadata ?? {}, 'AgentArtifact.metadata');
  const prefer = object(object(value.policy ?? {}, 'AgentArtifact.policy').skills ?? {}, 'AgentArtifact.policy.skills').prefer;
  const skills = Array.isArray(prefer) ? prefer.filter((item): item is string => typeof item === 'string') : [];
  const team: Team = {
    schemaVersion: 1, id: artifactId, outcome: typeof metadata.description === 'string' ? metadata.description : `Imported ${artifactId}`,
    scope: 'uar', harness: 'uar', roles: [{ id: 'agent', description: typeof metadata.description === 'string' ? metadata.description : artifactId,
      prompt: typeof object(value.prompt ?? {}, 'AgentArtifact.prompt').system === 'string' ? String(object(value.prompt ?? {}).system) : `Operate as ${artifactId}.`,
      skills, owns: [], inputs: [], outputs: [], dependsOn: [] }],
  };
  const migrated = flatTeamPackage(team);
  migrated.receipt.sourceProfile = 'uar.AgentArtifact/1';
  migrated.receipt.preservedSource = structuredClone(value) as Json;
  migrated.receipt.diagnostics = leafDiagnostics(value as Json, 'agent-artifact.json', 'workspace', 'translated');
  return migrated;
}

export function normalizeAuthoring(value: unknown): NormalizedAuthoring {
  const source = object(value, 'authoring input');
  if (source.package !== undefined) return normalizeAuthoring(source.package);
  if (source.manifest !== undefined && source.definitions !== undefined) return migrateInline(source);
  if (source.schemaVersion === 1 && Array.isArray(source.roles)) return flatTeamPackage(source);
  if (source.kind === 'agent' && source.runtime !== undefined) {
    assertPortable(source as Json, 'agent-artifact');
    return agentArtifactPackage(source);
  }
  throw new Error('Unsupported authoring input; expected workspace, inline package, flat team, or legacy AgentArtifact');
}

export function assertMigrationAllowsBuild(receipt: UarMigrationReceipt | undefined): void {
  const blocked = receipt?.diagnostics.find(item => item.disposition === 'required-unsupported');
  if (blocked) throw new Error(`${blocked.sourceDocument}${blocked.sourcePointer}: required migration semantics are unsupported (${blocked.reason})`);
}
