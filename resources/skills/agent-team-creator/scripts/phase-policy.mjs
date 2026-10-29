import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
/** Prompt references are instructions only; no permission or model compliance is implied. */
export function phasePolicyPrompt(inputs = []) {
    const references = inputs.filter(input => /(?:method-context|adopted-contract|calibration|supersession)/i.test(input));
    return 'Phase policy: before dependent work resolve the active phase method-context.md and adopted contract from current signed KBD status/decisions. ' +
        `Selected role input references: ${JSON.stringify(references)}. ` +
        'Missing/stale references are explicit prerequisites, never guessed from memory, tool inventory or exactNextCommand. Recover selected method, current contract revision/digest, included value, exclusions and stage authority. ' +
        'For selected VLBV finish the complete agreed value phase before generated-code tests/builds/imports/lint/typecheck/hooks/probes used as verification; task/hour/commit/reviewer requests and compiler problems are not boundaries. ' +
        'Scenario definition precedes generation; executable authoring follows governing host policy. Surface policy conflicts without rewriting operator-owned rules. ' +
        'Retain latest authorized supersession, original evidence, candidate freshness, consumed budgets and unresolved effects; reconcile uncertain effects before retry. ' +
        'This export is instruction-only; existing named runtime mutations/native host permissions retain their authority. No automatic successor or release authority.';
}
export const rolePhasePolicyPrompt = (role) => phasePolicyPrompt(role.inputs);
/** Select only project-owned policy references for existing file-provenance fields. */
export function phasePolicyReferences(cwd, phaseId) {
    if (!phaseId)
        return [];
    const root = realpathSync(cwd);
    const components = phaseId.split('::');
    if (components.some(part => !/^[a-z0-9][a-z0-9._-]*$/.test(part) || part.includes('..')))
        return [];
    const directory = ['.kbd-orchestrator', 'phases', ...components.flatMap((part, index) => index ? ['children', part] : [part])].join('/');
    const owned = (path) => {
        const target = resolve(root, path);
        if (target !== root && !target.startsWith(root + sep))
            return false;
        return !existsSync(target) || realpathSync(target).startsWith(root + sep);
    };
    const refs = [`${directory}/method-context.md`, `${directory}/method-context.json`, `${directory}/adopted-contract.json`];
    const index = resolve(root, refs[1]);
    if (owned(refs[1]) && existsSync(index)) {
        try {
            const value = JSON.parse(readFileSync(index, 'utf8'));
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const selected = value;
                if (selected.phaseId === phaseId && Array.isArray(selected.references))
                    for (const item of selected.references) {
                        if (item && typeof item === 'object' && typeof item.path === 'string') {
                            const path = item.path;
                            if (owned(path))
                                refs.push(relative(root, resolve(root, path)));
                        }
                    }
            }
        }
        catch { /* The missing/unparseable index remains an explicit hashed provenance reference. */ }
    }
    return [...new Set(refs.filter(owned))];
}
