import { randomUUID } from 'node:crypto'

import { waitFor } from '../approval-lifecycle-operation/io.mjs'
import { digest, requireFact } from './io.mjs'
import { workflow as workflowDocument } from './workflow.mjs'

const profile = 'urn:prometheus:uar:collaboration:0.1.0-draft.2'
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => [key, canonical(child)])) : value
const document = (value) => ({ ...value, contentDigest: 'sha256:' + digest(JSON.stringify(canonical(value))) })
const reference = (value) => ({ id: value.id, version: value.version, digest: value.contentDigest })

export async function createRecords(host, signal, workspaceId, gateway, marker) {
  const request = (method, pathname, body) => host.trustedRequest({ workspaceId, method, path: pathname,
    ...(body === undefined ? {} : { body }) })
  const capabilities = await request('GET', '/api/v1/collaboration/capabilities')
  requireFact(capabilities.instance.id === host.instanceId && capabilities.bindingOwnerId, 'C14D_RUNTIME_AUTHORITY_UNAVAILABLE')
  const providerId = 'c14-detail-' + randomUUID()
  const gatewayUrl = new URL(gateway.endpoint)
  if (!gatewayUrl.pathname.replace(/\/$/, '').endsWith('/v1')) gatewayUrl.pathname = gatewayUrl.pathname.replace(/\/$/, '') + '/v1'
  await request('POST', '/api/uar/providers', {
    id: providerId, display_name: marker, base_url: gatewayUrl.href.replace(/\/$/, ''), protocol: 'chat',
    default_model: gateway.alias, enabled: true, api_key: process.env[gateway.credentialEnv],
    models: [{ id: gateway.alias, enabled: true,
      execution_profile: { profile: { id: 'uar.openai-compatible-chat.settings-v1', revision: 1 }, settingsRevision: 1, reasoning: { mode: 'off' } },
      pricing_identity: { provider_id: gateway.providerId, model_id: gateway.modelId } }]
  })
  const limits = { concurrentTurns: 1, maxMembers: 1, maxDepth: 0, maxPendingTasks: 8 }
  const provenance = { source: 'The Boss disposable lifecycle detail operation', authors: ['The Boss'] }
  const base = { profile, version: '1.0.0', provenance, extensions: {} }
  const agent = document({ ...base, kind: 'AgentDefinition', id: marker + ':agent',
    requiredCapabilities: ['collaboration_definition_packages_v2'], title: marker, role: 'assistant',
    whenToUse: 'Only for this disposable lifecycle metadata operation.',
    instructions: 'Reply only with the requested delivery marker. Do not use tools or delegate.',
    input: { type: 'object' }, output: { type: 'object' }, skills: [],
    models: [{ role: 'primary', capabilities: ['text'], preferredAliases: ['local-default'] }], permittedChildren: [],
    context: { mode: 'none', artifacts: [], history: 'none', memoryScopes: [] }, requestedLimits: limits,
    sourceIdentity: { profile: 'urn:boss:starter:source:1', id: marker + ':agent', version: '1.0.0', digest: 'sha256:' + digest(marker), revision: null },
    renameMapping: { sourceId: marker + ':agent', targetId: marker + ':agent', reason: 'unchanged' }, authoredFields: [],
    modelRequirements: { required: false, value: { capabilities: ['text'] } }, promptDialect: { required: false, value: 'default' },
    ragConfiguration: { required: false, value: { mode: 'disabled' } }, contextStrategy: { required: false, value: { mode: 'none' } },
    apiHarness: { required: false, value: {} }, legacySections: {}, sourceDescriptor: {} })
  const agentSource = JSON.stringify(agent)
  const workflow = document(workflowDocument(base, marker))
  const workflowSource = JSON.stringify(workflow)
  const manifest = document({ ...base, kind: 'PackageManifest', id: marker + ':package',
    requiredCapabilities: ['collaboration_definition_packages_v2'], entrypoints: [reference(agent)],
    files: [
      { path: 'agent-definition.json', kind: 'AgentDefinition', definition: reference(agent), byteDigest: 'sha256:' + digest(agentSource) },
      { path: 'workflow-definition.json', kind: 'WorkflowDefinition', definition: reference(workflow), byteDigest: 'sha256:' + digest(workflowSource) }
    ],
    lock: [], capabilityDeclarations: [{ capability: 'collaboration_definition_packages_v2', required: true },
      { capability: 'prometheus.workflow-execution/1.0.0', required: true }], resolution: 'exact-version-and-digest' })
  const packageRequest = { commandId: randomUUID(), manifest: JSON.stringify(manifest),
    files: { 'agent-definition.json': agentSource, 'workflow-definition.json': workflowSource } }
  const packagePreflight = await request('POST', '/api/v1/collaboration/packages:preflight', packageRequest)
  await request('POST', '/api/v1/collaboration/packages:install', packageRequest)
  const registeredWorkflow = (await request('GET', '/api/v1/collaboration/workflow-definitions'))
    .find((item) => item.identity.id === workflow.id)
  requireFact(registeredWorkflow?.identity.digest === workflow.contentDigest, 'C14D_REAL_WORKFLOW_DEFINITION_UNAVAILABLE')
  const binding = document({ ...base, kind: 'DeploymentBinding', id: marker + ':binding',
    requiredCapabilities: ['collaboration_deployment_bindings_v2'], exportClass: 'private-installed-state', package: reference(manifest),
    ownerId: capabilities.bindingOwnerId, workspaceId, runtimeInstanceId: host.instanceId, revision: 1,
    modelBindings: [{ requestedAlias: 'local-default', providerId, modelId: gateway.alias,
      profile: { id: 'uar.openai-compatible-chat.settings-v1', revision: 1 }, settingsRevision: 1,
      credentialRef: 'protected-credential://uar/provider/' + providerId }], skillBindings: [],
    storage: { backend: capabilities.catalogStorage.backend, connectionRef: 'protected-connection://uar/runtime', durableTransactions: true },
    policyRevision: 'boss-c14-detail-v1', effectiveLimits: limits,
    effectiveBudget: { maxTokens: 4096, maxCostMicrounits: 500000, currency: 'USD', maxElapsedSeconds: 120 },
    contextGrants: [], representationGrantRefs: [], status: 'ready', effectiveBindingReceiptRef: null })
  const bindingRequest = { commandId: randomUUID(), expectedRevision: 0, binding }
  const preflight = await request('POST', '/api/v1/collaboration/deployment-bindings:preflight', bindingRequest)
  requireFact(preflight.activationSupported, 'C14D_REAL_BINDING_ACTIVATION_UNAVAILABLE')
  await request('POST', '/api/v1/collaboration/deployment-bindings', bindingRequest)
  const createInstance = () => request('POST', '/api/uar/agent-instances/v1', {
    deploymentBindingId: binding.id, profile: 'on_demand',
    limits: { max_inbox: 8, retained_commands: 32, retained_events: 64, max_restart_attempts: 3, idle_timeout_secs: 300 }
  })
  const source = await createInstance()
  const observer = await createInstance()
  await request('POST', '/api/uar/agent-instances/v1/' + encodeURIComponent(observer.instanceId) + '/disable', { commandId: randomUUID() })
  const subscription = await request('POST', '/api/uar/observers/v1', {
    observerInstanceId: observer.instanceId, sourceInstanceIds: [source.instanceId],
    limits: { max_inbox: 64, max_retries: 1, retained_acknowledged: 64 }
  })
  const subscriptionId = subscription.subscription.subscription_id
  const commandId = randomUUID()
  await request('POST', '/api/uar/agent-instances/v1/' + encodeURIComponent(source.instanceId) + '/turns', {
    commandId, prompt: 'Reply only with ' + marker + '. Do not use tools or delegate.'
  })
  const sourceView = await waitFor(signal, async () => {
    const value = await request('GET', '/api/uar/agent-instances/v1/' + encodeURIComponent(source.instanceId))
    const command = value.commands.find((item) => item.commandId === commandId)
    return command?.attemptId && command.rootRunId && ['completed', 'failed', 'cancelled', 'uncertain'].includes(command.status) ? value : false
  }, 'C14D_REAL_DURABLE_ATTEMPT_UNAVAILABLE', 120000, 1000)
  const observerView = await waitFor(signal, async () => {
    const value = await request('GET', '/api/uar/observers/v1/' + encodeURIComponent(subscriptionId))
    return value.subscription.inbox.some((item) => item.occurrence.command_id === commandId &&
      item.status === 'dead_letter' && item.attempts > 0 && item.last_error_code) ? value : false
  }, 'C14D_REAL_OBSERVER_FAILURE_UNAVAILABLE', 90000, 1000)
  return { request, bindingId: binding.id, sourceView, observerView, subscriptionId, commandId,
    packageIdentity: reference(manifest), agentIdentity: reference(agent), workflowDefinition: registeredWorkflow,
    packagePreflight: { activationSupported: packagePreflight.activationSupported,
      diagnostics: packagePreflight.diagnostics.map(({ field, disposition }) => ({ field, disposition })) },
    effectScope: { workspaceId, sourceInstanceId: source.instanceId, observerInstanceId: observer.instanceId,
      providerId, subscriptionId, configuredDisabledFeatures: ['memory', 'skill-evolution', 'file-tools', 'web-fetch', 'terminal-exec'],
      authoredSkills: 0, authoredPermittedChildren: 0, sourceTurnsSubmitted: 1, observerDisabledBeforeSubscription: true } }
}
