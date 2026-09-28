export interface UarTeamIdentity {
  id: string
  version: string
  digest: string
}

export interface UarTeamDefinition extends UarTeamIdentity {
  title: string
  purpose: string
  package: UarTeamIdentity
  members: Array<{
    role: string
    kind: 'agent' | 'team'
    min: number
    max: number
    definition: UarTeamIdentity
  }>
}

export interface UarTeamBinding {
  id: string
  workspaceId: string
  revision: number
  activationSupported: boolean
  package: UarTeamIdentity
}

export interface UarTeamTask {
  id: string
  title: string
  role: string
  input: unknown
  outputContract: unknown
  output: null
  dependsOn: string[]
  status: 'queued'
  revision: number
  createdAt: string
  updatedAt: string
}

export interface UarTeamInstance {
  id: string
  ownerId: string
  workspaceId: string
  revision: number
  status: 'inactive'
  definition: UarTeamIdentity
  package: UarTeamIdentity
  binding: { id: string; revision: number }
  input: unknown
  members: Array<{
    id: string
    role: string
    ordinal: number
    definition: UarTeamIdentity
    revision: number
    status: 'inactive'
  }>
  tasks: UarTeamTask[]
  createdAt: string
  updatedAt: string
}

export interface UarTeamsSnapshot {
  schemaVersion: 1
  workspaceId: string
  generation: number
  capabilities: { planning: boolean }
  unavailableReason?: string
  definitions: UarTeamDefinition[]
  bindings: UarTeamBinding[]
  instances: UarTeamInstance[]
}

export interface UarCreateTeamInput {
  workspaceId: string
  commandId: string
  deploymentBindingId: string
  teamDefinition: UarTeamIdentity
  input: unknown
  memberSlots?: Array<{ role: string; count: number }>
}

export interface UarAddTeamTaskInput {
  workspaceId: string
  teamInstanceId: string
  commandId: string
  taskId: string
  expectedTeamRevision: number
  title: string
  role: string
  input: unknown
  outputContract: unknown
  dependsOn: string[]
}
