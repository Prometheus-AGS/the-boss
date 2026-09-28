import { createHash } from 'node:crypto'

const profile = 'urn:prometheus:uar:collaboration:0.1.0-draft.2'
const version = '1.0.0'
const agentId = 'urn:boss:starter:agent'
const packageId = 'urn:boss:starter:package'
const agentPath = 'agent-definition.json'
const provenance = { source: 'The Boss built-in starter agent', authors: ['The Boss'] }
const limits = { concurrentTurns: 1, maxMembers: 1, maxDepth: 0, maxPendingTasks: 8 }

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)])
    )
  }
  return value
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function document<T extends Record<string, JsonValue>>(value: T): T & { contentDigest: string } {
  return { ...value, contentDigest: digest(JSON.stringify(canonical(value))) }
}

/** A fixed portable definition. Owner, workspace, model choice and credentials belong only in the private binding. */
export function starterPackage() {
  const agent = document({
    profile,
    kind: 'AgentDefinition',
    id: agentId,
    version,
    provenance,
    requiredCapabilities: ['collaboration_definition_packages_v2'],
    extensions: {},
    title: 'Starter agent',
    role: 'assistant',
    whenToUse: 'Use for a simple, user-directed task in this workspace.',
    instructions: 'Follow the user request using the configured model. Ask when essential information is missing.',
    input: { type: 'object' },
    output: { type: 'object' },
    skills: [],
    models: [{ role: 'primary', capabilities: ['text'], preferredAliases: ['local-default'] }],
    permittedChildren: [],
    context: { mode: 'none', artifacts: [], history: 'none', memoryScopes: [] },
    requestedLimits: limits,
    sourceIdentity: {
      profile: 'urn:boss:starter:source:1',
      id: agentId,
      version,
      digest: digest('The Boss built-in starter agent 1.0.0'),
      revision: null
    },
    renameMapping: { sourceId: agentId, targetId: agentId, reason: 'unchanged' },
    authoredFields: [],
    modelRequirements: { required: false, value: { capabilities: ['text'] } },
    promptDialect: { required: false, value: 'default' },
    ragConfiguration: { required: false, value: { mode: 'disabled' } },
    contextStrategy: { required: false, value: { mode: 'none' } },
    apiHarness: { required: false, value: {} },
    legacySections: {},
    sourceDescriptor: {}
  })
  const agentSource = JSON.stringify(agent)
  const agentRef = { id: agent.id, version: agent.version, digest: agent.contentDigest }
  const manifest = document({
    profile,
    kind: 'PackageManifest',
    id: packageId,
    version,
    provenance,
    requiredCapabilities: ['collaboration_definition_packages_v2'],
    extensions: {},
    entrypoints: [agentRef],
    files: [{ path: agentPath, kind: 'AgentDefinition', definition: agentRef, byteDigest: digest(agentSource) }],
    lock: [],
    capabilityDeclarations: [{ capability: 'collaboration_definition_packages_v2', required: true }],
    resolution: 'exact-version-and-digest'
  })
  return {
    identity: { id: manifest.id, version: manifest.version, digest: manifest.contentDigest },
    manifest: JSON.stringify(manifest),
    files: { [agentPath]: agentSource }
  }
}

export function starterBinding(input: {
  ownerId: string
  workspaceId: string
  runtimeInstanceId: string
  providerId: string
  modelId: string
  storageBackend: 'embedded' | 'remote'
  packageIdentity: { id: string; version: string; digest: string }
}) {
  return document({
    profile,
    kind: 'DeploymentBinding',
    id: `urn:boss:starter:binding:${input.workspaceId}`,
    version,
    provenance,
    requiredCapabilities: ['collaboration_deployment_bindings_v2'],
    extensions: {},
    exportClass: 'private-installed-state',
    package: input.packageIdentity,
    ownerId: input.ownerId,
    workspaceId: input.workspaceId,
    runtimeInstanceId: input.runtimeInstanceId,
    revision: 1,
    modelBindings: [
      {
        requestedAlias: 'local-default',
        providerId: input.providerId,
        modelId: input.modelId,
        credentialRef: `protected-credential://uar/provider/${input.providerId}`
      }
    ],
    skillBindings: [],
    storage: {
      backend: input.storageBackend === 'embedded' ? 'surrealkv' : 'surrealdb',
      connectionRef: 'protected-connection://uar/runtime',
      durableTransactions: true
    },
    policyRevision: 'boss-starter-v1',
    effectiveLimits: limits,
    effectiveBudget: { maxTokens: 4096, maxCostMicrounits: 100000, currency: 'USD', maxElapsedSeconds: 120 },
    contextGrants: [],
    representationGrantRefs: [],
    status: 'ready',
    effectiveBindingReceiptRef: null
  })
}
