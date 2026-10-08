import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UAR_PROFILE_V2 } from '../types.mjs';
import { canonical, pointerSegment } from './canonical.mjs';
const schemaDirectory = fileURLToPath(new URL('../../schemas/uar/0.1.0-draft.2/', import.meta.url));
const schemaFiles = {
    AgentDefinition: 'agent-definition.schema.json',
    TeamDefinition: 'team-definition.schema.json',
    WorkflowDefinition: 'workflow-definition.schema.json',
    PackageManifest: 'package-manifest.schema.json',
    DeploymentBinding: 'deployment-binding.schema.json',
    ConversionReport: 'conversion-report.schema.json',
};
const cache = new Map();
function schema(file) {
    const found = cache.get(file);
    if (found)
        return found;
    const value = JSON.parse(readFileSync(new URL(`../../schemas/uar/0.1.0-draft.2/${file}`, import.meta.url), 'utf8'));
    cache.set(file, value);
    return value;
}
function resolvePointer(root, fragment) {
    let current = root;
    if (!fragment || fragment === '#')
        return root;
    if (!fragment.startsWith('#/'))
        throw new Error(`Unsupported schema reference fragment: ${fragment}`);
    for (const part of fragment.slice(2).split('/')) {
        const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
        if (!current || typeof current !== 'object' || !(key in current))
            throw new Error(`Unresolved schema reference: ${fragment}`);
        current = current[key];
    }
    if (!current || typeof current !== 'object' || Array.isArray(current))
        throw new Error(`Schema reference is not an object: ${fragment}`);
    return current;
}
function resolveReference(reference, currentFile) {
    const [filePart, fragmentPart] = reference.split('#', 2);
    const file = filePart || currentFile;
    return { file, value: resolvePointer(schema(file), fragmentPart === undefined ? '#' : `#${fragmentPart}`) };
}
function typeMatches(value, type) {
    if (type === 'null')
        return value === null;
    if (type === 'array')
        return Array.isArray(value);
    if (type === 'object')
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer')
        return Number.isSafeInteger(value);
    if (type === 'number')
        return typeof value === 'number' && Number.isFinite(value);
    return typeof value === type;
}
function failure(pointer, message) {
    throw new Error(`Schema validation failed at ${pointer || '/'}: ${message}`);
}
function validateNode(value, rule, file, pointer) {
    if (typeof rule.$ref === 'string') {
        const resolved = resolveReference(rule.$ref, file);
        validateNode(value, resolved.value, resolved.file, pointer);
        return;
    }
    if (Array.isArray(rule.oneOf)) {
        const matches = rule.oneOf.filter(candidate => {
            try {
                validateNode(value, candidate, file, pointer);
                return true;
            }
            catch {
                return false;
            }
        });
        if (matches.length !== 1)
            failure(pointer, `expected exactly one schema branch, observed ${matches.length}`);
        return;
    }
    if ('const' in rule && canonical(value) !== canonical(rule.const))
        failure(pointer, `must equal ${JSON.stringify(rule.const)}`);
    if (Array.isArray(rule.enum) && !rule.enum.some(item => canonical(item) === canonical(value)))
        failure(pointer, 'value is outside the allowed enumeration');
    if (rule.type !== undefined) {
        const types = Array.isArray(rule.type) ? rule.type : [rule.type];
        if (!types.some(type => typeof type === 'string' && typeMatches(value, type)))
            failure(pointer, `expected type ${types.join(' or ')}`);
    }
    if (typeof value === 'string') {
        if (typeof rule.minLength === 'number' && value.length < rule.minLength)
            failure(pointer, `must contain at least ${rule.minLength} characters`);
        if (typeof rule.maxLength === 'number' && [...value].length > rule.maxLength)
            failure(pointer, `must contain at most ${rule.maxLength} characters`);
        if (typeof rule.pattern === 'string' && !new RegExp(rule.pattern, 'u').test(value))
            failure(pointer, `does not match ${rule.pattern}`);
        if (rule.format === 'uri') {
            try {
                new URL(value);
            }
            catch {
                failure(pointer, 'must be a URI');
            }
        }
        if (rule.format === 'uri-reference') {
            try {
                new URL(value, 'https://schemas.prometheus-ags.dev/');
            }
            catch {
                failure(pointer, 'must be a URI reference');
            }
        }
        if (rule.format === 'date-time' && !Number.isFinite(Date.parse(value)))
            failure(pointer, 'must be an RFC 3339 date-time');
    }
    if (typeof value === 'number') {
        if (typeof rule.minimum === 'number' && value < rule.minimum)
            failure(pointer, `must be at least ${rule.minimum}`);
        if (typeof rule.maximum === 'number' && value > rule.maximum)
            failure(pointer, `must be at most ${rule.maximum}`);
    }
    if (Array.isArray(value)) {
        if (typeof rule.minItems === 'number' && value.length < rule.minItems)
            failure(pointer, `must contain at least ${rule.minItems} items`);
        if (typeof rule.maxItems === 'number' && value.length > rule.maxItems)
            failure(pointer, `must contain at most ${rule.maxItems} items`);
        if (rule.uniqueItems === true) {
            const keys = value.map(item => canonical(item));
            if (new Set(keys).size !== keys.length)
                failure(pointer, 'items must be unique');
        }
        if (rule.items && typeof rule.items === 'object')
            value.forEach((item, index) => validateNode(item, rule.items, file, `${pointer}/${index}`));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value;
        const properties = rule.properties && typeof rule.properties === 'object' ? rule.properties : {};
        if (Array.isArray(rule.required))
            for (const key of rule.required) {
                if (typeof key === 'string' && !(key in record))
                    failure(`${pointer}/${pointerSegment(key)}`, 'required property is missing');
            }
        for (const [key, child] of Object.entries(record)) {
            const childPointer = `${pointer}/${pointerSegment(key)}`;
            if (properties[key])
                validateNode(child, properties[key], file, childPointer);
            else if (rule.additionalProperties === false)
                failure(childPointer, 'additional property is forbidden');
            else if (rule.additionalProperties && typeof rule.additionalProperties === 'object')
                validateNode(child, rule.additionalProperties, file, childPointer);
            if (rule.propertyNames && typeof rule.propertyNames === 'object')
                validateNode(key, rule.propertyNames, file, childPointer);
        }
    }
}
export function validateProfileDocument(value) {
    if (value.profile !== UAR_PROFILE_V2)
        throw new Error(`profile must be ${UAR_PROFILE_V2}`);
    const kind = String(value.kind ?? '');
    const file = schemaFiles[kind];
    if (!file)
        throw new Error(`Unsupported draft.2 document kind: ${kind}`);
    validateNode(value, schema(file), file, '');
}
export function profileSchemaInfo() {
    const receipt = JSON.parse(readFileSync(new URL('../../schemas/uar/0.1.0-draft.2/consumer-source-receipt.json', import.meta.url), 'utf8'));
    return {
        profile: UAR_PROFILE_V2,
        sourceRevision: receipt.provider.commit,
        directory: schemaDirectory,
        documents: structuredClone(schemaFiles),
    };
}
