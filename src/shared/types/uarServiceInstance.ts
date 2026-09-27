import * as z from 'zod'

const endpointSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
  }, 'HTTP or HTTPS endpoint without embedded credentials required')

export const MANAGED_UAR_INSTANCE_ID = 'managed-local'
export const UAR_EXECUTION_PROFILE = 'uar.service-instance/1'

export const uarInstanceEndpointRolesSchema = z
  .object({
    runtime: endpointSchema,
    administration: endpointSchema,
    models: endpointSchema,
    console: endpointSchema.nullable()
  })
  .strict()

export const uarRuntimeInstanceSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/)
      .max(128),
    name: z.string().trim().min(1).max(160),
    enabled: z.boolean().default(true),
    ownership: z.enum(['managed', 'external']),
    expectedRuntimeId: z.string().trim().min(1).max(256),
    profile: z.string().trim().min(1).max(128).default(UAR_EXECUTION_PROFILE),
    minimumVersion: z.string().trim().max(64).default(''),
    workspaceLocation: z.enum(['local', 'remote']).default('local'),
    workspaceRoots: z.array(z.string().trim().min(1)).max(128).default([]),
    requiredCapabilities: z.array(z.string().trim().min(1).max(128)).max(128).default([]),
    endpoints: uarInstanceEndpointRolesSchema,
    runtimeCredentialRef: z
      .string()
      .regex(/^uar-instance:\/\/[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/)
      .max(256)
      .optional(),
    adminCredentialRef: z
      .string()
      .regex(/^uar-instance:\/\/[a-zA-Z0-9][a-zA-Z0-9_.:-]*\/admin$/)
      .max(264)
      .optional()
  })
  .strict()
  .superRefine((instance, context) => {
    if (instance.ownership === 'managed' && instance.id !== MANAGED_UAR_INSTANCE_ID) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Only the built-in local instance may be managed' })
    }
    if (instance.ownership === 'external' && (!instance.runtimeCredentialRef || !instance.adminCredentialRef)) {
      context.addIssue({
        code: 'custom',
        path: ['runtimeCredentialRef'],
        message: 'External instances need separate runtime and administration credential references'
      })
    }
    if (
      instance.ownership === 'external' &&
      (instance.runtimeCredentialRef !== `uar-instance://${instance.id}` ||
        instance.adminCredentialRef !== `uar-instance://${instance.id}/admin`)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['runtimeCredentialRef'],
        message: 'External credential references must match the stable instance id'
      })
    }
    if (instance.ownership === 'managed' && (instance.runtimeCredentialRef || instance.adminCredentialRef)) {
      context.addIssue({
        code: 'custom',
        path: ['runtimeCredentialRef'],
        message: 'Managed credentials are supervisor-owned'
      })
    }
    if (instance.ownership === 'external') {
      for (const [role, endpoint] of Object.entries(instance.endpoints)) {
        if (!endpoint) continue
        const url = new URL(endpoint)
        if (url.protocol !== 'https:' && !['127.0.0.1', '::1', 'localhost'].includes(url.hostname)) {
          context.addIssue({
            code: 'custom',
            path: ['endpoints', role],
            message: 'External UAR endpoints require HTTPS unless they use a loopback host'
          })
        }
      }
    }
  })

export type UarRuntimeInstance = z.infer<typeof uarRuntimeInstanceSchema>

export function managedUarRuntimeInstance(port = 1906): UarRuntimeInstance {
  const endpoint = `http://127.0.0.1:${port}`
  return {
    id: MANAGED_UAR_INSTANCE_ID,
    name: 'The Boss managed UAR',
    enabled: true,
    ownership: 'managed',
    expectedRuntimeId: MANAGED_UAR_INSTANCE_ID,
    profile: UAR_EXECUTION_PROFILE,
    minimumVersion: '',
    workspaceLocation: 'local',
    workspaceRoots: [],
    requiredCapabilities: [],
    endpoints: { runtime: endpoint, administration: endpoint, models: endpoint, console: null }
  }
}

export const uarInstanceCredentialMutationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('unchanged') }).strict(),
  z.object({ operation: z.literal('set'), value: z.string().min(1).max(16384) }).strict(),
  z.object({ operation: z.literal('clear') }).strict()
])
export type UarInstanceCredentialMutation = z.infer<typeof uarInstanceCredentialMutationSchema>

export const uarInstanceSaveSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    instance: uarRuntimeInstanceSchema,
    runtimeCredential: uarInstanceCredentialMutationSchema,
    adminCredential: uarInstanceCredentialMutationSchema
  })
  .strict()

export const uarInstanceDeleteSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    instanceId: z.string().min(1).max(128)
  })
  .strict()

export const uarInstanceSelectSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    instanceId: z.string().min(1).max(128)
  })
  .strict()

export type UarInstanceCompatibilityState =
  | 'configured'
  | 'unreachable'
  | 'unauthenticated'
  | 'incompatible'
  | 'operational'

export type UarObservedInstance = {
  id: string
  profile: string
  version: string
  workspaceLocation: 'local' | 'remote'
  capabilities: string[]
  endpoints: z.infer<typeof uarInstanceEndpointRolesSchema>
  ownership: 'managed' | 'external'
  references: { lifecycleOwner: string | null; credential: string | null; workspace: string | null }
  placement: { new: boolean; reattach: boolean; migrate: boolean }
}

export type UarInstanceInventoryEntry = UarRuntimeInstance & {
  credentialConfigured: boolean
  runtimeCredentialConfigured: boolean
  adminCredentialConfigured: boolean
  selected: boolean
  boundSessions: number
  compatibility: UarInstanceCompatibilityState
  checks: {
    configured: true
    reachable: boolean | null
    authenticated: boolean | null
    compatible: boolean | null
    operational: boolean
  }
  observed?: UarObservedInstance
  diagnostic?: string
}

export type UarInstanceInventorySnapshot = {
  schemaVersion: 1
  revision: number
  selectedInstanceId: string
  instances: UarInstanceInventoryEntry[]
  migration: { supported: false; reason: string }
}

export type UarSessionPlacement = {
  version: 1
  instanceId: string
  nativeSessionId: string
  bindingId?: string
  bindingRevision?: number
  sourceRunId?: string
}
