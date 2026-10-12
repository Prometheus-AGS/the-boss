import { Mutex } from 'async-mutex'
import * as z from 'zod'

import { application } from '@application'
import { rawBinding } from '@main/ai/runtime/uar/uarBindingPosture'
import { createAuthenticatedHostCallback } from '@main/ai/runtime/uar/UarHostMcpBridge'
import { uarPrincipalForSession } from '@main/ai/runtime/uar/uarPrincipal'
import { t } from '@main/i18n'
import { bossFangDelegatedIdentitySchema } from '@shared/types/bossFangDelegatedApproval'

import { DelegatedHostContext } from './DelegatedHostContext'
import type { PrivateUarAuthorization } from './retainedAuthorizations'

const requestSchema = z
  .object({
    version: z.literal(1),
    agentId: z.string().uuid(),
    deploymentBindingId: z.string(),
    bindingRevision: z.number().int(),
    definition: bossFangDelegatedIdentitySchema,
    model: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    workspaceId: z.string()
  })
  .strict()
const savedTargetSchema = z.object({
  target: z.object({
    instanceId: z.string(),
    workspaceId: z.string(),
    bindingId: z.string(),
    bindingRevision: z.number().int(),
    definition: bossFangDelegatedIdentitySchema,
    modelOverride: z.string().nullish()
  })
})
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const failure = (code: string) => new Error(`${t('bossfang.retainedAuthentication')} [${code}]`)

/** Per-connection host authority, never exposed to the dashboard or model arguments. */
export async function createDelegatedHostContextResolver(
  authorization: PrivateUarAuthorization,
  request: (path: string, init?: RequestInit) => Promise<Response>
) {
  const mutex = new Mutex()
  return createAuthenticatedHostCallback(
    (body) =>
      mutex.runExclusive(async () => {
        const input = requestSchema.parse(body)
        if (
          input.workspaceId !== authorization.workspaceId ||
          !authorization.grant ||
          Date.parse(authorization.grant.expires_at) <= Date.now()
        )
          throw failure('DELEGATED_CONTEXT_SCOPE_EXPIRED')
        const sidecar = application.get('UarSidecarService')
        const current = await sidecar.resolveInstance(authorization.inventoryId)
        if (
          current.generation !== authorization.endpoint.generation ||
          current.observed.id !== authorization.endpoint.observed.id
        )
          throw failure('DELEGATED_CONTEXT_RUNTIME_CHANGED')

        // Native chat requests cannot use this host credential to select another agent's resources.
        const response = await request('/api/agents/' + encodeURIComponent(input.agentId) + '/uar-target')
        if (!response.ok) throw failure('DELEGATED_CONTEXT_SAVED_TARGET_UNAVAILABLE')
        const { target } = savedTargetSchema.parse(await response.json())
        if (
          target.instanceId !== authorization.endpoint.observed.id ||
          target.workspaceId !== input.workspaceId ||
          target.bindingId !== input.deploymentBindingId ||
          target.bindingRevision !== input.bindingRevision ||
          !same(target.definition, input.definition) ||
          (target.modelOverride ?? undefined) !== input.model
        )
          throw failure('DELEGATED_CONTEXT_SAVED_TARGET_MISMATCH')

        const existing = authorization.contexts.find(
          (context) =>
            context.safe.binding.id === input.deploymentBindingId &&
            context.safe.binding.revision === input.bindingRevision &&
            same(context.safe.definition, input.definition) &&
            context.safe.model === input.model
        )
        if (existing) return existing.safe

        const catalog = await sidecar.requestInstance(
          authorization.endpoint,
          '/api/v1/collaboration/deployment-bindings',
          uarPrincipalForSession('bossfang'),
          {
            headers: { 'x-uar-workspace-id': authorization.workspaceId }
          }
        )
        if (!catalog.ok) throw failure('DELEGATED_CONTEXT_CATALOG_UNAVAILABLE')
        const binding = z
          .array(rawBinding)
          .parse(await catalog.json())
          .find(
            (item) =>
              item.id === input.deploymentBindingId &&
              item.workspaceId === authorization.workspaceId &&
              item.revision === input.bindingRevision &&
              item.activationSupported &&
              same(item.package, input.definition)
          )
        if (!binding) throw failure('DELEGATED_CONTEXT_BINDING_CHANGED')
        const context = await DelegatedHostContext.create(authorization, binding, input.model)
        authorization.contexts.push(context)
        return context.safe
      }),
    '/delegated-host-context'
  )
}
