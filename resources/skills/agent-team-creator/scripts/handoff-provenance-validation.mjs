import { assertNoCredentials } from './models-http.mjs';
import { integer, object, text } from './state-validation.mjs';
function fields(value, allowed, label) {
    const record = object(value, label);
    if (Object.keys(record).some(key => !allowed.includes(key)))
        throw new Error(label + ' has unsupported fields');
    return record;
}
function nullableText(value, label) {
    if (value !== null)
        text(value, label);
}
function hash(value, label, nullable = true) {
    if (nullable && value === null)
        return;
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value))
        throw new Error(label + ' must be a SHA-256 identity');
}
function identity(value) {
    if (value === null)
        return;
    const keys = ['projectId', 'runId', 'phaseId', 'changeId', 'taskId'];
    const record = fields(value, keys, 'handoff canonical identity');
    for (const key of keys)
        text(record[key], 'handoff canonical identity.' + key);
}
function array(value, label) {
    if (!Array.isArray(value))
        throw new Error(label + ' must be an array');
    return value;
}
function observed(value, allowed) {
    if (!allowed.includes(String(value)))
        throw new Error('Unsupported handoff observation');
}
/** Validate the versioned metadata boundary; opaque source/receipt bodies are forbidden. */
export function validateProvenance(value) {
    assertNoCredentials(value);
    const record = fields(value, ['schemaVersion', 'capturedAt', 'canonical', 'sources', 'evidence', 'karpathy', 'memory'], 'handoff.provenance');
    if (record.schemaVersion !== 1)
        throw new Error('Unsupported handoff provenance schemaVersion');
    if (!Number.isFinite(Date.parse(text(record.capturedAt, 'handoff provenance capturedAt'))))
        throw new Error('Invalid handoff capture timestamp');
    const canonical = fields(record.canonical, ['path', 'identity', 'observation', 'revision', 'eventId', 'taskStatus', 'receiptSha256', 'reason'], 'handoff canonical observation');
    text(canonical.path, 'handoff canonical path');
    identity(canonical.identity);
    observed(canonical.observation, ['observed', 'unknown']);
    if (canonical.revision !== null)
        integer(canonical.revision, 'handoff canonical revision');
    for (const key of ['eventId', 'taskStatus', 'reason'])
        nullableText(canonical[key], 'handoff canonical.' + key);
    hash(canonical.receiptSha256, 'handoff canonical receiptSha256');
    if (canonical.observation === 'observed' && (canonical.identity === null || canonical.revision === null || canonical.taskStatus === null || canonical.receiptSha256 === null || canonical.reason !== null)) {
        throw new Error('Observed canonical handoff requires identity and status receipt');
    }
    for (const group of ['sources', 'evidence', 'karpathy'])
        for (const item of array(record[group], 'handoff.' + group)) {
            const file = fields(item, ['path', 'observation', 'bytes', 'sha256'], 'handoff selected file');
            text(file.path, 'handoff selected path');
            observed(file.observation, ['observed', 'missing', 'unknown']);
            if (file.bytes !== null)
                integer(file.bytes, 'handoff selected bytes');
            hash(file.sha256, 'handoff selected sha256');
            if (file.observation === 'observed' && (file.bytes === null || file.sha256 === null))
                throw new Error('Observed file requires byte length and hash');
            if (file.observation !== 'observed' && (file.bytes !== null || file.sha256 !== null))
                throw new Error('Unobserved file cannot claim a hash');
        }
    for (const item of array(record.memory, 'handoff.memory')) {
        const memory = fields(item, ['id', 'status', 'observation', 'projectId', 'teamId', 'scope', 'contentSha256', 'provenanceSha256', 'kbd', 'publication'], 'handoff memory identity');
        text(memory.id, 'handoff memory id');
        text(memory.teamId, 'handoff memory teamId');
        if (memory.status !== null && !['queued', 'published'].includes(String(memory.status)))
            throw new Error('Invalid handoff memory status');
        observed(memory.observation, ['observed', 'unknown']);
        nullableText(memory.projectId, 'handoff memory projectId');
        nullableText(memory.scope, 'handoff memory scope');
        hash(memory.contentSha256, 'handoff memory contentSha256');
        hash(memory.provenanceSha256, 'handoff memory provenanceSha256');
        identity(memory.kbd);
        if (memory.observation === 'observed' && (memory.status === null || memory.scope === null || memory.contentSha256 === null || memory.provenanceSha256 === null))
            throw new Error('Observed memory requires scoped record identity');
        if (memory.publication !== null) {
            const receipt = fields(memory.publication, ['outcome', 'publicationKey', 'remoteIdSha256', 'receiptSha256', 'uncertain'], 'handoff publication identity');
            nullableText(receipt.outcome, 'handoff publication outcome');
            hash(receipt.publicationKey, 'handoff publication key');
            hash(receipt.remoteIdSha256, 'handoff publication remoteIdSha256');
            hash(receipt.receiptSha256, 'handoff publication receiptSha256', false);
            if (receipt.uncertain !== null && typeof receipt.uncertain !== 'boolean')
                throw new Error('Invalid handoff publication uncertainty');
        }
    }
}
