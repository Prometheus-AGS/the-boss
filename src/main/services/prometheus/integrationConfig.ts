import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { safeStorage } from 'electron'

import { application } from '@application'
import { isUarEnabled } from '@shared/ai/agentRuntimeCapabilities'
import { literProviderConnectionIdentitySchema, type LiterCredentialMutation } from '@shared/types/literGateway'
import {
  integrationConfigSchema,
  integrationDocumentSchema,
  integrationRevisionsSchema,
  type IntegrationConfig,
  type IntegrationDocument,
  type IntegrationSecret,
  type IntegrationSecretPatch
} from '@shared/types/prometheusIntegration'
import { MANAGED_UAR_INSTANCE_ID, managedUarRuntimeInstance } from '@shared/types/uarServiceInstance'

const INTEGRATION_PREFERENCE = 'app.prometheus.integrations' as const
type ManagedIntegrationSecret = IntegrationSecret | 'uarAdminKey' | 'uarCredentialEncryptionKey'
let credentialStoreRevision = 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function upgradeIntegrationConfig(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.services)) return value
  const services = value.services
  if (services.surrealdb || services.memory || services.liter) return value
  const ownership = services.mode === 'external' ? 'external' : 'managed'
  const source = ownership === 'managed' ? 'application' : 'manual'
  const surrealPort = typeof services.surrealPort === 'number' ? services.surrealPort : 28000
  const memoryPort = typeof services.memoryPort === 'number' ? services.memoryPort : 23001
  const literPort = typeof services.literPort === 'number' ? services.literPort : 4000
  const compass = isRecord(value.compass) ? value.compass : {}
  return {
    ...value,
    services: {
      ...services,
      surrealdb: {
        ownership,
        source,
        endpoint:
          ownership === 'external' && typeof compass.endpoint === 'string'
            ? compass.endpoint
            : `http://127.0.0.1:${surrealPort}`
      },
      memory: {
        ownership,
        source,
        endpoint:
          ownership === 'external' && typeof services.memoryEndpoint === 'string'
            ? services.memoryEndpoint
            : `http://127.0.0.1:${memoryPort}/mcp/sse`
      },
      liter: {
        ownership,
        source,
        endpoint:
          ownership === 'external' && typeof services.literEndpoint === 'string'
            ? services.literEndpoint
            : `http://127.0.0.1:${literPort}`
      }
    }
  }
}

function upgradeUarInstances(value: unknown): unknown {
  if (!isRecord(value)) return value
  const uar = isRecord(value.uar) ? value.uar : {}
  const port = typeof uar.port === 'number' ? uar.port : 1906
  const instances = Array.isArray(uar.instances)
    ? uar.instances.map((candidate) => {
        if (!isRecord(candidate)) return candidate
        const id = typeof candidate.id === 'string' ? candidate.id : ''
        const { credentialRef: legacyCredentialRef, ...rest } = candidate
        if (candidate.ownership !== 'external') {
          return {
            ...rest,
            ...(candidate.profile === 'uar.agui/1' ? { profile: 'uar.service-instance/1' } : {}),
            ...(isRecord(candidate.endpoints) ? { endpoints: { ...candidate.endpoints, console: null } } : {})
          }
        }
        const runtimeCredentialRef =
          typeof candidate.runtimeCredentialRef === 'string'
            ? candidate.runtimeCredentialRef.replace(/^uar-instance:(?!\/\/)/, 'uar-instance://')
            : typeof legacyCredentialRef === 'string'
              ? legacyCredentialRef.replace(/^uar-instance:(?!\/\/)/, 'uar-instance://')
              : `uar-instance://${id}`
        return {
          ...rest,
          ...(candidate.profile === 'uar.agui/1' ? { profile: 'uar.service-instance/1' } : {}),
          runtimeCredentialRef,
          adminCredentialRef:
            typeof candidate.adminCredentialRef === 'string'
              ? candidate.adminCredentialRef.replace(/^uar-instance:(?!\/\/)/, 'uar-instance://')
              : `${runtimeCredentialRef}/admin`
        }
      })
    : [managedUarRuntimeInstance(port)]
  return {
    ...value,
    uar: {
      ...uar,
      selectedInstanceId: typeof uar.selectedInstanceId === 'string' ? uar.selectedInstanceId : MANAGED_UAR_INSTANCE_ID,
      instances
    }
  }
}

function decodeIntegrationDocument(raw: string): { document: IntegrationDocument; legacy: boolean } {
  const value: unknown = JSON.parse(raw)
  const wrapped = isRecord(value) && 'config' in value
  const rawConfig = wrapped && isRecord(value.config) ? value.config : undefined
  const rawUar = rawConfig && isRecord(rawConfig.uar) ? rawConfig.uar : undefined
  const needsUarUpgrade =
    !rawUar ||
    !Array.isArray(rawUar.instances) ||
    typeof rawUar.selectedInstanceId !== 'string' ||
    rawUar.instances.some(
      (candidate) =>
        isRecord(candidate) &&
        (candidate.profile === 'uar.agui/1' ||
          'credentialRef' in candidate ||
          (typeof candidate.runtimeCredentialRef === 'string' &&
            /^uar-instance:(?!\/\/)/.test(candidate.runtimeCredentialRef)) ||
          (typeof candidate.adminCredentialRef === 'string' &&
            /^uar-instance:(?!\/\/)/.test(candidate.adminCredentialRef)) ||
          (candidate.ownership === 'external' &&
            (typeof candidate.runtimeCredentialRef !== 'string' || typeof candidate.adminCredentialRef !== 'string')))
    )
  const current = integrationDocumentSchema.safeParse(value)
  if (current.success && !needsUarUpgrade) return { document: current.data, legacy: false }
  const config = integrationConfigSchema.parse(
    upgradeUarInstances(upgradeIntegrationConfig(wrapped ? value.config : value))
  )
  const revisions = wrapped
    ? integrationRevisionsSchema.parse(value.revisions ?? {})
    : { compass: 0, filesystem: 0, uar: 0, services: 0 }
  return {
    document: {
      schemaVersion: 4,
      revisions,
      config
    },
    legacy: true
  }
}

export function readIntegrationDocument(): IntegrationDocument {
  return decodeIntegrationDocument(application.get('PreferenceService').get(INTEGRATION_PREFERENCE)).document
}

export async function migrateIntegrationDocument(): Promise<IntegrationDocument> {
  const decoded = decodeIntegrationDocument(application.get('PreferenceService').get(INTEGRATION_PREFERENCE))
  if (decoded.legacy) await writeIntegrationDocument(decoded.document)
  await migrateLegacyUarInstanceSecrets(decoded.document)
  return decoded.document
}

export async function writeIntegrationDocument(document: IntegrationDocument): Promise<void> {
  const canonical = integrationDocumentSchema.parse(document)
  await application.get('PreferenceService').set(INTEGRATION_PREFERENCE, JSON.stringify(canonical))
}

export function readIntegrationConfig(): IntegrationConfig {
  return readIntegrationDocument().config
}

export function integrationDirectory(): string {
  return application.getPath('feature.prometheus.state')
}

export async function readSecrets(): Promise<Partial<Record<ManagedIntegrationSecret, string>>> {
  try {
    const data = await fs.readFile(path.join(integrationDirectory(), 'secrets.enc'))
    let decrypted: Awaited<ReturnType<typeof safeStorage.decryptStringAsync>>
    try {
      decrypted = await safeStorage.decryptStringAsync(data)
    } catch {
      throw new Error('prometheus.error.secretDecryption')
    }
    return JSON.parse(decrypted.result)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

export async function readLiterCredentialSnapshot(): Promise<{ credential?: string; revision: number }> {
  while (true) {
    const revision = credentialStoreRevision
    const credential = (await readSecrets()).literKey
    if (revision === credentialStoreRevision) return { ...(credential ? { credential } : {}), revision }
  }
}

async function replaceSecrets(secrets: Partial<Record<ManagedIntegrationSecret, string>>): Promise<void> {
  if (
    !(await safeStorage.isAsyncEncryptionAvailable()) ||
    (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
  ) {
    throw new Error('prometheus.error.secretStorage')
  }
  await fs.mkdir(integrationDirectory(), { recursive: true, mode: 0o700 })
  const filename = path.join(integrationDirectory(), 'secrets.enc')
  await fs.writeFile(`${filename}.tmp`, await safeStorage.encryptStringAsync(JSON.stringify(secrets)), { mode: 0o600 })
  await fs.rename(`${filename}.tmp`, filename)
  credentialStoreRevision += 1
}

function literConnectionSecretKey(providerConnectionId: string): string {
  const identity = literProviderConnectionIdentitySchema.parse({ providerConnectionId })
  return `literConnection:${identity.providerConnectionId}`
}

function uarInstanceSecretKey(instanceId: string, kind?: 'runtime' | 'admin'): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(instanceId)) throw new Error('Invalid UAR instance id')
  return kind ? `uarInstance:${encodeURIComponent(instanceId)}:${kind}` : `uarInstance:${instanceId}`
}

async function migrateLegacyUarInstanceSecrets(document: IntegrationDocument): Promise<void> {
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  let changed = false
  for (const instance of document.config.uar.instances) {
    if (instance.ownership !== 'external') continue
    const legacyKey = uarInstanceSecretKey(instance.id)
    const runtimeKey = uarInstanceSecretKey(instance.id, 'runtime')
    if (!secrets[legacyKey]) continue
    if (!secrets[runtimeKey]) secrets[runtimeKey] = secrets[legacyKey]
    delete secrets[legacyKey]
    changed = true
  }
  if (changed) await replaceSecrets(secrets)
}

export async function readUarInstanceCredentialPresence(): Promise<Map<string, { runtime: boolean; admin: boolean }>> {
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  const presence = new Map<string, { runtime: boolean; admin: boolean }>()
  for (const [key, value] of Object.entries(secrets)) {
    const match = /^uarInstance:(.+):(runtime|admin)$/.exec(key)
    if (!match || !value) continue
    const instanceId = decodeURIComponent(match[1])
    const current = presence.get(instanceId) ?? { runtime: false, admin: false }
    current[match[2] as 'runtime' | 'admin'] = true
    presence.set(instanceId, current)
  }
  return presence
}

/** Main-process only. Runtime credentials never enter integration snapshots or renderer IPC. */
export async function readUarInstanceCredentials(
  instanceId: string
): Promise<{ runtimeBearer?: string; adminKey?: string }> {
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  const runtimeBearer = secrets[uarInstanceSecretKey(instanceId, 'runtime')]
  const adminKey = secrets[uarInstanceSecretKey(instanceId, 'admin')]
  return { ...(runtimeBearer ? { runtimeBearer } : {}), ...(adminKey ? { adminKey } : {}) }
}

export async function stageUarInstanceCredentials(
  instanceId: string,
  mutations: {
    runtime: { operation: 'unchanged' | 'set' | 'clear'; value?: string }
    admin: { operation: 'unchanged' | 'set' | 'clear'; value?: string }
  }
): Promise<() => Promise<void>> {
  const runtimeKey = uarInstanceSecretKey(instanceId, 'runtime')
  const adminKey = uarInstanceSecretKey(instanceId, 'admin')
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  const previous = { runtime: secrets[runtimeKey], admin: secrets[adminKey] }
  for (const [kind, mutation] of Object.entries(mutations) as Array<
    ['runtime' | 'admin', { operation: 'unchanged' | 'set' | 'clear'; value?: string }]
  >) {
    const key = kind === 'runtime' ? runtimeKey : adminKey
    if (mutation.operation === 'set') {
      if (!mutation.value) throw new Error(`A UAR instance ${kind} credential value is required`)
      secrets[key] = mutation.value
    }
    if (mutation.operation === 'clear') delete secrets[key]
  }
  if (mutations.runtime.operation !== 'unchanged' || mutations.admin.operation !== 'unchanged') {
    await replaceSecrets(secrets)
  }
  return async () => {
    if (mutations.runtime.operation === 'unchanged' && mutations.admin.operation === 'unchanged') return
    const current = (await readSecrets()) as Record<string, string | undefined>
    if (previous.runtime === undefined) delete current[runtimeKey]
    else current[runtimeKey] = previous.runtime
    if (previous.admin === undefined) delete current[adminKey]
    else current[adminKey] = previous.admin
    await replaceSecrets(current)
  }
}

export async function readLiterConnectionCredentialPresence(): Promise<Set<string>> {
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  const prefix = 'literConnection:'
  return new Set(
    Object.entries(secrets)
      .filter(([key, value]) => key.startsWith(prefix) && Boolean(value))
      .map(([key]) => key.slice(prefix.length))
  )
}

/** Main-process only. Provider credentials never enter integration snapshots or renderer IPC. */
export async function readLiterConnectionCredential(providerConnectionId: string): Promise<string | undefined> {
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  return secrets[literConnectionSecretKey(providerConnectionId)]
}

/** Only the trusted GitHub host resolves this reference; responses expose presence alone. */
export async function readFeedbackGithubCredential(credentialRef: string): Promise<string | undefined> {
  if (!/^host:\/\/feedback-github-[a-f0-9]{64}$/.test(credentialRef)) throw new Error('FEEDBACK_CREDENTIAL_SCOPE_DENIED')
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  return secrets[credentialRef]
}

export async function writeFeedbackGithubCredential(
  credentialRef: string,
  mutation: { operation: 'set'; value: string } | { operation: 'clear' }
): Promise<void> {
  if (!/^host:\/\/feedback-github-[a-f0-9]{64}$/.test(credentialRef)) throw new Error('FEEDBACK_CREDENTIAL_SCOPE_DENIED')
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  if (mutation.operation === 'set') secrets[credentialRef] = mutation.value
  else delete secrets[credentialRef]
  await replaceSecrets(secrets)
}

/** Connector credentials remain protected in main; references are scoped by instance and workspace. */
export async function readUarConnectorCredential(credentialRef: string): Promise<string | undefined> {
  if (!/^host:\/\/connector-(github|notion|slack|jira)-[a-f0-9]{64}$/.test(credentialRef)) {
    throw new Error('FEEDBACK_CREDENTIAL_SCOPE_DENIED')
  }
  return ((await readSecrets()) as Record<string, string | undefined>)[credentialRef]
}

export async function writeUarConnectorCredential(credentialRef: string, value: string): Promise<void> {
  if (!/^host:\/\/connector-(github|notion|slack|jira)-[a-f0-9]{64}$/.test(credentialRef)) {
    throw new Error('FEEDBACK_CREDENTIAL_SCOPE_DENIED')
  }
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  secrets[credentialRef] = value
  await replaceSecrets(secrets)
}

export async function stageLiterConnectionCredential(
  providerConnectionId: string,
  mutation: LiterCredentialMutation
): Promise<() => Promise<void>> {
  const key = literConnectionSecretKey(providerConnectionId)
  const secrets = (await readSecrets()) as Record<string, string | undefined>
  const previous = secrets[key]
  if (mutation.operation === 'set') secrets[key] = mutation.value
  if (mutation.operation === 'clear') delete secrets[key]
  if (mutation.operation !== 'unchanged') await replaceSecrets(secrets)
  return async () => {
    if (mutation.operation === 'unchanged') return
    const current = (await readSecrets()) as Record<string, string | undefined>
    if (previous === undefined) delete current[key]
    else current[key] = previous
    await replaceSecrets(current)
  }
}

// Credentials cross the renderer/main boundary once. Ordinary preferences and responses
// contain only presence flags; disk storage uses the OS credential protection facility.
export async function writeSecrets(patch: IntegrationSecretPatch): Promise<void> {
  const secrets = await readSecrets()
  const mutations = Object.entries(patch) as Array<
    [IntegrationSecret, NonNullable<IntegrationSecretPatch[IntegrationSecret]>]
  >
  for (const [name, mutation] of mutations) {
    if (mutation.operation === 'set') secrets[name] = mutation.value
    if (mutation.operation === 'clear') delete secrets[name]
  }
  await replaceSecrets(secrets)
  const persisted = await readSecrets()
  for (const [name, mutation] of mutations) {
    const confirmed = mutation.operation === 'set' ? persisted[name] === mutation.value : persisted[name] === undefined
    if (mutation.operation !== 'unchanged' && !confirmed) throw new Error('prometheus.error.secretStorage')
  }
}

export async function ensureManagedSecrets(): Promise<Partial<Record<ManagedIntegrationSecret, string>>> {
  const secrets = await readSecrets()
  const managedSecretNames: ManagedIntegrationSecret[] = [
    'rootPassword',
    'memoryPassword',
    'compassPassword',
    'literKey'
  ]
  if (isUarEnabled()) managedSecretNames.push('uarPassword', 'uarAdminKey', 'uarCredentialEncryptionKey')
  let changed = false
  for (const key of managedSecretNames) {
    if (!secrets[key]) {
      secrets[key] = randomBytes(32).toString('hex')
      changed = true
    }
  }
  if (changed) await replaceSecrets(secrets)
  return secrets
}
