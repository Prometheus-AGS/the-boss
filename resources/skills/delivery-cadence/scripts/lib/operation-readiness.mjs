import { promises as fs } from 'node:fs';
import path from 'node:path';
const text = value => typeof value === 'string' && value.trim().length > 0;
const fail = message => { throw new Error(message); };
const list = (value, name) => {
  if (!Array.isArray(value)) fail(`featureOperation.${name} must be an explicit array`);
  return structuredClone(value);
};
function entrypoint(value) {
  if (!value || !text(value.command) || !Array.isArray(value.args) || value.args.some(arg => typeof arg !== 'string') || !text(value.cwd) || !path.isAbsolute(value.cwd)) fail('Feature operation entrypoint needs command, string args and absolute cwd');
  if (value.kind === 'test-suite' || value.role === 'test-suite') fail('A test-suite runner cannot substitute for operating the delivered production function');
  return structuredClone(value);
}
export function normalizeOperation(value, scope, { contractVersion = 2, stage = 'start' } = {}) {
  if (!value || typeof value !== 'object') fail('start requires a featureOperation describing the delivered function');
  for (const key of ['id', 'outcome', 'procedure', 'checkpointId']) if (!text(value[key])) fail(`featureOperation.${key} must be a nonempty string`);
  if (!scope?.outcomes?.includes(value.outcome)) fail('featureOperation.outcome must identify one selected user-visible outcome');
  if (contractVersion < 3) return Object.fromEntries(['id', 'outcome', 'procedure', 'checkpointId'].map(key => [key, value[key]]));
  if (!text(value.promisedCapability)) fail('featureOperation.promisedCapability must describe the usable feature');
  if (!value.entrypoint && !text(value.creationTaskRef)) fail('Feature operation needs a production entrypoint or an approved creationTaskRef before admission');
  if (value.creationTaskRef && !scope.tasks?.includes(value.creationTaskRef)) fail('Feature operation creationTaskRef must reference an approved selected task');
  if (value.entrypoint) entrypoint(value.entrypoint);
  if (value.entrypoint?.sourcePaths && (!Array.isArray(value.entrypoint.sourcePaths) || value.entrypoint.sourcePaths.some(p => !text(p)))) fail('Entrypoint sourcePaths must be string paths');
  if (value.entrypoint?.buildProducedPaths && (!Array.isArray(value.entrypoint.buildProducedPaths) || value.entrypoint.buildProducedPaths.some(p => !text(p)))) fail('Entrypoint buildProducedPaths must be string paths');
  if (!value.target || !['real', 'substitute', 'local'].includes(value.target.kind) || !text(value.target.description)) fail('Feature operation target needs real/substitute/local kind and description');
  if (!text(value.evidenceLevel) || !text(value.expectedResult)) fail('Feature operation needs evidenceLevel and expectedResult');
  if (value.target.kind === 'substitute' && value.evidenceLevel !== 'substitute') fail('A substitute target supports only substitute evidence, not real-service or installed claims');
  if (value.evidenceLevel === 'real-service' && value.target.kind !== 'real') fail('Real-service evidence requires a real target');
  const result = { ...structuredClone(value), contractVersion: 3 };
  for (const name of ['prerequisites', 'isolatedResources', 'externalEffects', 'authorityRefs', 'limitations']) result[name] = list(value[name], name);
  if (result.authorityRefs.some(ref => !text(ref))) fail('Authority references must be nonempty strings');
  for (const effect of result.externalEffects) {
    if (!effect || !text(effect.description) || !text(effect.authorityRef) || !result.authorityRefs.includes(effect.authorityRef)) fail('Every external effect needs a description and a declared authority reference');
  }
  if (result.target.kind === 'substitute' && !result.limitations.length) fail('Substitute operation must declare its evidence limitations');
  if (stage === 'ready' || stage === 'freeze' || stage === 'after-build') {
    if (!result.entrypoint) fail('Implement the approved feature-operation entrypoint before ready');
  }
  return result;
}

/** Check existing source before freeze; generated outputs only after their build. */
export async function assertOperationReady(value, scope, options = {}) {
  const stage = options.stage ?? 'ready';
  const operation = normalizeOperation(value, scope, { contractVersion: options.contractVersion ?? 3, stage });
  if ((options.contractVersion ?? 3) < 3) return operation;
  const admission = ['start', 'admit'].includes(stage);
  if (!admission && operation.creationTaskRef && !(options.completedTaskRefs ?? []).includes(operation.creationTaskRef)) fail(`Complete approved operation task ${operation.creationTaskRef} before ${stage}`);
  for (const prerequisite of operation.prerequisites) {
    if (!prerequisite || !text(prerequisite.id) || !text(prerequisite.description)) fail('Operation prerequisites need id and description');
    if (!admission && !(options.satisfiedPrerequisiteIds ?? []).includes(prerequisite.id)) fail(`Operation prerequisite unresolved: ${prerequisite.id}`);
  }
  if (admission && operation.creationTaskRef) return operation;
  const entry = operation.entrypoint;
  const configured = options.profile?.checkpoints?.find(step => step.id === operation.checkpointId);
  if (options.profile && (!configured || configured.kind !== 'run' || configured.command !== entry.command || JSON.stringify(configured.args) !== JSON.stringify(entry.args) || path.resolve(configured.cwd) !== path.resolve(entry.cwd))) fail('Feature-operation entrypoint must match its configured run checkpoint command, args and cwd');
  const nodeCommand = ['node', 'node.exe', path.basename(process.execPath)].includes(path.basename(entry.command));
  if (nodeCommand) {
    const script = entry.args.find(arg => !arg.startsWith('-'));
    if (!script || entry.args.includes('-e') || entry.args.includes('--eval')) fail('Node feature operations must identify a source or built script file');
    const declared = [...(entry.sourcePaths ?? []), ...(entry.buildProducedPaths ?? [])].map(file => path.resolve(entry.cwd, file));
    if (!declared.includes(path.resolve(entry.cwd, script))) fail('Node operation script must appear in sourcePaths or buildProducedPaths');
  }
  const cwd = await fs.stat(entry.cwd).catch(() => null);
  if (!cwd?.isDirectory()) fail(`Operation working directory does not exist: ${entry.cwd}`);
  const files = [...(entry.sourcePaths ?? []), ...(stage === 'after-build' ? entry.buildProducedPaths ?? [] : [])];
  // Bare commands resolve via the child process environment. Explicit paths
  // are inspectable now, except outputs explicitly owned by the pending build.
  if (path.isAbsolute(entry.command) || entry.command.includes('/') || entry.command.includes('\\')) {
    const command = path.resolve(entry.cwd, entry.command);
    const generated = (entry.buildProducedPaths ?? []).some(file => path.resolve(entry.cwd, file) === command);
    if (!generated || stage === 'after-build') files.push(command);
  }
  for (const name of files) {
    if (!text(name)) fail('Entrypoint sourcePaths/buildProducedPaths require strings');
    const file = path.resolve(entry.cwd, name);
    if (!(await fs.stat(file).catch(() => null))?.isFile()) fail(`Operation entrypoint file missing at ${stage}: ${file}`);
  }
  return operation;
}
