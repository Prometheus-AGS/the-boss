import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { assertNoCredentials, endpoint, object, requestJson, RequestFailure, text } from './models-http.mjs';
import { projectFile, readFile } from './project-files.mjs';
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object')
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');
function reference(state, provenance) {
    if (provenance.kbd === undefined)
        return;
    const kbd = object(provenance.kbd, 'provenance.kbd');
    for (const key of ['projectId', 'runId', 'phaseId', 'changeId', 'taskId'])
        text(kbd[key], `kbd.${key}`);
    const matching = state.tasks.some(task => task.kbd && canonical(task.kbd) === canonical(kbd));
    if (!matching)
        throw new Error('KBD provenance must exactly reference a linked team task; canonical validation is separate');
}
const KINDS = ['lesson', 'gotcha', 'decision', 'progress', 'candidate'];
const AUTHOR_HARNESSES = ['claude-code', 'codex', 'opencode', 'kimi', 'other'];
function routeScope(state, scope) {
    const role = /^(?:role|agent):(.+)$/.exec(scope);
    if (role) {
        if (!state.team.roles.some(item => item.id === role[1]))
            throw new Error('memory scope must name a role in this team');
        return { visibility: 'agent', roleId: role[1], agentId: `${state.team.id}/${role[1]}` };
    }
    if (scope === 'lead')
        return { visibility: 'lead', agentId: `${state.team.id}/@lead` };
    if (scope === 'team' || scope.startsWith('team:'))
        return { visibility: 'team', agentId: `${state.team.id}/@team` };
    if (scope === 'project' || scope.startsWith('project:'))
        return { visibility: 'project', agentId: '@project' };
    throw new Error('memory.scope must be role:<role>, agent:<role>, lead, team[:<id>] or project[:<id>]');
}
function authorHarness(value) {
    if (value === 'claude')
        return 'claude-code';
    return AUTHOR_HARNESSES.includes(value) ? value : 'other';
}
function optionalAuthor(value) {
    if (value === undefined)
        return undefined;
    const author = object(value, 'memory.author');
    const out = {};
    for (const key of Object.keys(author))
        if (!['harness', 'agentId', 'agentType', 'sessionId'].includes(key))
            throw new Error('unsupported memory.author field');
    if (author.harness !== undefined)
        out.harness = authorHarness(text(author.harness, 'memory.author.harness'));
    for (const key of ['agentId', 'agentType', 'sessionId'])
        if (author[key] !== undefined)
            out[key] = text(author[key], `memory.author.${key}`);
    return out;
}
function scopedProject(value) {
    const id = text(value, 'memory.projectId');
    if (id.startsWith('@'))
        throw new Error('memory.projectId must name a project, not a shared user/global namespace');
    assertNoCredentials(id);
    return id;
}
/** Resolve only explicit identity or selected project context, never the runtime's process cwd. */
function projectId(input, provenance, context) {
    const linked = provenance.kbd === undefined ? undefined : object(provenance.kbd, 'provenance.kbd').projectId;
    const ids = [input.projectId, context.projectId, linked].filter(value => value !== undefined).map(scopedProject);
    if (new Set(ids).size > 1)
        throw new Error('memory project id conflicts with explicit or linked project identity');
    if (ids.length)
        return ids[0];
    const selected = context.project ?? context.cwd;
    if (selected === undefined)
        return undefined;
    let root = realpathSync(path.resolve(text(selected, 'memory project context')));
    if (!statSync(root).isDirectory())
        throw new Error('memory project context must be a directory');
    for (;;) {
        const marker = readFile(projectFile(root, '.prometheus/project.json'));
        if (marker !== null) {
            const record = object(JSON.parse(marker.replace(/^\uFEFF/, '')), 'project.json');
            return record.projectId === undefined ? undefined : scopedProject(record.projectId);
        }
        // An explicit project is a root. Only an explicitly supplied cwd discovers
        // its containing project, using the mini's .prometheus/project.json marker.
        if (context.project !== undefined)
            return undefined;
        const parent = path.dirname(root);
        if (parent === root)
            return undefined;
        root = parent;
    }
}
function unavailable(entry, reason) {
    const previous = entry.receipt && typeof entry.receipt === 'object' && !Array.isArray(entry.receipt) ? entry.receipt : {};
    entry.receipt = { ...previous, at: new Date().toISOString(), outcome: 'unavailable', reason, uncertain: previous.uncertain === true };
    return { id: entry.id, status: 'queued', receipt: entry.receipt };
}
/** Caller commits this mutation atomically before offering the entry for publication. */
export function queueMemory(state, input, context = {}) {
    assertNoCredentials(input);
    const content = text(input.content, 'memory.content');
    const scope = text(input.scope, 'memory.scope');
    const supplied = input.provenance === undefined ? {} : object(input.provenance, 'memory.provenance');
    reference(state, supplied);
    const route = routeScope(state, scope);
    const resolvedProject = projectId(input, supplied, context);
    const kind = input.kind === undefined ? undefined : text(input.kind, 'memory.kind');
    if (kind !== undefined && !KINDS.includes(kind))
        throw new Error('unsupported memory.kind');
    const roleId = input.roleId === undefined ? undefined : text(input.roleId, 'memory.roleId');
    if (roleId !== undefined && (!state.team.roles.some(role => role.id === roleId) || (route.roleId !== undefined && roleId !== route.roleId)))
        throw new Error('memory.roleId must match a role in this team and its scope');
    const author = optionalAuthor(input.author);
    const provenance = { ...supplied, teamId: state.team.id, source: 'agent-team-runtime', authority: 'local-team-record; KBD references are unverified mirrors' };
    const identity = digest({ content, scope, provenance });
    const id = input.id === undefined ? `memory-${identity.slice(0, 48)}` : text(input.id, 'memory.id');
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(id))
        throw new Error('memory.id must be a portable lowercase identifier');
    const existing = state.outbox.find(entry => entry.id === id);
    if (existing) {
        if (digest({ content: existing.content, scope: existing.scope, provenance: existing.provenance }) !== identity)
            throw new Error('memory id conflicts with different content, scope or provenance');
        if (resolvedProject !== undefined && existing.projectId !== undefined && resolvedProject !== existing.projectId)
            throw new Error('memory id conflicts with a different project id');
        // Old queued entries can acquire project identity before their first
        // attempt; never change the body of a recorded or published attempt.
        if (existing.status === 'queued' && existing.projectId === undefined && resolvedProject !== undefined) {
            const receipt = existing.receipt && typeof existing.receipt === 'object' && !Array.isArray(existing.receipt) ? existing.receipt : {};
            if (receipt.publicationKey === undefined && receipt.uncertain !== true)
                existing.projectId = resolvedProject;
        }
        return existing;
    }
    const entry = { id, content, scope, provenance, status: 'queued', ts: new Date().toISOString() };
    if (resolvedProject !== undefined)
        entry.projectId = resolvedProject;
    if (kind !== undefined)
        entry.kind = kind;
    if (roleId !== undefined)
        entry.roleId = roleId;
    if (author !== undefined)
        entry.author = author;
    if (resolvedProject === undefined)
        unavailable(entry, 'missing_project_id');
    state.outbox.push(entry);
    return entry;
}
function field(value, label) {
    const key = text(value, label);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw new Error('mapping fields must be safe top-level JSON property names');
    return key;
}
function publication(state, entry, input) {
    if (input.provider === 'surreal-memory') {
        const scope = object(input.scopeMapping, 'scopeMapping');
        if (scope.scope !== entry.scope)
            throw new Error('scopeMapping.scope must match the queued scope exactly');
        const route = routeScope(state, entry.scope);
        const userId = scopedProject(entry.projectId);
        if (scope.userId !== undefined && text(scope.userId, 'scopeMapping.userId') !== userId)
            throw new Error('scopeMapping.userId must match the resolved project id');
        const writer = scope.agentId === undefined ? undefined : text(scope.agentId, 'scopeMapping.agentId');
        const author = { harness: authorHarness(state.team.harness), ...(optionalAuthor(entry.author) ?? {}) };
        if (author.agentId === undefined && writer !== undefined)
            author.agentId = writer;
        if (author.sessionId === undefined && scope.sessionId !== undefined)
            author.sessionId = text(scope.sessionId, 'scopeMapping.sessionId');
        const hash = createHash('sha256').update(entry.content.normalize('NFC').trim().replace(/\s+/g, ' ')).digest('hex');
        const roleId = route.roleId ?? entry.roleId;
        if (roleId !== undefined && !state.team.roles.some(role => role.id === roleId))
            throw new Error('memory.roleId no longer belongs to this team');
        const kind = entry.kind ?? (route.visibility === 'lead' ? 'progress' : 'lesson');
        if (!KINDS.includes(kind))
            throw new Error('unsupported stored memory.kind');
        const envelope = { schemaVersion: 1, projectId: userId, teamId: state.team.id };
        if (roleId !== undefined)
            envelope.roleId = roleId;
        Object.assign(envelope, { visibility: route.visibility, kind, author, contentHash: hash, ts: entry.ts ?? new Date(0).toISOString() });
        const categories = ['env:1', `vis:${route.visibility}`, `kind:${kind}`, `h:${hash.slice(0, 16)}`];
        if (roleId !== undefined)
            categories.push(`author:${state.team.id}/${roleId}`);
        // AddMemoryRequest has no metadata/idempotency fields: preserve lesson text
        // and attach the full client's learning-envelope trailer, not legacy JSON.
        const content = `${entry.content}\n\n<!-- prometheus-envelope ${JSON.stringify(envelope)} -->`;
        return {
            body: { content, agent_id: route.agentId, user_id: userId, session_id: author.sessionId ?? null, categories },
            headers: {}, remoteIdField: 'id', method: 'POST',
            contract: { provider: 'surreal-memory', source: 'https://github.com/Prometheus-AGS/surreal-memory-server/blob/dd7fdcd6d8974af4059d1d51401bd33ae29f65db/src/contracts.rs',
                route: 'POST /api/v1/memory', envelope: 'shared/schemas/learning-envelope.schema.json (content trailer)',
                scopeBinding: 'design-table agent_id and project user_id filters; not an authorization guarantee', remoteIdempotency: 'unsupported-by-verified-contract' },
        };
    }
    if (input.provider !== 'mapped-http')
        throw new Error('memory provider must be surreal-memory or mapped-http');
    const mapping = object(input.mapping, 'mapping');
    const source = text(mapping.source, 'mapping.source');
    const version = text(mapping.version, 'mapping.version');
    const method = mapping.method ?? 'POST';
    if (method !== 'POST' && method !== 'PUT')
        throw new Error('mapping.method must be POST or PUT');
    const body = mapping.constants === undefined ? {} : { ...object(mapping.constants, 'mapping.constants') };
    const fields = [
        [field(mapping.contentField, 'mapping.contentField'), entry.content],
        [field(mapping.scopeField, 'mapping.scopeField'), entry.scope],
        [field(mapping.provenanceField, 'mapping.provenanceField'), entry.provenance],
    ];
    if (mapping.idempotencyField !== undefined)
        fields.push([field(mapping.idempotencyField, 'mapping.idempotencyField'), entry.id]);
    const seen = new Set();
    for (const [key, value] of fields) {
        if (seen.has(key) || Object.hasOwn(body, key))
            throw new Error('memory mapping fields collide');
        seen.add(key);
        body[key] = value;
    }
    const headers = {};
    if (mapping.idempotencyHeader !== undefined) {
        const header = text(mapping.idempotencyHeader, 'mapping.idempotencyHeader');
        if (!/^(?:Idempotency-Key|X-Idempotency-Key)$/i.test(header))
            throw new Error('unsupported idempotency header mapping');
        headers[header] = entry.id;
    }
    return { body, headers, method, remoteIdField: field(mapping.responseIdField, 'mapping.responseIdField'),
        contract: { provider: 'mapped-http', source, version, scopeBinding: 'operator-configured mapping; server authorization unverified',
            remoteIdempotency: mapping.idempotencyHeader || mapping.idempotencyField ? 'operator-mapped; server guarantee unverified' : 'not-configured' } };
}
/** Only an already-queued entry is eligible. Caller persists success AND failure receipts. */
export async function publishMemory(state, input, context = {}) {
    assertNoCredentials(input);
    const id = text(input.id, 'memory.id');
    const entry = state.outbox.find(item => item.id === id);
    if (!entry)
        throw new Error('queue and persist memory before publication');
    if (entry.status === 'published')
        return { id, status: 'published', receipt: entry.receipt ?? null, repeated: true };
    const previous = entry.receipt && typeof entry.receipt === 'object' && !Array.isArray(entry.receipt) ? entry.receipt : {};
    if (previous.uncertain === true && input.retryUncertain !== true) {
        return { id, status: 'queued', receipt: previous, reason: 'remote outcome uncertain; reconcile before explicitly setting retryUncertain' };
    }
    const selectedProject = projectId(input, entry.provenance, context);
    if (entry.projectId !== undefined && selectedProject !== undefined && entry.projectId !== selectedProject)
        throw new Error('publication project id conflicts with queued project identity');
    const resolvedProject = entry.projectId === undefined ? selectedProject : scopedProject(entry.projectId);
    if (resolvedProject === undefined)
        return unavailable(entry, 'missing_project_id');
    entry.projectId = resolvedProject;
    if (input.url === undefined) {
        return unavailable(entry, 'no memory endpoint configured');
    }
    const url = endpoint(input.url);
    if (input.provider === 'surreal-memory') {
        if (!/\/api\/v1\/memory\/?$/.test(url.pathname))
            throw new Error('surreal-memory url must name the verified /api/v1/memory route');
        url.pathname = url.pathname.replace(/\/$/, '');
    }
    const request = publication(state, entry, input);
    assertNoCredentials(request.body);
    const target = { url: url.href, contract: request.contract };
    const publicationKey = digest({ id, content: entry.content, scope: entry.scope, provenance: entry.provenance, target, body: request.body });
    if (previous.publicationKey !== undefined && previous.publicationKey !== publicationKey)
        throw new Error('retry destination or mapping differs from recorded attempt');
    const receipt = { at: new Date().toISOString(), publicationKey, contentSha256: digest(entry.content), target, localIdempotencyKey: id,
        exactlyOnce: false, uncertaintyNote: 'A crash after remote commit and before local receipt can duplicate a retry; reconcile remotely.' };
    try {
        const response = await requestJson(url, input, request.method, request.body, request.headers);
        const payload = object(response.value, 'memory response');
        const remoteId = payload[request.remoteIdField];
        if (remoteId === undefined || remoteId === null)
            throw new RequestFailure('remote_response_missing_id', true, response.status);
        assertNoCredentials(remoteId);
        entry.receipt = { ...receipt, outcome: 'published', httpStatus: response.status, remoteId, uncertain: false };
        entry.status = 'published';
        return { id, status: 'published', receipt: entry.receipt };
    }
    catch (error) {
        // Invalid configuration fails before I/O; transport and response failures
        // remain durable retryable outbox records without logging remote content.
        if (!(error instanceof RequestFailure)) {
            entry.receipt = { ...receipt, outcome: 'unavailable', reason: 'unsafe_or_unsupported_remote_response', uncertain: true };
        }
        else {
            entry.receipt = { ...receipt, outcome: 'unavailable', reason: error.code, httpStatus: error.httpStatus, uncertain: error.uncertain };
        }
        return { id, status: 'queued', receipt: entry.receipt };
    }
}
