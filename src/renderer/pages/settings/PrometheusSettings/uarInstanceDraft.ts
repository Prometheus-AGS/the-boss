import { UAR_EXECUTION_PROFILE, type UarRuntimeInstance } from '@shared/types/uarServiceInstance'

export const DISCOVERED_UAR_ORIGIN = 'http://127.0.0.1:1906'

export function emptyUarInstanceDraft() {
  return {
    id: '',
    name: '',
    enabled: true,
    expectedRuntimeId: '',
    profile: UAR_EXECUTION_PROFILE,
    minimumVersion: '',
    workspaceLocation: 'local' as UarRuntimeInstance['workspaceLocation'],
    workspaceRoots: '',
    requiredCapabilities: '',
    runtime: '',
    administration: '',
    models: '',
    console: '',
    runtimeCredential: '',
    adminCredential: ''
  }
}

export function editUarInstanceDraft(instance: UarRuntimeInstance): ReturnType<typeof emptyUarInstanceDraft> {
  return {
    ...emptyUarInstanceDraft(),
    id: instance.id,
    name: instance.name,
    enabled: instance.enabled,
    expectedRuntimeId: instance.expectedRuntimeId,
    profile: instance.profile,
    minimumVersion: instance.minimumVersion,
    workspaceLocation: instance.workspaceLocation,
    workspaceRoots: instance.workspaceRoots.join('\n'),
    requiredCapabilities: instance.requiredCapabilities.join(', '),
    runtime: instance.endpoints.runtime,
    administration: instance.endpoints.administration,
    models: instance.endpoints.models,
    console: instance.endpoints.console ?? ''
  }
}

export function discoveredUarInstanceDraft(
  instances: readonly UarRuntimeInstance[],
  name: string
): ReturnType<typeof emptyUarInstanceDraft> {
  const existing = instances.find(
    (instance) =>
      instance.ownership === 'external' && new URL(instance.endpoints.runtime).origin === DISCOVERED_UAR_ORIGIN
  )
  if (existing) return { ...editUarInstanceDraft(existing), enabled: true }

  let id = 'local-existing'
  for (let suffix = 2; instances.some((instance) => instance.id === id); suffix++) {
    id = `local-existing-${suffix}`
  }
  return {
    ...emptyUarInstanceDraft(),
    id,
    name,
    workspaceLocation: 'remote',
    runtime: DISCOVERED_UAR_ORIGIN,
    administration: `${DISCOVERED_UAR_ORIGIN}/api/uar`,
    models: `${DISCOVERED_UAR_ORIGIN}/v1`,
    console: `${DISCOVERED_UAR_ORIGIN}/admin`
  }
}
