import * as z from 'zod'

// This is a disclosure whitelist. Zod strips all non-public receipt fields,
// including requested/effective blobs, credentials, grants, settings and endpoints.
const revision = z.number().int().nonnegative()
const identity = z.object({ id: z.string(), version: z.string(), digest: z.string() })
const disposition = z.enum(['exact', 'translated', 'optional-unsupported', 'required-unsupported'])
const posture = z.object({
  profile: z.string(),
  id: z.string(),
  revision,
  contentDigest: z.string(),
  bindingRef: z.object({ id: z.string(), revision, digest: z.string() }),
  package: identity,
  policyRevision: z.string(),
  runtimeCapabilities: z.array(z.string()),
  admitted: z.boolean(),
  createdAt: z.string(),
  resolvedModels: z.array(
    z.object({
      role: z.string().nullable(),
      requestedAlias: z.string().nullable(),
      providerId: z.string().nullable(),
      modelId: z.string().nullable(),
      profile: z.object({ id: z.string(), revision }).nullable(),
      settingsRevision: revision.nullable()
    })
  ),
  serviceBinding: z
    .object({
      instanceId: z.string(),
      profile: z.string(),
      workspaceLocation: z.enum(['local', 'remote']),
      capabilities: z.array(z.string()),
      intent: z.enum(['new', 'reattach', 'migrate']),
      bindingId: z.string().optional(),
      bindingRevision: revision.optional()
    })
    .nullable()
    .optional(),
  diagnostics: z.array(
    z.object({ pointer: z.string(), disposition, reasonCode: z.string(), message: z.string() })
  )
})

export const rawBinding = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    revision,
    activationSupported: z.boolean(),
    package: identity,
    preflightDiagnostics: z.array(z.object({ field: z.string(), disposition, message: z.string() })).optional(),
    effectiveBindingReceipt: posture.nullable().optional()
  })
  .transform(({ effectiveBindingReceipt, ...binding }) => ({
    ...binding,
    ...(effectiveBindingReceipt === undefined ? {} : { posture: effectiveBindingReceipt })
  }))
