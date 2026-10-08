import type { Json, ObjectValue, UarAuthoringDefinition, UarDefinitionKind } from '../types.mjs';
import { object, text } from '../validation.mjs';
import { DIGEST, SEMVER } from './canonical.mjs';

interface IndexedDefinition extends UarAuthoringDefinition {
  kind: UarDefinitionKind;
  key: string;
}

const keyOf = (value: ObjectValue, label: string): string => {
  const id = text(value.id, `${label}.id`);
  const version = text(value.version, `${label}.version`);
  if (!SEMVER.test(version)) throw new Error(`${label}.version must be semantic version x.y.z`);
  if (value.digest !== undefined && !DIGEST.test(text(value.digest, `${label}.digest`))) throw new Error(`${label}.digest must be sha256:<64 lowercase hex>`);
  return `${id}\u0000${version}`;
};

export function indexDefinitions(definitions: UarAuthoringDefinition[]): Map<string, IndexedDefinition> {
  const result = new Map<string, IndexedDefinition>();
  const paths = new Set<string>();
  for (const definition of definitions) {
    const kind = String(definition.document.kind) as UarDefinitionKind;
    if (!['AgentDefinition','TeamDefinition','WorkflowDefinition'].includes(kind)) throw new Error(`${definition.path}.kind is not a portable collaboration definition`);
    const key = keyOf(definition.document, definition.path);
    if (result.has(key)) throw new Error(`Duplicate definition identity/version: ${key.replace('\u0000', '@')}`);
    const folded = definition.path.normalize('NFC').toLocaleLowerCase('en-US');
    if (paths.has(folded)) throw new Error(`Case-insensitive definition path collision: ${definition.path}`);
    paths.add(folded);
    result.set(key, { ...definition, kind, key });
  }
  return result;
}

function resolve(index: Map<string, IndexedDefinition>, value: unknown, expected: UarDefinitionKind, pointer: string): IndexedDefinition {
  const reference = object(value, pointer);
  const key = keyOf(reference, pointer);
  const found = index.get(key);
  if (!found) throw new Error(`${pointer} references unresolved ${key.replace('\u0000', '@')}`);
  if (found.kind !== expected) throw new Error(`${pointer} expected ${expected}, observed ${found.kind}`);
  const actualDigest = text(found.document.contentDigest, `${found.path}.contentDigest`);
  if (reference.digest !== actualDigest) throw new Error(`${pointer}.digest does not exactly resolve ${key.replace('\u0000', '@')}`);
  return found;
}

export function validateGraph(manifest: ObjectValue, definitions: UarAuthoringDefinition[]): void {
  const index = indexDefinitions(definitions);
  if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length !== 1) throw new Error('/entrypoints must contain exactly one top-level TeamDefinition');
  const root = resolve(index, manifest.entrypoints[0], 'TeamDefinition', '/entrypoints/0');
  const dependencies = new Map<string, { key: string; pointer: string }[]>();

  for (const definition of index.values()) {
    const document = definition.document;
    const edges: { key: string; pointer: string }[] = [];
    if (definition.kind === 'AgentDefinition') {
      if (!Array.isArray(document.permittedChildren)) throw new Error(`${definition.path}/permittedChildren must be an array`);
      document.permittedChildren.forEach((entry, position) => {
        const pointer = `${definition.path}/permittedChildren/${position}`;
        edges.push({ key: resolve(index, entry, 'AgentDefinition', pointer).key, pointer });
      });
    }
    if (definition.kind === 'TeamDefinition') {
      if (!Array.isArray(document.members) || document.members.length === 0) throw new Error(`${definition.path}/members must be nonempty`);
      const roles = new Map<string, string>();
      let coordinatorAgent = false;
      document.members.forEach((entry, position) => {
        const member = object(entry, `${definition.path}/members/${position}`);
        const role = text(member.role, `${definition.path}/members/${position}/role`);
        if (roles.has(role)) throw new Error(`${definition.path}/members/${position}/role duplicates ${role}`);
        const declared = member.kind === 'agent' ? 'AgentDefinition' : member.kind === 'team' ? 'TeamDefinition' : null;
        if (!declared) throw new Error(`${definition.path}/members/${position}/kind must be agent or team`);
        const pointer = `${definition.path}/members/${position}/definition`;
        const target = resolve(index, member.definition, declared, pointer);
        roles.set(role, declared);
        edges.push({ key: target.key, pointer });
        if (role === document.coordinatorRole && declared === 'AgentDefinition') coordinatorAgent = true;
      });
      if (!coordinatorAgent) throw new Error(`${definition.path}/coordinatorRole must name an agent member`);
      if (!Array.isArray(document.communication)) throw new Error(`${definition.path}/communication must be an array`);
      document.communication.forEach((entry, position) => {
        const edge = object(entry, `${definition.path}/communication/${position}`);
        for (const field of ['fromRole','toRole']) if (!roles.has(text(edge[field], `${definition.path}/communication/${position}/${field}`))) {
          throw new Error(`${definition.path}/communication/${position}/${field} is not a team member role`);
        }
      });
      const acceptance = object(document.taskAcceptance, `${definition.path}/taskAcceptance`);
      if (!Array.isArray(acceptance.allowedWorkflows)) throw new Error(`${definition.path}/taskAcceptance/allowedWorkflows must be an array`);
      acceptance.allowedWorkflows.forEach((entry, position) => {
        const pointer = `${definition.path}/taskAcceptance/allowedWorkflows/${position}`;
        const workflow = resolve(index, entry, 'WorkflowDefinition', pointer);
        const steps = workflow.document.steps;
        if (!Array.isArray(steps)) throw new Error(`${workflow.path}/steps must be an array`);
        steps.forEach((step, stepPosition) => {
          const role = text(object(step, `${workflow.path}/steps/${stepPosition}`).role, `${workflow.path}/steps/${stepPosition}/role`);
          if (!roles.has(role)) throw new Error(`${workflow.path}/steps/${stepPosition}/role is not accepted by team ${document.id}`);
        });
      });
      const limits = object(document.limits, `${definition.path}/limits`);
      if (typeof limits.maxMembers === 'number' && document.members.length > limits.maxMembers) throw new Error(`${definition.path}/members exceeds limits.maxMembers`);
    }
    if (definition.kind === 'WorkflowDefinition') {
      if (!Array.isArray(document.steps) || document.steps.length === 0) throw new Error(`${definition.path}/steps must be nonempty`);
      const steps = new Map<string, ObjectValue>();
      document.steps.forEach((entry, position) => {
        const step = object(entry, `${definition.path}/steps/${position}`);
        const id = text(step.id, `${definition.path}/steps/${position}/id`);
        if (steps.has(id)) throw new Error(`${definition.path}/steps/${position}/id duplicates ${id}`);
        if (!Array.isArray(step.dependsOn)) throw new Error(`${definition.path}/steps/${position}/dependsOn must be an array`);
        steps.set(id, step);
      });
      const stepVisiting = new Set<string>(), stepVisited = new Set<string>();
      const visitStep = (id: string, trail: string[]): void => {
        if (stepVisiting.has(id)) throw new Error(`${definition.path} workflow dependency cycle: ${[...trail, id].join(' -> ')}`);
        if (stepVisited.has(id)) return;
        const step = steps.get(id); if (!step) throw new Error(`${definition.path} references unknown workflow dependency ${id}`);
        stepVisiting.add(id);
        for (const dependency of step.dependsOn as Json[]) visitStep(text(dependency, `${definition.path}/${id}/dependsOn`), [...trail, id]);
        stepVisiting.delete(id); stepVisited.add(id);
      };
      for (const id of steps.keys()) visitStep(id, []);
    }
    dependencies.set(definition.key, edges);
  }

  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (key: string, trail: string[]): void => {
    if (visiting.has(key)) throw new Error(`Definition dependency cycle: ${[...trail, key.replace('\u0000', '@')].join(' -> ')}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const edge of dependencies.get(key) ?? []) visit(edge.key, [...trail, key.replace('\u0000', '@')]);
    visiting.delete(key); visited.add(key);
  };
  visit(root.key, []);
  for (const key of dependencies.keys()) visit(key, []);
  const rootLimits = object(root.document.limits, `${root.path}/limits`);
  const maxDepth = Number(rootLimits.maxDepth), maxMembers = Number(rootLimits.maxMembers);
  const reachable = new Set<string>();
  let observedDepth = 0;
  const measure = (key: string, depth: number): void => {
    observedDepth = Math.max(observedDepth, depth);
    for (const edge of dependencies.get(key) ?? []) {
      reachable.add(edge.key); measure(edge.key, depth + 1);
    }
  };
  measure(root.key, 0);
  if (Number.isSafeInteger(maxDepth) && observedDepth > maxDepth) throw new Error(`${root.path} dependency depth ${observedDepth} exceeds limits.maxDepth ${maxDepth}`);
  if (Number.isSafeInteger(maxMembers) && reachable.size > maxMembers) throw new Error(`${root.path} dependency members ${reachable.size} exceeds limits.maxMembers ${maxMembers}`);
}
