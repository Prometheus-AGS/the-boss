import { randomBytes } from 'node:crypto'
import { setup as setupGateway } from '../approval-lifecycle-operation/setup.mjs'
import { ipc, requireFact, waitFor } from './io.mjs'

export async function runtimeState(evaluate) {
  const snapshot = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
  return { state: snapshot.uar.state, processId: snapshot.uar.processId, startedAt: snapshot.uar.startedAt,
    port: snapshot.uar.effectivePort, selectedInstanceId: inventory.selectedInstanceId }
}

export async function prepare(evaluate, signal, configuration, resources) {
  await waitFor(signal, () => evaluate(`(() => {
    const skip=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&node.innerText.trim()==='Set up later');
    if(skip)skip.click();return Boolean(document.querySelector('#app-sidebar'));
  })()`), 'C14W_PACKAGED_ONBOARDING_UNAVAILABLE')
  const workspace = await setupGateway(evaluate, configuration)
  resources.workspaceId = workspace.workspaceId
  const initial = await runtimeState(evaluate)
  resources.initial = initial
  const inventory = await ipc(evaluate, 'prometheus.uar.instances.read', {})
  requireFact(initial.state === 'running' && Number.isInteger(initial.processId) &&
    inventory.instances.some(item=>item.id===initial.selectedInstanceId&&item.ownership==='managed'),
  'C14W_BOSS_MANAGED_SELECTED_UAR_REQUIRED')
  await ipc(evaluate, 'prometheus.uar.teams.setup_starter', {
    workspaceId: workspace.workspaceId, model: workspace.model
  })
  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const gateway = configuration.gateway
  const providers = sources.sources.filter(source=>source.source==='uar'&&source.operational)
    .flatMap(source=>source.providers.filter(provider=>provider.enabled&&provider.credentialConfigured&&
      provider.models.some(model=>model.enabled&&model.id===gateway.alias&&
        model.pricingIdentity?.providerId===gateway.providerId&&model.pricingIdentity?.modelId===gateway.modelId)))
  requireFact(providers.length === 1, 'C14W_CONFIGURED_NATIVE_MODEL_AMBIGUOUS_OR_UNAVAILABLE')
  if (configuration.modelContext) {
    const provider = providers[0]
    await ipc(evaluate, 'prometheus.uar.providers.save', {
      mode: 'update', id: provider.id, displayName: provider.name, baseUrl: provider.baseUrl,
      protocol: provider.protocol, defaultModel: provider.defaultModel, enabled: provider.enabled,
      credential: { operation: 'unchanged' },
      models: provider.models.map(({ effectiveIdentity, name, ...model }) => ({
        ...model, displayName: name,
        ...(model.id === gateway.alias ? { contextWindow: configuration.modelContext.contextWindow } : {})
      }))
    })
  }
  await ipc(evaluate, 'prometheus.uar.providers.default', { id: providers[0].id })
  const binding = await ipc(evaluate, 'prometheus.uar.durable.setup_starter', { workspaceId: workspace.workspaceId })
  requireFact(binding.activationSupported, 'C14W_REAL_AGENT_BINDING_UNAVAILABLE')
  // This inert native record exposes the exact installed agent identity. No turn or activation is submitted.
  const identityRecord = await ipc(evaluate, 'prometheus.uar.durable.create_instance', {
    workspaceId: workspace.workspaceId, deploymentBindingId: binding.id, profile: 'on_demand'
  })
  resources.identityRecord = identityRecord
  requireFact(identityRecord.definitionId && identityRecord.definitionVersion && identityRecord.definitionDigest &&
    identityRecord.bindingId === binding.id && !identityRecord.activeRunId,
  'C14W_NATIVE_BOUND_DEFINITION_IDENTITY_UNAVAILABLE')
  await ipc(evaluate, 'bossfang.configure_credentials', {
    username: 'disposable-workflow-operator', password: randomBytes(32).toString('hex')
  })
  const previous = await ipc(evaluate, 'bossfang.status')
  requireFact(previous.status === 'stopped' && previous.ownership === 'managed', 'C14W_ISOLATED_OWNED_PROFILE_REQUIRED')
  await ipc(evaluate, 'bossfang.configure', { ...previous.requested, ownership: 'managed',
    uarInstanceId: initial.selectedInstanceId, workspaceId: workspace.workspaceId,
    diagnosticModelId: providers[0].id + '/' + gateway.alias })
  resources.ownedBossFangStartRequested = true
  await ipc(evaluate, 'bossfang.start')
  const connected = await ipc(evaluate, 'bossfang.connect')
  requireFact(connected.connection === 'connected' && connected.effective?.uarInstanceId,
    'C14W_SCOPED_SELECTED_UAR_CONNECTION_UNAVAILABLE')
  return { workspace, binding, identityRecord, initial, runtimeId: connected.effective.uarInstanceId,
    generation: connected.effective.uarGeneration, modelId: providers[0].id + '/' + gateway.alias,
    modelContext: configuration.modelContext }
}
