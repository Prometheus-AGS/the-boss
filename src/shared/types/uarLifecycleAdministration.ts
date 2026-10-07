import * as z from 'zod'

import type {
  UarAdministrationSnapshot,
  UarAgentCatalogItem,
  UarApprovalLifecycleInspection
} from './prometheusIntegration'
import type { UarDurableWorkspaceSnapshot } from './uarDurableAdministration'
import type { UarExecutionOwnerSnapshot } from './uarTeamProfiles'
import type { UarTeamExecutionSummary, UarTeamsSnapshot } from './uarTeams'
import type { UarWorkflowsSnapshot } from './uarWorkflows'

export const uarLifecycleSelectorSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    serviceInstanceId: z.string().min(1).max(128).optional()
  })
  .strict()

export type UarLifecycleSelector = z.infer<typeof uarLifecycleSelectorSchema>

export interface UarLifecycleSource<TData> {
  state: 'available' | 'unsupported' | 'unknown' | 'failed'
  scope: 'runtime' | 'workspace'
  readAt: string | null
  reason?: string
  data: TData | null
}

export interface UarLifecycleSnapshot {
  schemaVersion: 1
  requested: { serviceInstanceId: string | null; workspaceId: string }
  effective: {
    serviceInstanceId: string
    runtimeId: string
    ownership: 'managed' | 'external'
    workspaceId: string
    generation: number
    uarVersion: string
  }
  captureStartedAt: string
  capturedAt: string
  consistency: 'non-atomic'
  administration: UarAdministrationSnapshot
  agents: UarLifecycleSource<UarAgentCatalogItem[]>
  durable: UarLifecycleSource<UarDurableWorkspaceSnapshot>
  teams: UarLifecycleSource<UarTeamsSnapshot>
  workflows: UarLifecycleSource<UarWorkflowsSnapshot>
  ownership: UarLifecycleSource<UarExecutionOwnerSnapshot>
  approvals: UarLifecycleSource<UarApprovalLifecycleInspection[]>
  executions: Array<UarLifecycleSource<UarTeamExecutionSummary> & { teamInstanceId: string }>
}
