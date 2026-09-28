import { object, text } from './validation.mjs';
import { compileUarBinding, loadUarPackage } from './uar-package.mjs';
const ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/;
function connection(value) {
    const input = object(value, 'connection');
    const url = new URL(text(input.baseUrl, 'connection.baseUrl'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('connection.baseUrl must be an HTTP(S) origin/path without embedded credentials, query, or fragment');
    }
    const credentialRef = input.credentialRef === undefined ? undefined : text(input.credentialRef, 'connection.credentialRef');
    if (credentialRef !== undefined && !ENV_REF.test(credentialRef)) {
        throw new Error('credentialRef must use env:VARIABLE; secret values are never accepted or persisted');
    }
    return { baseUrl: url.toString().replace(/\/$/, ''), credentialRef };
}
function headers(value, extra = {}) {
    const result = { Accept: 'application/json', 'Content-Type': 'application/json', ...extra };
    if (!value.credentialRef)
        return result;
    const name = ENV_REF.exec(value.credentialRef)[1];
    const secret = process.env[name];
    if (!secret)
        throw new Error(`Credential environment variable is unavailable: ${name}`);
    result.Authorization = `Bearer ${secret}`;
    return result;
}
async function request(connectionValue, method, route, body, extraHeaders = {}) {
    const target = connection(connectionValue);
    const response = await fetch(`${target.baseUrl}${route}`, {
        method,
        headers: headers(target, extraHeaders),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = null;
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('application/json'))
        payload = await response.json();
    if (!response.ok) {
        const envelope = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
        const error = envelope.error && typeof envelope.error === 'object' && !Array.isArray(envelope.error)
            ? envelope.error : {};
        const key = typeof error.messageKey === 'string' ? error.messageKey : 'uar.request.failed';
        const code = typeof error.code === 'string' ? error.code : 'unknown';
        const detail = error.detail === undefined ? '' : `: ${typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail)}`;
        throw new Error(`UAR request failed (${response.status}, ${key}, ${code})${detail}`);
    }
    return payload;
}
function catalogOnly(operation, response) {
    return {
        operation,
        response: response,
        catalogOnly: true,
        activation: {
            supported: false,
            reason: 'Team activation is unavailable until the durable local-team I2 runtime is implemented.',
            nextPhase: 'I2',
        },
    };
}
function command(value) {
    const commandId = text(value.commandId, 'commandId');
    const result = { commandId };
    if (value.expectedCatalogRevision !== undefined) {
        if (!Number.isSafeInteger(value.expectedCatalogRevision) || Number(value.expectedCatalogRevision) < 0) {
            throw new Error('expectedCatalogRevision must be a nonnegative safe integer');
        }
        result.expectedCatalogRevision = value.expectedCatalogRevision;
    }
    return result;
}
export async function uarCapabilities(input) {
    return request(input.connection, 'GET', '/api/v1/collaboration/capabilities');
}
export async function uarPackagePreflight(input) {
    const compiled = loadUarPackage(input.packageDirectory);
    const response = await request(input.connection, 'POST', '/api/v1/collaboration/packages:preflight', {
        ...command(input), manifest: compiled.manifestUtf8,
        files: Object.fromEntries(compiled.files.map(file => [file.path, file.contentUtf8])),
    });
    return catalogOnly('package-preflight', response);
}
export async function uarPackageInstall(input) {
    const compiled = loadUarPackage(input.packageDirectory);
    const response = await request(input.connection, 'POST', '/api/v1/collaboration/packages:install', {
        ...command(input), manifest: compiled.manifestUtf8,
        files: Object.fromEntries(compiled.files.map(file => [file.path, file.contentUtf8])),
    });
    return catalogOnly('package-install', response);
}
export async function uarPackageStatus(input) {
    const id = encodeURIComponent(text(input.packageId, 'packageId'));
    const version = encodeURIComponent(text(input.version, 'version'));
    const response = await request(input.connection, 'GET', `/api/v1/collaboration/packages/${id}/versions/${version}`);
    return catalogOnly('package-status', response);
}
function bindingRequest(input) {
    const binding = compileUarBinding(input.binding);
    const result = {
        commandId: text(input.commandId, 'commandId'),
        binding,
    };
    if (input.expectedRevision !== undefined) {
        if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) {
            throw new Error('expectedRevision must be a nonnegative safe integer');
        }
        result.expectedRevision = input.expectedRevision;
    }
    return { body: result, workspaceId: text(binding.workspaceId, 'binding.workspaceId') };
}
export async function uarBindingPreflight(input) {
    const { body, workspaceId } = bindingRequest(input);
    const response = await request(input.connection, 'POST', '/api/v1/collaboration/deployment-bindings:preflight', body, { 'x-uar-workspace-id': workspaceId });
    return catalogOnly('binding-preflight', response);
}
export async function uarBindingInstall(input) {
    const { body, workspaceId } = bindingRequest(input);
    const response = await request(input.connection, 'POST', '/api/v1/collaboration/deployment-bindings', body, { 'x-uar-workspace-id': workspaceId });
    return catalogOnly('binding-install', response);
}
export async function uarBindingStatus(input) {
    const id = encodeURIComponent(text(input.bindingId, 'bindingId'));
    const workspaceId = text(input.workspaceId, 'workspaceId');
    const response = await request(input.connection, 'GET', `/api/v1/collaboration/deployment-bindings/${id}`, undefined, { 'x-uar-workspace-id': workspaceId });
    return catalogOnly('binding-status', response);
}
export function refuseUarActivation() {
    throw new Error('UAR team activation is not implemented in I1. Install definitions and an inactive or ready binding, then wait for the durable local-team I2 runtime.');
}
