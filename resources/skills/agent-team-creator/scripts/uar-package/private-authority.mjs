import { pointerSegment } from './canonical.mjs';
const privateKinds = new Set(['DeploymentBinding', 'RepresentationGrant', 'EffectiveBindingReceipt']);
const forbiddenKeys = /^(?:credential|credentialValue|token|secret|password|apiKey|privateKey|consentEvidence(?:Ref)?|representationGrant(?:Ref|Refs)?|effectiveBindingReceiptRef|installedAuthority)$/i;
const recognizedSecret = /(?:^|\b)(?:token|secret|password|api[-_ ]?key)\s*(?:=|:|is)?\s*[A-Za-z0-9_./+:-]{16,}/i;
export function privateAuthorityDiagnostics(value, sourceDocument) {
    const diagnostics = [];
    const walk = (item, pointer) => {
        if (typeof item === 'string' && recognizedSecret.test(item))
            diagnostics.push({
                sourceDocument, sourcePointer: pointer || '/', disposition: 'required-unsupported',
                reason: 'recognized credential or secret material is forbidden in portable content',
            });
        if (Array.isArray(item))
            return item.forEach((child, index) => walk(child, `${pointer}/${index}`));
        if (!item || typeof item !== 'object')
            return;
        if (typeof item.kind === 'string' && privateKinds.has(item.kind))
            diagnostics.push({
                sourceDocument, sourcePointer: `${pointer}/kind`, disposition: 'required-unsupported',
                reason: `${item.kind} is private installed state and cannot enter a portable package`,
            });
        for (const [key, child] of Object.entries(item)) {
            const childPointer = `${pointer}/${pointerSegment(key)}`;
            if (forbiddenKeys.test(key))
                diagnostics.push({
                    sourceDocument, sourcePointer: childPointer, disposition: 'required-unsupported',
                    reason: 'private credential, consent, or authority values are forbidden in portable content',
                });
            else if (key === 'credentialRef' && sourceDocument !== 'deployment-binding')
                diagnostics.push({
                    sourceDocument, sourcePointer: childPointer, disposition: 'required-unsupported',
                    reason: 'credential references belong only in a private deployment binding',
                });
            walk(child, childPointer);
        }
    };
    walk(value, '');
    return diagnostics;
}
export function assertPortable(value, sourceDocument) {
    const diagnostics = privateAuthorityDiagnostics(value, sourceDocument);
    if (diagnostics.length)
        throw new Error(`${diagnostics[0].sourceDocument}${diagnostics[0].sourcePointer}: ${diagnostics[0].reason}`);
}
export function assertOpaqueReference(value, pointer) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(`${pointer} must be a nonempty opaque reference`);
    if (/^(?:bearer|token|secret|password|api[-_]?key):/i.test(value) || recognizedSecret.test(value)) {
        throw new Error(`${pointer} must be an opaque host reference, not a credential value`);
    }
    return value;
}
export function assertBindingContainsReferencesOnly(value) {
    const walk = (item, pointer) => {
        if (typeof item === 'string' && recognizedSecret.test(item))
            throw new Error(`${pointer || '/'} contains recognized credential material`);
        if (Array.isArray(item))
            return item.forEach((child, index) => walk(child, `${pointer}/${index}`));
        if (!item || typeof item !== 'object')
            return;
        for (const [key, child] of Object.entries(item)) {
            const childPointer = `${pointer}/${pointerSegment(key)}`;
            if (/^(?:credential|credentialValue|token|secret|password|apiKey|privateKey|consentEvidence|installedAuthority)$/i.test(key)) {
                throw new Error(`${childPointer} contains a private value; use an opaque reference field`);
            }
            walk(child, childPointer);
        }
    };
    walk(value, '');
}
