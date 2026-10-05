import * as z from 'zod'

import { application } from '@application'
import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import { uarPrincipalForSession } from '@main/ai/runtime/uar/uarPrincipal'
import type { UarSidecarEndpoint } from '@main/ai/runtime/uar/UarSidecarService'
import { t } from '@main/i18n'
import { readIntegrationConfig, readUarInstanceCredentials } from '@main/services/prometheus/integrationConfig'

const failure = (code: string) => new Error(`${t('bossfang.retainedAuthentication')} [${code}]`)
async function decode<T>(response: Response, schema: z.ZodType<T>, code: string): Promise<T> {
  const body = await response.json().catch(() => {
    throw failure(code)
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw failure(code)
  return parsed.data
}

const operations = ['discovery', 'model_read', 'model_completion', 'full_harness_delegation']
const grantSchema = z.object({
  id: z.string(),
  token: z.string(),
  expires_at: z.string(),
  principal: z.string(),
  instance_id: z.string(),
  runtime_epoch: z.string(),
  workspace_ids: z.array(z.string()),
  operations: z.array(z.string())
})
const endpointsSchema = z.object({
  runtime: z.string(),
  administration: z.string(),
  models: z.string(),
  console: z.string().nullable()
})
const bindingSchema = z.object({
  instance_id: z.string(),
  ownership: z.enum(['managed', 'external']),
  endpoints: endpointsSchema,
  workspace_locality: z.enum(['local', 'remote']),
  workspace: z.string().nullable(),
  credential_ref: z.string().nullable(),
  profile: z.string(),
  capabilities: z.array(z.string())
})
const projectionSchema = z.object({
  bossTaskId: z.string(),
  workspaceId: z.string(),
  selectedInstanceId: z.string(),
  effectiveBinding: bindingSchema,
  runtimeEpoch: z.string().nullish(),
  executionState: z.string(),
  admissionState: z.string(),
  cancellation: z.object({
    requested: z.boolean(),
    acknowledged: z.boolean(),
    terminal: z.boolean(),
    cleanupUncertain: z.boolean()
  })
})
const connectionsSchema = z.object({
  connections: z.array(projectionSchema.extend({ credentialState: z.enum(['retained', 'reattachment_required']) }))
})
type OriginalConnection = z.infer<typeof connectionsSchema>['connections'][number]
export type PrivateUarAuthorization = {
  endpoint: UarSidecarEndpoint
  inventoryId: string
  workspaceId: string
  bearer: string
  grant: z.infer<typeof grantSchema> | null
  runtimeEpoch: string | null
}
const sameEndpoints = (left: z.infer<typeof endpointsSchema>, right: z.infer<typeof endpointsSchema>) =>
  ['runtime', 'administration', 'models', 'console'].every(
    (key) => left[key as keyof typeof left] === right[key as keyof typeof right]
  )
const active = (run: OriginalConnection) =>
  !['completed', 'failed', 'cancelled'].includes(run.executionState) ||
  (run.cancellation.requested && (!run.cancellation.terminal || run.cancellation.cleanupUncertain))

/** Memory-only scoped authority. Native durable run projections remain the business-state owner. */
export class RetainedUarAuthorizations {
  private records = new Set<PrivateUarAuthorization>()
  constructor(
    private readonly request: (path: string, init?: RequestInit) => Promise<Response>,
    private readonly log: (text: string) => void
  ) {}
  get hasRecords() {
    return this.records.size > 0
  }
  async create(
    inventoryId: string,
    workspaceId: string,
    original?: OriginalConnection
  ): Promise<PrivateUarAuthorization> {
    try {
      agentWorkspaceService.getById(workspaceId)
    } catch {
      throw failure('ORIGINAL_WORKSPACE_UNAVAILABLE')
    }
    const configured = readIntegrationConfig().uar.instances.find((item) => item.id === inventoryId && item.enabled)
    if (!configured) throw failure('ORIGINAL_INVENTORY_UNAVAILABLE')
    const sidecar = application.get('UarSidecarService')
    const endpoint = await sidecar.resolveInstance(inventoryId).catch(() => {
      throw failure('ORIGINAL_RUNTIME_UNAVAILABLE')
    })
    if (original) {
      const binding = original.effectiveBinding
      if (
        endpoint.observed.id !== original.selectedInstanceId ||
        binding.instance_id !== original.selectedInstanceId ||
        !sameEndpoints(endpoint.observed.endpoints, binding.endpoints) ||
        endpoint.observed.profile !== binding.profile ||
        configured.workspaceLocation !== binding.workspace_locality ||
        !binding.capabilities.every((capability) => endpoint.capabilities.includes(capability))
      )
        throw failure('ORIGINAL_IDENTITY_ENDPOINT_PLACEMENT_MISMATCH')
    }
    let grant: PrivateUarAuthorization['grant'] = null,
      bearer: string
    if (endpoint.ownership === 'managed') {
      const response = await sidecar.requestInstance(
        endpoint,
        '/api/uar/delegation-grants',
        uarPrincipalForSession('bossfang'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_ids: [workspaceId], operations })
        }
      )
      if (!response.ok) throw failure(`GRANT_HTTP_${response.status}`)
      grant = await decode(response, grantSchema, 'GRANT_CONTRACT_MISMATCH')
      bearer = grant.token
    } else {
      const credentials = await readUarInstanceCredentials(inventoryId)
      if (!credentials.runtimeBearer) throw failure('ORIGINAL_EXTERNAL_CREDENTIAL_REQUIRED')
      bearer = credentials.runtimeBearer
    }
    const authorization = {
      endpoint,
      inventoryId,
      workspaceId,
      bearer,
      grant,
      runtimeEpoch: grant?.runtime_epoch ?? original?.runtimeEpoch ?? null
    }
    this.records.add(authorization)
    if (
      grant &&
      (grant.instance_id !== endpoint.observed.id ||
        grant.principal !== uarPrincipalForSession('bossfang') ||
        grant.workspace_ids.length !== 1 ||
        grant.workspace_ids[0] !== workspaceId ||
        grant.operations.length !== operations.length ||
        !operations.every((operation) => grant.operations.includes(operation)) ||
        (original && grant.runtime_epoch !== original.runtimeEpoch))
    ) {
      await this.revoke(authorization)
      throw failure('ORIGINAL_GRANT_IDENTITY_SCOPE_EPOCH_MISMATCH')
    }
    return authorization
  }
  instance(authorization: PrivateUarAuthorization, original?: OriginalConnection) {
    const configured = readIntegrationConfig().uar.instances.find(
      (item) => item.id === authorization.inventoryId && item.enabled
    )
    if (!configured) throw failure('ORIGINAL_INVENTORY_UNAVAILABLE')
    const binding = original?.effectiveBinding
    return {
      id: authorization.endpoint.observed.id,
      ownership: binding?.ownership ?? 'external',
      endpoints: binding?.endpoints ?? authorization.endpoint.observed.endpoints,
      workspace_locality: binding?.workspace_locality ?? configured.workspaceLocation,
      workspace: binding?.workspace ?? null,
      credential_ref: binding?.credential_ref ?? null,
      credential_refs: {},
      profile: binding?.profile ?? authorization.endpoint.observed.profile,
      capabilities: binding?.capabilities ?? [...authorization.endpoint.capabilities],
      required_profile: configured.profile,
      required_capabilities: configured.requiredCapabilities
    }
  }
  private matches(authorization: PrivateUarAuthorization, run: OriginalConnection) {
    return (
      authorization.workspaceId === run.workspaceId &&
      authorization.endpoint.observed.id === run.selectedInstanceId &&
      sameEndpoints(authorization.endpoint.observed.endpoints, run.effectiveBinding.endpoints) &&
      authorization.endpoint.observed.profile === run.effectiveBinding.profile &&
      (!authorization.runtimeEpoch || authorization.runtimeEpoch === run.runtimeEpoch)
    )
  }
  private async snapshot() {
    const response = await this.request('/api/uar/connections')
    if (!response.ok) throw failure(`RETAINED_INVENTORY_HTTP_${response.status}`)
    return (await decode(response, connectionsSchema, 'RETAINED_CONNECTION_CONTRACT_MISMATCH')).connections.filter(
      active
    )
  }
  async refresh(selected: PrivateUarAuthorization | null) {
    const runs = await this.snapshot()
    const groups = new Map<string, OriginalConnection[]>()
    for (const run of runs) {
      const key = JSON.stringify([run.selectedInstanceId, run.workspaceId, run.runtimeEpoch, run.effectiveBinding])
      const group = groups.get(key) ?? []
      group.push(run)
      groups.set(key, group)
    }
    for (const group of groups.values()) {
      const original = group[0]
      if (!original.runtimeEpoch) throw failure('ORIGINAL_ADMISSION_EPOCH_UNAVAILABLE')
      const existing = [...this.records].filter((record) => this.matches(record, original))
      let authorization = selected && this.matches(selected, original) ? selected : existing.at(-1)
      const configured = authorization
        ? readIntegrationConfig().uar.instances.find((item) => item.id === authorization.inventoryId && item.enabled)
        : undefined
      if (authorization && !configured) throw failure('ORIGINAL_INVENTORY_DISABLED')
      const next = authorization
        ? await application
            .get('UarSidecarService')
            .resolveInstance(authorization.inventoryId)
            .catch(() => {
              throw failure('ORIGINAL_RUNTIME_UNAVAILABLE')
            })
        : null
      const replacement =
        !authorization ||
        next?.generation !== authorization.endpoint.generation ||
        (authorization.grant && Date.parse(authorization.grant.expires_at) - Date.now() <= 60_000)
      if (replacement) {
        const candidates = readIntegrationConfig().uar.instances.filter(
          (item) =>
            item.enabled &&
            item.expectedRuntimeId === original.selectedInstanceId &&
            item.profile === original.effectiveBinding.profile &&
            item.workspaceLocation === original.effectiveBinding.workspace_locality
        )
        const inventoryId = authorization?.inventoryId ?? (candidates.length === 1 ? candidates[0].id : null)
        if (!inventoryId) throw failure('ORIGINAL_INVENTORY_MISSING_OR_AMBIGUOUS')
        authorization = await this.create(inventoryId, original.workspaceId, original)
      }
      if (!authorization) throw failure('ORIGINAL_AUTHORIZATION_UNAVAILABLE')
      if (replacement || existing.length > 1 || group.some((run) => run.credentialState === 'reattachment_required')) {
        // On partial replacement, retain both grants. A later refresh retries the original transports only.
        for (const run of group) {
          const response = await this.request('/api/uar/connections/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bossTaskId: run.bossTaskId,
              workspaceId: run.workspaceId,
              instance: this.instance(authorization, run),
              bearer: authorization.bearer
            })
          })
          if (!response.ok) throw failure(`ORIGINAL_REPLACEMENT_HTTP_${response.status}`)
          const applied = await decode(response, projectionSchema, 'ORIGINAL_REPLACEMENT_CONTRACT_MISMATCH')
          if (
            applied.bossTaskId !== run.bossTaskId ||
            applied.workspaceId !== run.workspaceId ||
            applied.selectedInstanceId !== run.selectedInstanceId ||
            applied.runtimeEpoch !== run.runtimeEpoch ||
            JSON.stringify(applied.effectiveBinding) !== JSON.stringify(run.effectiveBinding)
          )
            throw failure('ORIGINAL_REPLACEMENT_BINDING_MISMATCH')
        }
        for (const old of existing) if (old !== authorization && old !== selected) await this.revoke(old)
      }
    }
    for (const authorization of [...this.records])
      if (authorization !== selected && !runs.some((run) => this.matches(authorization, run)))
        await this.revoke(authorization)
  }
  async revoke(authorization: PrivateUarAuthorization) {
    const grant = authorization.grant
    if (grant) {
      const response = application
        .get('UarSidecarService')
        .requestInstanceCurrent(
          authorization.endpoint,
          `/api/uar/delegation-grants/${encodeURIComponent(grant.id)}`,
          uarPrincipalForSession('bossfang'),
          { method: 'DELETE' }
        )
      if (response) {
        try {
          if (!(await response).ok)
            this.log(`${t('bossfang.retainedAuthentication')} [GRANT_REVOCATION_REFUSED_BOUNDED_EXPIRY]`)
        } catch {
          this.log(`${t('bossfang.retainedAuthentication')} [GRANT_REVOCATION_UNAVAILABLE_BOUNDED_EXPIRY]`)
        }
      }
    }
    this.records.delete(authorization)
  }
  async shutdown() {
    for (const authorization of [...this.records]) await this.revoke(authorization)
  }
  redact(text: string) {
    for (const authorization of this.records) text = text.split(authorization.bearer).join('<redacted>')
    return text
  }
}
