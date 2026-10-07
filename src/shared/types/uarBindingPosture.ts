export type UarBindingDisposition = 'exact' | 'translated' | 'optional-unsupported' | 'required-unsupported'

/** Public receipt metadata only; private settings, grants and credentials are excluded. */
export interface UarBindingPosture {
  profile: string
  id: string
  revision: number
  contentDigest: string
  bindingRef: { id: string; revision: number; digest: string }
  package: { id: string; version: string; digest: string }
  policyRevision: string
  runtimeCapabilities: string[]
  admitted: boolean
  createdAt: string
  resolvedModels: Array<{
    role: string | null
    requestedAlias: string | null
    providerId: string | null
    modelId: string | null
    profile: { id: string; revision: number } | null
    settingsRevision: number | null
  }>
  serviceBinding?: {
    instanceId: string
    profile: string
    workspaceLocation: 'local' | 'remote'
    capabilities: string[]
    intent: 'new' | 'reattach' | 'migrate'
    bindingId?: string
    bindingRevision?: number
  } | null
  diagnostics: Array<{
    pointer: string
    disposition: UarBindingDisposition
    reasonCode: string
    message: string
  }>
}

export interface UarBindingPreflightDiagnostic {
  field: string
  disposition: UarBindingDisposition
  message: string
}
