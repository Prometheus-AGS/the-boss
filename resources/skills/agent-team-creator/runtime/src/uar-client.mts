import type { ObjectValue, UarConnection } from './types.mjs';
import { object, text } from './validation.mjs';
import { compileUarBinding, loadUarPackage } from './uar-package.mjs';

const ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/;

function connection(value: unknown): UarConnection {
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

function headers(value: UarConnection, extra: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json', ...extra };
  if (!value.credentialRef) return result;
  const name = ENV_REF.exec(value.credentialRef)![1];
  const secret = process.env[name];
  if (!secret) throw new Error(`Credential environment variable is unavailable: ${name}`);
  result.Authorization = `Bearer ${secret}`;
  return result;
}

async function request(connectionValue: unknown, method: 'GET' | 'POST', route: string, body?: ObjectValue, extraHeaders: Record<string, string> = {}): Promise<unknown> {
  const target = connection(connectionValue);
  const response = await fetch(`${target.baseUrl}${route}`, {
    method,
    headers: headers(target, extraHeaders),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: unknown = null;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) payload = await response.json();
  if (!response.ok) {
    const envelope = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    const error = envelope.error && typeof envelope.error === 'object' && !Array.isArray(envelope.error)
      ? envelope.error as Record<string, unknown> : {};
    const key = typeof error.messageKey === 'string' ? error.messageKey : 'uar.request.failed';
    const code = typeof error.code === 'string' ? error.code : 'unknown';
    const detail = error.detail === undefined ? '' : `: ${typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail)}`;
    throw new Error(`UAR request failed (${response.status}, ${key}, ${code})${detail}`);
  }
  return payload;
}

function collaborationBoundary(operation: string, response: unknown, binding = false): ObjectValue {
  return {
    operation,
    response: response as never,
    profile: 'urn:prometheus:uar:collaboration:0.1.0-draft.2',
    catalogOnly: !binding,
    authority: {
      conferredByPackageInstallation: false,
      privateBindingEvaluatedByUar: binding,
    },
    activation: {
      supported: false,
      reason: 'This authoring client installs definitions and private bindings; runtime activation belongs to the selected UAR instance and its negotiated execution profile.',
    },
  };
}

function command(value: ObjectValue): ObjectValue {
  const commandId = text(value.commandId, 'commandId');
  const result: ObjectValue = { commandId };
  if (value.expectedCatalogRevision !== undefined) {
    if (!Number.isSafeInteger(value.expectedCatalogRevision) || Number(value.expectedCatalogRevision) < 0) {
      throw new Error('expectedCatalogRevision must be a nonnegative safe integer');
    }
    result.expectedCatalogRevision = value.expectedCatalogRevision;
  }
  return result;
}

export async function uarCapabilities(input: ObjectValue): Promise<unknown> {
  return request(input.connection, 'GET', '/api/v1/collaboration/capabilities');
}

export async function uarPackagePreflight(input: ObjectValue): Promise<ObjectValue> {
  const compiled = loadUarPackage(input.packageDirectory);
  const response = await request(input.connection, 'POST', '/api/v1/collaboration/packages:preflight', {
    ...command(input), manifest: compiled.manifestUtf8,
    files: Object.fromEntries(compiled.files.map(file => [file.path, file.contentUtf8])),
  });
  return collaborationBoundary('package-preflight', response);
}

export async function uarPackageInstall(input: ObjectValue): Promise<ObjectValue> {
  const compiled = loadUarPackage(input.packageDirectory);
  const response = await request(input.connection, 'POST', '/api/v1/collaboration/packages:install', {
    ...command(input), manifest: compiled.manifestUtf8,
    files: Object.fromEntries(compiled.files.map(file => [file.path, file.contentUtf8])),
  });
  return collaborationBoundary('package-install', response);
}

export async function uarPackageStatus(input: ObjectValue): Promise<ObjectValue> {
  const id = encodeURIComponent(text(input.packageId, 'packageId'));
  const version = encodeURIComponent(text(input.version, 'version'));
  const response = await request(input.connection, 'GET', `/api/v1/collaboration/packages/${id}/versions/${version}`);
  return collaborationBoundary('package-status', response);
}

function bindingRequest(input: ObjectValue): { body: ObjectValue; workspaceId: string } {
  const binding = compileUarBinding(input.binding);
  const result: ObjectValue = {
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

export async function uarBindingPreflight(input: ObjectValue): Promise<ObjectValue> {
  const { body, workspaceId } = bindingRequest(input);
  const response = await request(input.connection, 'POST', '/api/v1/collaboration/deployment-bindings:preflight', body, { 'x-uar-workspace-id': workspaceId });
  return collaborationBoundary('binding-preflight', response, true);
}

export async function uarBindingInstall(input: ObjectValue): Promise<ObjectValue> {
  const { body, workspaceId } = bindingRequest(input);
  const response = await request(input.connection, 'POST', '/api/v1/collaboration/deployment-bindings', body, { 'x-uar-workspace-id': workspaceId });
  return collaborationBoundary('binding-install', response, true);
}

export async function uarBindingStatus(input: ObjectValue): Promise<ObjectValue> {
  const id = encodeURIComponent(text(input.bindingId, 'bindingId'));
  const workspaceId = text(input.workspaceId, 'workspaceId');
  const response = await request(input.connection, 'GET', `/api/v1/collaboration/deployment-bindings/${id}`, undefined, { 'x-uar-workspace-id': workspaceId });
  return collaborationBoundary('binding-status', response, true);
}

export function refuseUarActivation(): never {
  throw new Error('This authoring client does not invoke team activation. Use the selected UAR instance through a host supporting its negotiated execution profile.');
}
