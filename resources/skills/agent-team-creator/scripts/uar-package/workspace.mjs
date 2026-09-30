import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { UAR_PROFILE_V2 } from '../types.mjs';
import { id, object, relativeFile, text } from '../validation.mjs';
import { commitChanges, projectFile, readFile, stage } from '../project-files.mjs';
import { SEMVER } from './canonical.mjs';
import { compileUarPackage } from './compiler.mjs';
import { normalizeAuthoring } from './migration.mjs';
import { compiledAsAuthoring, loadUarPackage } from './package-files.mjs';
import { questionState, setPointer } from './workspace-questions.mjs';
const INDEX_FILE = 'workspace.json';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
function projectRoot(input) {
    return fs.realpathSync(path.resolve(text(input.project, 'project')));
}
function teamId(input, field = 'workspace') {
    return id(input[field], field);
}
function workspacePath(input, field = 'workspace') {
    return `.agent-team/${teamId(input, field)}/authoring`;
}
function expectedRevision(input) {
    if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0)
        throw new Error('expectedRevision must be a nonnegative integer from the current workspace');
    return Number(input.expectedRevision);
}
function json(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function readJson(file, label) {
    return object(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), label);
}
function validateQuestionState(value) {
    const state = object(value, 'workspace.questionState');
    if (!Array.isArray(state.questions))
        throw new Error('workspace.questionState.questions must be an array');
    const ids = new Set();
    for (const raw of state.questions) {
        const question = object(raw, 'workspace question'), questionId = text(question.id, 'workspace question id');
        if (ids.has(questionId))
            throw new Error(`Duplicate workspace question id: ${questionId}`);
        ids.add(questionId);
        relativeFile(text(question.document, 'workspace question document'));
        if (typeof question.pointer !== 'string' || !question.pointer.startsWith('/'))
            throw new Error('workspace question pointer must be a JSON Pointer');
        text(question.prompt, 'workspace question prompt');
        if (question.required !== true)
            throw new Error('workspace questions must be mandatory');
        if (!['pending', 'answered'].includes(String(question.state)))
            throw new Error('workspace question state must be pending or answered');
        if (question.state === 'answered' && question.answer === undefined)
            throw new Error(`Answered workspace question lacks an answer: ${questionId}`);
    }
    if (state.currentQuestionId !== null && (typeof state.currentQuestionId !== 'string' || !ids.has(state.currentQuestionId)))
        throw new Error('workspace.currentQuestionId must name a persisted question or be null');
    return structuredClone(state);
}
function validateIndex(value) {
    const index = object(value, 'workspace index');
    const allowed = new Set(['schemaVersion', 'revision', 'profile', 'teamId', 'packageId', 'packageVersion', 'manifest', 'definitions', 'migrationReceipt', 'bindingIntent', 'base', 'questionState']);
    for (const field of Object.keys(index))
        if (!allowed.has(field))
            throw new Error(`Unknown workspace index field: ${field}`);
    if (index.schemaVersion !== 1)
        throw new Error('workspace.schemaVersion must be 1');
    if (!Number.isSafeInteger(index.revision) || Number(index.revision) < 1)
        throw new Error('workspace.revision must be a positive integer');
    if (index.profile !== UAR_PROFILE_V2)
        throw new Error(`workspace.profile must be ${UAR_PROFILE_V2}`);
    id(index.teamId, 'workspace.teamId');
    text(index.packageId, 'workspace.packageId');
    if (!SEMVER.test(text(index.packageVersion, 'workspace.packageVersion')))
        throw new Error('workspace.packageVersion must be semantic version x.y.z');
    relativeFile(text(index.manifest, 'workspace.manifest'));
    if (!Array.isArray(index.definitions) || index.definitions.length === 0)
        throw new Error('workspace.definitions must be a nonempty array');
    const seen = new Set();
    for (const [position, item] of index.definitions.entries()) {
        const file = relativeFile(text(item, `workspace.definitions[${position}]`)), folded = file.normalize('NFC').toLocaleLowerCase('en-US');
        if (seen.has(folded))
            throw new Error(`Case-insensitive workspace path collision: ${file}`);
        seen.add(folded);
    }
    const manifestFolded = String(index.manifest).normalize('NFC').toLocaleLowerCase('en-US');
    if (seen.has(manifestFolded) || manifestFolded === INDEX_FILE)
        throw new Error('Workspace manifest path collides with another source document');
    if (index.migrationReceipt !== undefined)
        relativeFile(text(index.migrationReceipt, 'workspace.migrationReceipt'));
    if (index.bindingIntent !== undefined && !['package-only', 'package-and-binding'].includes(String(index.bindingIntent)))
        throw new Error('Invalid workspace.bindingIntent');
    if (index.base !== undefined) {
        const base = object(index.base, 'workspace.base');
        id(base.teamId, 'workspace.base.teamId');
        if (!Number.isSafeInteger(base.revision) || Number(base.revision) < 1)
            throw new Error('workspace.base.revision must be positive');
        if (!SEMVER.test(text(base.packageVersion, 'workspace.base.packageVersion')))
            throw new Error('workspace.base.packageVersion must be semantic');
    }
    validateQuestionState(index.questionState);
    return structuredClone(index);
}
function lock(project, workspace) {
    const lockFile = projectFile(project, `${workspace}.lock`);
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    const token = randomUUID();
    let descriptor;
    try {
        descriptor = fs.openSync(lockFile, 'wx', 0o600);
    }
    catch (error) {
        if (error.code === 'EEXIST')
            throw new Error(`Workspace lock held: ${workspace}.lock; inspect it before manual recovery`);
        throw error;
    }
    try {
        fs.writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid, at: new Date().toISOString() }));
        fs.fsyncSync(descriptor);
    }
    catch (error) {
        fs.closeSync(descriptor);
        fs.rmSync(lockFile, { force: true });
        throw error;
    }
    fs.closeSync(descriptor);
    return () => { try {
        if (JSON.parse(fs.readFileSync(lockFile, 'utf8')).token === token)
            fs.rmSync(lockFile);
    }
    catch { /* replaced lock belongs to another writer */ } };
}
export function loadWorkspace(input) {
    const project = projectRoot(input), workspace = workspacePath(input), base = `${workspace}/${INDEX_FILE}`;
    const index = validateIndex(readJson(projectFile(project, base), base));
    if (index.teamId !== teamId(input))
        throw new Error('Workspace team identity does not match its project path');
    const manifestPath = `${workspace}/${index.manifest}`, manifest = readJson(projectFile(project, manifestPath), manifestPath);
    if (manifest.id !== index.packageId || manifest.version !== index.packageVersion)
        throw new Error('Workspace index package identity/version does not match its manifest source');
    const definitions = index.definitions.map(file => ({ path: file, document: readJson(projectFile(project, `${workspace}/${file}`), `${workspace}/${file}`) }));
    let migrationReceipt;
    if (index.migrationReceipt)
        migrationReceipt = readJson(projectFile(project, `${workspace}/${index.migrationReceipt}`), 'migration receipt');
    return { root: workspace, index, package: { manifest, definitions }, ...(migrationReceipt ? { migrationReceipt } : {}) };
}
function assertRevision(workspace, expected) {
    if (workspace.index.revision !== expected)
        throw new Error(`Stale workspace revision: expected ${expected}, current ${workspace.index.revision}; reload before writing`);
}
export function initializeWorkspace(input) {
    const project = projectRoot(input), workspaceId = teamId(input), workspace = workspacePath(input);
    if (expectedRevision(input) !== 0)
        throw new Error('New workspace expectedRevision must be 0');
    const release = lock(project, workspace);
    try {
        const indexFile = projectFile(project, `${workspace}/${INDEX_FILE}`);
        if (fs.existsSync(indexFile))
            throw new Error(`Workspace already exists: ${workspaceId}`);
        const migrationSource = input.sourceDirectory === undefined ? input.source : compiledAsAuthoring(loadUarPackage(projectFile(project, relativeFile(text(input.sourceDirectory, 'sourceDirectory')))));
        const normalized = migrationSource === undefined ? null : normalizeAuthoring(migrationSource);
        const packageId = normalized ? text(normalized.package.manifest.id, 'manifest.id') : text(input.packageId, 'packageId');
        const packageVersion = normalized ? text(normalized.package.manifest.version, 'manifest.version') : text(input.packageVersion, 'packageVersion');
        if (!SEMVER.test(packageVersion))
            throw new Error('packageVersion must be semantic version x.y.z');
        const definitionPaths = normalized ? normalized.package.definitions.map(item => item.path) : (() => {
            if (!Array.isArray(input.definitionPaths) || input.definitionPaths.length === 0)
                throw new Error('definitionPaths must declare at least one source document path');
            return input.definitionPaths.map((item, position) => relativeFile(text(item, `definitionPaths[${position}]`)));
        })();
        const manifestPath = input.manifestPath === undefined ? 'manifest.source.json' : relativeFile(text(input.manifestPath, 'manifestPath'));
        const manifest = normalized ? normalized.package.manifest : { profile: UAR_PROFILE_V2, kind: 'PackageManifest', id: packageId, version: packageVersion };
        const definitions = normalized ? normalized.package.definitions : definitionPaths.map(file => ({ path: file, document: {} }));
        const migrationReceipt = normalized?.receipt ?? { schemaVersion: 1, sourceProfile: 'new-authoring', targetProfile: UAR_PROFILE_V2, diagnostics: [], activationBlocked: false };
        const bindingIntent = input.bindingIntent ?? 'package-only';
        const index = validateIndex({ schemaVersion: 1, revision: 1, profile: UAR_PROFILE_V2, teamId: workspaceId, packageId, packageVersion, manifest: manifestPath, definitions: definitionPaths, migrationReceipt: 'migration-receipt.json', bindingIntent, questionState: questionState(manifestPath, manifest, definitions, String(bindingIntent)) });
        const changes = new Map();
        stage(changes, project, `${workspace}/${INDEX_FILE}`, json(index));
        stage(changes, project, `${workspace}/${index.manifest}`, json(manifest));
        for (const definition of definitions)
            stage(changes, project, `${workspace}/${definition.path}`, json(definition.document));
        stage(changes, project, `${workspace}/${index.migrationReceipt}`, json(migrationReceipt));
        const recovery = commitChanges(project, [...changes.values()], { operation: 'workspace-init', teamId: workspaceId, beforeRevision: 0, afterRevision: 1 });
        return { workspace: workspaceId, path: workspace, revision: 1, packageId: index.packageId, packageVersion: index.packageVersion, documents: definitions.length + 2, recovery };
    }
    finally {
        release();
    }
}
function stageMutation(project, workspace, operation, changes) {
    const beforeRevision = workspace.index.revision, afterRevision = beforeRevision + 1;
    workspace.index.revision = afterRevision;
    stage(changes, project, `${workspace.root}/${INDEX_FILE}`, json(workspace.index));
    const recovery = commitChanges(project, [...changes.values()], { operation, teamId: workspace.index.teamId, beforeRevision, afterRevision });
    return { workspace: workspace.index.teamId, path: workspace.root, beforeRevision, revision: afterRevision, recovery };
}
export function updateWorkspaceDocument(input) {
    const project = projectRoot(input), workspace = workspacePath(input), file = relativeFile(text(input.path, 'path')), release = lock(project, workspace);
    try {
        const current = loadWorkspace(input);
        assertRevision(current, expectedRevision(input));
        const allowed = new Set([current.index.manifest, ...current.index.definitions]);
        if (!allowed.has(file))
            throw new Error(`Workspace update path is not declared by workspace.json: ${file}`);
        const document = object(input.document, 'document');
        if (file === current.index.manifest) {
            if (document.kind !== 'PackageManifest' || document.id !== current.index.packageId || document.version !== current.index.packageVersion)
                throw new Error('Manifest update cannot change package kind, identity, or version');
            current.package.manifest = structuredClone(document);
        }
        else {
            if (!['AgentDefinition', 'TeamDefinition', 'WorkflowDefinition'].includes(String(document.kind)))
                throw new Error('Definition update must contain one portable collaboration definition');
            const selected = current.package.definitions.find(item => item.path === file);
            if (selected.document.kind !== document.kind || selected.document.id !== document.id || selected.document.version !== document.version)
                throw new Error('Document update cannot change immutable kind, identity, or version; use workspace revision');
            selected.document = structuredClone(document);
        }
        current.index.questionState = questionState(current.index.manifest, current.package.manifest, current.package.definitions, current.index.bindingIntent, current.index.questionState);
        const changes = new Map();
        stage(changes, project, `${workspace}/${file}`, json(document));
        return { ...stageMutation(project, current, 'workspace-update', changes), path: file, kind: document.kind, id: document.id, version: document.version };
    }
    finally {
        release();
    }
}
export function answerWorkspaceQuestion(input) {
    const project = projectRoot(input), workspace = workspacePath(input), release = lock(project, workspace);
    try {
        const current = loadWorkspace(input);
        assertRevision(current, expectedRevision(input));
        const questionId = text(input.questionId, 'questionId'), question = current.index.questionState.questions.find(item => item.id === questionId);
        if (!question)
            throw new Error(`Unknown workspace question: ${questionId}`);
        if (input.answer === undefined)
            throw new Error('answer is required');
        const changes = new Map();
        if (question.document === INDEX_FILE) {
            if (question.pointer !== '/bindingIntent' || !['package-only', 'package-and-binding'].includes(String(input.answer)))
                throw new Error('Invalid binding-intent answer');
            current.index.bindingIntent = input.answer;
        }
        else {
            const selected = question.document === current.index.manifest ? current.package.manifest : current.package.definitions.find(item => item.path === question.document)?.document;
            if (!selected)
                throw new Error(`Question document is no longer declared: ${question.document}`);
            setPointer(selected, question.pointer, input.answer);
            stage(changes, project, `${current.root}/${question.document}`, json(selected));
        }
        current.index.questionState = questionState(current.index.manifest, current.package.manifest, current.package.definitions, current.index.bindingIntent, current.index.questionState);
        return { ...stageMutation(project, current, 'workspace-answer', changes), questionId, currentQuestionId: current.index.questionState.currentQuestionId };
    }
    finally {
        release();
    }
}
export function workspaceStatus(input) {
    const workspace = loadWorkspace(input), diagnostics = workspace.migrationReceipt?.diagnostics ?? [];
    const cursor = input.cursor === undefined ? 0 : Number(input.cursor), requested = input.pageSize === undefined ? DEFAULT_PAGE_SIZE : Number(input.pageSize);
    if (!Number.isSafeInteger(cursor) || cursor < 0)
        throw new Error('cursor must be a nonnegative integer');
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > MAX_PAGE_SIZE)
        throw new Error(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
    const items = diagnostics.slice(cursor, cursor + requested), next = cursor + items.length;
    const current = workspace.index.questionState.questions.find(item => item.id === workspace.index.questionState.currentQuestionId), answered = workspace.index.questionState.questions.filter(item => item.state === 'answered').length;
    return { teamId: workspace.index.teamId, revision: workspace.index.revision, packageId: workspace.index.packageId, packageVersion: workspace.index.packageVersion, profile: UAR_PROFILE_V2,
        counts: { agents: workspace.package.definitions.filter(item => item.document.kind === 'AgentDefinition').length, teams: workspace.package.definitions.filter(item => item.document.kind === 'TeamDefinition').length, workflows: workspace.package.definitions.filter(item => item.document.kind === 'WorkflowDefinition').length, diagnostics: diagnostics.length },
        complete: current === undefined && !workspace.migrationReceipt?.activationBlocked,
        nextQuestion: current ? { id: current.id, document: current.document, pointer: current.pointer, question: current.prompt } : null,
        questions: { answered, pending: workspace.index.questionState.questions.length - answered, currentQuestionId: workspace.index.questionState.currentQuestionId },
        diagnostics: { items, cursor: next < diagnostics.length ? String(next) : null, remaining: Math.max(0, diagnostics.length - next) } };
}
function compareSemver(left, right) {
    const parse = (value) => { const [core, pre] = value.split('-', 2); return [core.split('.').map(Number), pre === undefined ? [] : pre.split('.')]; };
    const [leftCore, leftPre] = parse(left), [rightCore, rightPre] = parse(right);
    for (let index = 0; index < 3; index++)
        if (leftCore[index] !== rightCore[index])
            return leftCore[index] - rightCore[index];
    if (!leftPre.length || !rightPre.length)
        return leftPre.length ? -1 : rightPre.length ? 1 : 0;
    for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index++) {
        const a = leftPre[index], b = rightPre[index];
        if (a === undefined || b === undefined)
            return a === undefined ? -1 : 1;
        if (a === b)
            continue;
        const an = /^[0-9]+$/.test(a), bn = /^[0-9]+$/.test(b);
        if (an && bn)
            return Number(a) - Number(b);
        if (an !== bn)
            return an ? -1 : 1;
        return a.localeCompare(b);
    }
    return 0;
}
function replaceReferences(document, tuples) {
    let changed = false;
    const visit = (value) => {
        if (!value || typeof value !== 'object')
            return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value.id === 'string' && typeof value.version === 'string') {
            const tuple = tuples.find(item => item.id === value.id && item.fromVersion === value.version);
            if (tuple) {
                value.version = tuple.toVersion;
                delete value.digest;
                changed = true;
            }
        }
        Object.values(value).forEach(visit);
    };
    visit(document);
    return changed;
}
export function reviseWorkspace(input) {
    const project = projectRoot(input), sourcePath = workspacePath(input), destinationId = teamId(input, 'out'), destinationPath = workspacePath(input, 'out'), release = lock(project, sourcePath);
    try {
        const current = loadWorkspace(input);
        assertRevision(current, expectedRevision(input));
        const nextVersion = text(input.nextVersion, 'nextVersion');
        if (!SEMVER.test(nextVersion) || compareSemver(nextVersion, current.index.packageVersion) <= 0)
            throw new Error(`nextVersion must be greater than current package version ${current.index.packageVersion}`);
        if (fs.existsSync(projectFile(project, `${destinationPath}/${INDEX_FILE}`)))
            throw new Error(`Workspace already exists: ${destinationId}`);
        const definitions = current.package.definitions.map(item => ({ path: item.path, document: structuredClone(item.document), raw: readFile(projectFile(project, `${sourcePath}/${item.path}`)) }));
        const edits = input.edits === undefined ? [] : input.edits;
        if (!Array.isArray(edits))
            throw new Error('edits must be an array');
        const changedPaths = new Set(), tuples = [];
        for (const [position, raw] of edits.entries()) {
            const edit = object(raw, `edits[${position}]`), file = relativeFile(text(edit.path, `edits[${position}].path`));
            if (changedPaths.has(file))
                throw new Error(`Duplicate revision edit: ${file}`);
            const selected = definitions.find(item => item.path === file);
            if (!selected)
                throw new Error(`Revision edit path is not a definition: ${file}`);
            const document = object(edit.document, `edits[${position}].document`);
            if (document.kind !== selected.document.kind || document.id !== selected.document.id)
                throw new Error(`Revision edit cannot change definition kind or identity: ${file}`);
            const oldVersion = text(selected.document.version, `${file}.version`), newVersion = text(document.version, `${file}.version`);
            if (!SEMVER.test(newVersion) || compareSemver(newVersion, oldVersion) <= 0)
                throw new Error(`Edited definition ${file} requires a strictly greater semantic version`);
            delete document.contentDigest;
            selected.document = structuredClone(document);
            changedPaths.add(file);
            tuples.push({ id: text(document.id, `${file}.id`), fromVersion: oldVersion, toVersion: newVersion });
        }
        for (let pass = 0; pass <= definitions.length; pass++) {
            let propagated = false;
            for (const selected of definitions) {
                if (!replaceReferences(selected.document, tuples) || changedPaths.has(selected.path))
                    continue;
                const oldVersion = text(current.package.definitions.find(item => item.path === selected.path).document.version, `${selected.path}.version`);
                if (compareSemver(nextVersion, oldVersion) <= 0)
                    throw new Error(`Dependency update requires ${nextVersion} to exceed ${selected.path} version ${oldVersion}`);
                selected.document.version = nextVersion;
                delete selected.document.contentDigest;
                changedPaths.add(selected.path);
                tuples.push({ id: text(selected.document.id, `${selected.path}.id`), fromVersion: oldVersion, toVersion: nextVersion });
                propagated = true;
            }
            if (!propagated)
                break;
        }
        const manifest = structuredClone(current.package.manifest);
        manifest.version = nextVersion;
        delete manifest.contentDigest;
        delete manifest.files;
        delete manifest.lock;
        replaceReferences(manifest, tuples);
        compileUarPackage({ manifest, definitions: definitions.map(item => ({ path: item.path, document: item.document })) }, current.migrationReceipt);
        const nextRevision = current.index.revision + 1;
        const index = validateIndex({ ...current.index, revision: nextRevision, teamId: destinationId, packageVersion: nextVersion, base: { teamId: current.index.teamId, revision: current.index.revision, packageVersion: current.index.packageVersion }, questionState: questionState(current.index.manifest, manifest, definitions, current.index.bindingIntent, current.index.questionState) });
        const changes = new Map();
        stage(changes, project, `${destinationPath}/${INDEX_FILE}`, json(index));
        stage(changes, project, `${destinationPath}/${index.manifest}`, json(manifest));
        for (const definition of definitions)
            stage(changes, project, `${destinationPath}/${definition.path}`, changedPaths.has(definition.path) ? json(definition.document) : definition.raw);
        if (index.migrationReceipt)
            stage(changes, project, `${destinationPath}/${index.migrationReceipt}`, readFile(projectFile(project, `${sourcePath}/${index.migrationReceipt}`)));
        const recovery = commitChanges(project, [...changes.values()], { operation: 'workspace-revise', teamId: destinationId, baseTeamId: current.index.teamId, beforeRevision: current.index.revision, afterRevision: nextRevision });
        return { workspace: destinationId, path: destinationPath, ...(index.base ? { base: index.base } : {}), revision: nextRevision, packageVersion: nextVersion, changedDefinitions: [...changedPaths].sort(), unchangedDefinitions: definitions.filter(item => !changedPaths.has(item.path)).map(item => item.path).sort(), recovery };
    }
    finally {
        release();
    }
}
