import { exportCapabilityNames } from './types.mjs';
/** Describes this staging adapter, never installed harness support or execution authority. */
export function adapterCapabilities(target) {
    const plugin = target === 'claude' || target === 'kimi';
    return {
        'agent-definition': 'emitted',
        'role-model': target === 'kimi' || target === 'deepseek' ? 'not-emitted' : 'emitted',
        'team-options': target === 'kimi' || target === 'minimax' || target === 'copilot' ? 'preserved-only' : 'emitted',
        'agent-plugin': plugin ? 'emitted' : 'not-emitted',
        'agent-marketplace': plugin ? 'emitted' : 'not-emitted',
        'static-team-roster': target === 'bossfang' ? 'emitted' : 'not-emitted',
        'model-policy-resolution': 'not-emitted',
    };
}
/** Required loss fails before staged files are returned; opaque files cannot qualify semantics. */
export function requireAdapterCapabilities(target, required, capabilities) {
    if (required === undefined)
        return;
    if (!Array.isArray(required) || required.some(value => typeof value !== 'string' || !exportCapabilityNames.includes(value))) {
        throw new Error('native.requiredCapabilities must contain known export capability names.');
    }
    const unsupported = required.filter(name => capabilities[name] !== 'emitted');
    if (unsupported.length) {
        throw new Error(`Required export capabilities unavailable for ${target}: ${unsupported.map(name => `${name} (${capabilities[name]})`).join(', ')}. No export was produced.`);
    }
}
