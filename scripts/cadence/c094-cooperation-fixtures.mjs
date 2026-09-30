import { createHash, randomUUID } from 'node:crypto'

import { ipc, route, workspace } from './uar-team-operation-tools.mjs'

const digest = (text) => 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex')
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, child]) => [key, canonical(child)])
        )
      : value
function seal(value) {
  const { contentDigest: _old, ...fields } = value
  return { ...fields, contentDigest: digest(JSON.stringify(canonical(fields))) }
}
const ref = (value) => ({ id: value.id, version: value.version, digest: value.contentDigest })

/** Configure the operator's actual external gateway, without repeating Gate A. */
export async function selectLiveGateway(evaluate) {
  const credential = process.env.BOSS_CADENCE_LITER_KEY ?? process.env.LITER_LLM_MASTER_KEY
  if (!credential) throw new Error('C094_GATEWAY_CREDENTIAL_REQUIRED')
  const endpoint = process.env.BOSS_CADENCE_LITER_ENDPOINT ?? 'http://127.0.0.1:4000'
  const alias = process.env.BOSS_CADENCE_LITER_ALIAS ?? 'kimi-for-coding'
  const providerId = process.env.BOSS_CADENCE_LITER_SOURCE_PROVIDER ?? 'kimi-code-plan-cn'
  const modelId = process.env.BOSS_CADENCE_LITER_SOURCE_MODEL ?? 'kimi-for-coding'
  if (
    alias !== 'kimi-for-coding' &&
    (!process.env.BOSS_CADENCE_LITER_SOURCE_PROVIDER || !process.env.BOSS_CADENCE_LITER_SOURCE_MODEL)
  ) {
    throw new Error('C094_EXPLICIT_SOURCE_IDENTITY_REQUIRED')
  }
  const configured = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: configured.revisions.services,
        value: { ...configured.config.services, liter: { ownership: 'external', source: 'manual', endpoint } }
      }
    ],
    secrets: { literKey: { operation: 'set', value: credential } }
  })
  const catalog = await ipc(evaluate, 'prometheus.liter.catalog.read', {})
  const gatewayConnectionId = catalog.gateway.identity.gatewayConnectionId
  const saved = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  const target = { providerConnectionId: 'cadence-c094-source', providerId, modelId }
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: saved.revisions.services,
        value: {
          ...saved.config.services,
          literConnections: [
            ...saved.config.services.literConnections.filter(
              (item) => item.providerConnectionId !== target.providerConnectionId
            ),
            {
              providerConnectionId: target.providerConnectionId,
              providerId,
              displayName: 'C094 observed gateway source',
              ...(process.env.BOSS_CADENCE_LITER_SOURCE_BASE_URL
                ? { baseUrl: process.env.BOSS_CADENCE_LITER_SOURCE_BASE_URL }
                : !process.env.BOSS_CADENCE_LITER_SOURCE_PROVIDER && !process.env.BOSS_CADENCE_LITER_SOURCE_MODEL
                  ? { baseUrl: 'https://api.kimi.com/coding/v1' }
                  : {}),
              timeoutMs: 90_000,
              enabled: true
            }
          ],
          literAliases: [
            ...saved.config.services.literAliases.filter(
              (item) => item.gatewayConnectionId !== gatewayConnectionId || item.alias !== alias
            ),
            { gatewayConnectionId, alias, target, enabled: true, custom: false }
          ]
        }
      }
    ],
    secrets: {}
  })
  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const gateway = sources.sources.find((source) => source.source === 'gateway')
  if (
    !gateway?.operational ||
    !gateway.providers.some((provider) => provider.models.some((model) => model.id === alias && model.enabled))
  ) {
    throw new Error('C094_LIVE_GATEWAY_UNAVAILABLE')
  }
  return { source: 'gateway', providerId: 'the-boss-gateway', modelId: alias }
}

/** New immutable fixtures plus a fresh private 16k grant; production starter stays unchanged. */
export async function createFixture({ evaluate, host, model, label, trigger = true, workers = 1 }) {
  const workspaceId = await workspace(evaluate, `Cadence C094 ${label}`)
  const starter = await ipc(evaluate, route('setup_starter'), { workspaceId, model })
  await host.setOwner(starter.ownerId)
  const request = (method, path, body) =>
    host.trustedRequest({ workspaceId, method, path, ...(body === undefined ? {} : { body }) })
  const exported = await request('POST', '/api/v1/collaboration/packages:export', {
    package: starter.package,
    target: { kind: 'canonicalDraft2' }
  })
  if (exported.status !== 'exported') throw new Error('C094_CANONICAL_FIXTURE_EXPORT_REFUSED')
  const manifest = JSON.parse(exported.export.manifest)
  const documents = new Map(Object.entries(exported.export.files).map(([path, source]) => [path, JSON.parse(source)]))
  const nonce = randomUUID().slice(0, 8)
  const refs = new Map()
  const newId = (kind) => `c094-${kind}-${nonce}`
  for (const [path, original] of documents) {
    if (original.kind === 'TeamDefinition') continue
    const changed = seal({ ...original, id: newId(original.kind.toLowerCase()), version: '1.0.0' })
    refs.set(original.id, ref(changed))
    documents.set(path, changed)
  }
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.map(rewrite)
    if (!value || typeof value !== 'object') return value
    if (Object.keys(value).length === 3 && value.id && value.version && value.digest && refs.has(value.id))
      return refs.get(value.id)
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]))
  }
  let teamDefinition
  for (const [path, original] of documents) {
    if (original.kind !== 'TeamDefinition') continue
    teamDefinition = seal({
      ...rewrite(original),
      id: newId('team'),
      version: '1.0.0',
      budget: { ...original.budget, maxTokens: 16000 },
      communication: [
        { fromRole: 'coordinator', toRole: 'worker', modes: trigger ? ['queue-only', 'trigger-turn'] : ['queue-only'] },
        { fromRole: 'worker', toRole: 'coordinator', modes: ['queue-only'] }
      ]
    })
    refs.set(original.id, ref(teamDefinition))
    documents.set(path, teamDefinition)
  }
  if (!teamDefinition) throw new Error('C094_TEAM_DEFINITION_MISSING')
  const files = Object.fromEntries([...documents].map(([path, document]) => [path, JSON.stringify(document)]))
  const changedManifest = seal({
    ...manifest,
    id: newId('package'),
    version: '1.0.0',
    entrypoints: [ref(teamDefinition)],
    files: manifest.files.map((file) => ({
      ...file,
      definition: ref(documents.get(file.path)),
      byteDigest: digest(files[file.path])
    })),
    lock: manifest.lock.map((item) => ({
      ...item,
      requestedBy: refs.get(item.requestedBy)?.id ?? item.requestedBy,
      reference: refs.get(item.reference.id) ?? item.reference
    }))
  })
  const packageRequest = { commandId: randomUUID(), manifest: JSON.stringify(changedManifest), files }
  await request('POST', '/api/v1/collaboration/packages:preflight', packageRequest)
  await request('POST', '/api/v1/collaboration/packages:install', packageRequest)
  const savedBindings = await request('GET', '/api/v1/collaboration/deployment-bindings')
  const saved = savedBindings.find((item) => item.id === starter.id)
  if (!saved || saved.workspaceId !== workspaceId) throw new Error('C094_SCOPED_BINDING_MISSING')
  const binding = seal({
    ...saved.document,
    id: newId('binding'),
    revision: 1,
    package: ref(changedManifest),
    effectiveBudget: { ...saved.document.effectiveBudget, maxTokens: 16000, maxElapsedSeconds: 300 },
    effectiveLimits: { ...saved.document.effectiveLimits, concurrentTurns: 1, maxMembers: 3, maxPendingTasks: 8 }
  })
  const bindingRequest = { commandId: randomUUID(), expectedRevision: 0, binding }
  const preflight = await request('POST', '/api/v1/collaboration/deployment-bindings:preflight', bindingRequest)
  if (!preflight.activationSupported) throw new Error('C094_PRIVATE_FIXTURE_BINDING_REFUSED')
  await request('POST', '/api/v1/collaboration/deployment-bindings', bindingRequest)
  const instance = await ipc(evaluate, route('create'), {
    workspaceId,
    commandId: randomUUID(),
    deploymentBindingId: binding.id,
    teamDefinition: ref(teamDefinition),
    input: { brief: label },
    memberSlots: [
      { role: 'coordinator', count: 1 },
      { role: 'worker', count: workers }
    ]
  })
  return {
    workspaceId,
    teamInstanceId: instance.id,
    bindingId: binding.id,
    bindingRevision: 1,
    package: ref(changedManifest),
    definition: ref(teamDefinition),
    instructions: teamDefinition.instructions,
    coordinatorId: instance.members.find((member) => member.role === 'coordinator').id,
    workerIds: instance.members.filter((member) => member.role === 'worker').map((member) => member.id),
    request
  }
}
