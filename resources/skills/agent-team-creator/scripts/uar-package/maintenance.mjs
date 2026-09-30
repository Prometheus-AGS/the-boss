import { object, text } from '../validation.mjs';
import { flatten } from './canonical.mjs';
import { compileUarPackage } from './compiler.mjs';
import { loadUarPackage } from './package-files.mjs';
function identity(document) {
    return `${text(document.kind, 'kind')}:${text(document.id, 'id')}`;
}
function compare(before, after) {
    const beforeId = text(before.manifest.id, 'before manifest id'), afterId = text(after.manifest.id, 'after manifest id');
    if (beforeId !== afterId)
        throw new Error('Package maintenance cannot change package identity');
    const beforeDocuments = new Map(before.files.map(file => {
        const document = object(JSON.parse(file.contentUtf8), file.path);
        return [identity(document), { path: file.path, document }];
    }));
    const afterDocuments = new Map(after.files.map(file => {
        const document = object(JSON.parse(file.contentUtf8), file.path);
        return [identity(document), { path: file.path, document }];
    }));
    const added = [...afterDocuments.keys()].filter(key => !beforeDocuments.has(key)).sort();
    const removed = [...beforeDocuments.keys()].filter(key => !afterDocuments.has(key)).sort();
    const changed = [];
    for (const key of [...beforeDocuments.keys()].filter(item => afterDocuments.has(item)).sort()) {
        const leftDocument = beforeDocuments.get(key), rightDocument = afterDocuments.get(key);
        const left = flatten(leftDocument.document), right = flatten(rightDocument.document);
        const pointers = [...new Set([...left.keys(), ...right.keys()])].filter(pointer => left.get(pointer) !== right.get(pointer)).sort();
        if (pointers.length)
            changed.push({ identity: key, beforePath: leftDocument.path, afterPath: rightDocument.path, pointers });
    }
    const sameVersion = before.manifest.version === after.manifest.version;
    if (sameVersion && before.manifest.contentDigest !== after.manifest.contentDigest)
        throw new Error('Changed immutable package content requires a new semantic version');
    return {
        packageId: beforeId, fromVersion: before.manifest.version, toVersion: after.manifest.version,
        added, removed, changed, unchanged: before.manifest.contentDigest === after.manifest.contentDigest,
    };
}
export function diffUarPackages(beforeValue, afterValue) {
    return compare(compileUarPackage(beforeValue), compileUarPackage(afterValue));
}
export function diffUarDirectories(beforeDirectory, afterDirectory) {
    return compare(loadUarPackage(beforeDirectory), loadUarPackage(afterDirectory));
}
