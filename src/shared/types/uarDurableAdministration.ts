export type UarInstanceProfile = 'request' | 'on_demand' | 'resident'
export type UarInstanceAction = 'activate' | 'passivate' | 'drain' | 'disable' | 'restart' | 'cancel'
export type UarObserverAction = 'pause' | 'resume'

export interface UarDurableBinding {
  id: string
  revision: number
  activationSupported: boolean
}

export interface UarDurableInstance {
  instanceId: string
  workspaceId: string
  definitionId: string
  definitionVersion: string
  bindingId: string
  bindingRevision: number
  profile: UarInstanceProfile
  lifecycle: 'dormant' | 'active' | 'draining' | 'disabled' | 'failed'
  recovery: 'ready' | 'pending_reconciliation' | 'effect_uncertain'
  revision: number
  epoch: number
  queueDepth: number
  activeRunId: string | null
  activeCommandId: string | null
  restartAttempts: number
  lastErrorCode: string | null
  nextEventSequence: number
  commands: Array<{
    commandId: string
    kind: 'turn' | UarInstanceAction
    status: 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'uncertain'
  }>
}

export interface UarDurableObserver {
  subscriptionId: string
  workspaceId: string
  observerInstanceId: string
  sourceInstanceIds: string[]
  conversationIds: string[] | null
  revision: number
  paused: boolean
  revoked: boolean
  gaps: Array<{
    sourceInstanceId: string
    missingFrom: number
    missingThrough: number
    detectedAt: string
    acknowledgedAt: string | null
  }>
  sources: Array<{
    sourceInstanceId: string
    cursor: number | null
    retainedLow: number | null
    sourceHigh: number | null
  }>
  backlogDepth: number
  deadLetterCount: number
  recoveryActions: string[]
}

export type UarDurableOperation =
  | 'starter.setup'
  | 'collaboration.capabilities'
  | 'collaboration.packages.list'
  | 'collaboration.packages.preflight'
  | 'collaboration.packages.install'
  | 'collaboration.deployment_bindings.preflight'
  | 'collaboration.deployment_bindings.install'
  | 'collaboration.deployment_bindings.list'
  | 'agent-instances.list'
  | 'agent-instances.read'
  | 'agent-instances.create'
  | `agent-instances.${UarInstanceAction}`
  | 'observers.list'
  | 'observers.read'
  | 'observers.create'
  | `observers.${UarObserverAction}`
  | 'observers.gap.acknowledge'

export interface UarDurableWorkspaceSnapshot {
  schemaVersion: 1
  workspaceId: string
  generation: number
  capabilities: { instances: boolean; observers: boolean }
  operations: Record<UarDurableOperation, { available: boolean; reason?: string }>
  bindings: UarDurableBinding[]
  instances: UarDurableInstance[]
  observers: UarDurableObserver[]
}
