import { createHash } from 'node:crypto';
import { object } from '../validation.mjs';
export const DIGEST = /^sha256:[a-f0-9]{64}$/;
export const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
export function sha256(value) {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
function assertUnicode(value) {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (next < 0xdc00 || next > 0xdfff)
                throw new Error('Canonical JSON refuses an unpaired high surrogate');
            index++;
        }
        else if (code >= 0xdc00 && code <= 0xdfff)
            throw new Error('Canonical JSON refuses an unpaired low surrogate');
    }
}
export function canonical(value) {
    if (value === null || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new Error('Canonical JSON requires finite numbers');
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        assertUnicode(value);
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => {
        assertUnicode(key);
        return `${JSON.stringify(key)}:${canonical(value[key])}`;
    }).join(',')}}`;
}
export function cloneObject(value, label) {
    return structuredClone(object(value, label));
}
export function selfDigest(document) {
    const copy = structuredClone(document);
    delete copy.contentDigest;
    return sha256(canonical(copy));
}
export function pointerSegment(value) {
    return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
export function flatten(value, prefix = '') {
    const result = new Map();
    const walk = (item, current) => {
        if (item && typeof item === 'object') {
            if (Array.isArray(item))
                item.forEach((child, index) => walk(child, `${current}/${index}`));
            else
                Object.keys(item).sort().forEach(key => walk(item[key], `${current}/${pointerSegment(key)}`));
        }
        else
            result.set(current || '/', canonical(item));
    };
    walk(value, prefix);
    return result;
}
