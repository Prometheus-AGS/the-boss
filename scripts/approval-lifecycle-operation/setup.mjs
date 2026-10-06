import { randomUUID } from 'node:crypto'

import { ipc } from './clients.mjs'
import { requireFact } from './io.mjs'

export async function setup(evaluate, configuration) {
  const registered = await evaluate(
    `window.api.dataApi.request(${JSON.stringify({
      id: randomUUID(),
      method: 'POST',
      path: '/agent-workspaces',
      body: { path: configuration.workspaceDirectory, name: configuration.marker }
    })})`
  )
  requireFact(!registered?.error && registered?.data?.id, 'C142_WORKSPACE_REGISTRATION_UNAVAILABLE')
  const gateway = configuration.gateway
  const initial = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: initial.revisions.services,
        value: {
          ...initial.config.services,
          liter: { ownership: 'external', source: 'manual', endpoint: gateway.endpoint }
        }
      }
    ],
    secrets: { literKey: { operation: 'set', value: process.env[gateway.credentialEnv] } }
  })
  const catalog = await ipc(evaluate, 'prometheus.liter.catalog.read', {})
  const gatewayConnectionId = catalog.gateway?.identity?.gatewayConnectionId
  requireFact(catalog.gateway?.operational && gatewayConnectionId, 'C142_SELECTED_GATEWAY_UNAVAILABLE')
  const current = await ipc(evaluate, 'prometheus.integration.snapshot', {})
  const providerConnectionId = 'c142-selected-source'
  await ipc(evaluate, 'prometheus.integration.configure', {
    updates: [
      {
        feature: 'services',
        expectedRevision: current.revisions.services,
        value: {
          ...current.config.services,
          literConnections: [
            ...current.config.services.literConnections.filter(
              (item) => item.providerConnectionId !== providerConnectionId
            ),
            {
              providerConnectionId,
              providerId: gateway.providerId,
              displayName: 'C142 selected configured source',
              ...(gateway.providerBaseUrl ? { baseUrl: gateway.providerBaseUrl } : {}),
              enabled: true,
              timeoutMs: 90000
            }
          ],
          literAliases: [
            ...current.config.services.literAliases.filter(
              (item) => item.gatewayConnectionId !== gatewayConnectionId || item.alias !== gateway.alias
            ),
            {
              gatewayConnectionId,
              alias: gateway.alias,
              target: { providerConnectionId, providerId: gateway.providerId, modelId: gateway.modelId },
              enabled: true,
              custom: false
            }
          ]
        }
      }
    ],
    secrets: {}
  })
  const sources = await ipc(evaluate, 'prometheus.uar.models.sources', {})
  const provider = sources.sources
    .find((item) => item.source === 'gateway' && item.operational)
    ?.providers.find((item) => item.enabled && item.models.some((model) => model.enabled && model.id === gateway.alias))
  requireFact(provider, 'C142_ADVERTISED_MODEL_UNAVAILABLE')
  return {
    workspaceId: registered.data.id,
    model: { source: 'gateway', providerId: provider.id, modelId: gateway.alias }
  }
}
