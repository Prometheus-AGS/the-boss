import * as z from 'zod'

import {
  UAR_WORKFLOW_EXECUTION_CAPABILITY,
  uarWorkflowDefinitionSchema,
  uarWorkflowRunSchema,
  type UarWorkflowControlInput,
  type UarWorkflowDecisionInput,
  type UarWorkflowRun,
  type UarWorkflowSelector,
  type UarWorkflowStartInput,
  type UarWorkflowsSnapshot
} from '@shared/types/uarWorkflows'

import { capabilityState, scopedRequest, workspace } from './UarDurableAdministrationAdapter'
import { scopedTeam } from './UarTeamsAdministrationAdapter'
import type { UarSidecarEndpoint } from './UarSidecarService'

const base = '/api/v1/collaboration'

async function workflowState(workspaceId: string, endpoint?: UarSidecarEndpoint) {
  const resolved = workspace(workspaceId)
  const { generation } = await capabilityState(endpoint)
  const capabilities = z
    .object({
      collaboration: z.object({
        workflowExecution: z
          .object({
            capability: z.string(),
            interpretationVersion: z.string(),
            stage: z.enum(['operation', 'unqualified', 'qualified']),
            available: z.boolean(),
            qualified: z.boolean()
          })
          .optional()
      })
    })
    .parse(await scopedRequest(resolved, base + '/capabilities', generation, 'GET', undefined, endpoint))
  const workflow = capabilities.collaboration.workflowExecution
  return {
    workspaceId: resolved,
    generation,
    stage: workflow?.stage ?? ('unqualified' as const),
    available:
      workflow?.available === true &&
      workflow.capability === UAR_WORKFLOW_EXECUTION_CAPABILITY &&
      workflow.interpretationVersion === '1.0.0'
  }
}

function scopedRun(value: unknown, workspaceId: string, runId?: string): UarWorkflowRun {
  const run = uarWorkflowRunSchema.parse(value)
  if (run.workspaceId !== workspaceId || (runId !== undefined && run.id !== runId)) {
    throw new Error('WORKFLOW_SCOPE_DENIED')
  }
  const wait = run.wait
  if (
    wait &&
    !run.steps.some((step) => step.artifact?.id === wait.artifactId && step.artifact?.digest === wait.artifactDigest)
  ) {
    throw new Error('WORKFLOW_ARTIFACT_MISMATCH')
  }
  return run
}

export async function readUarWorkflows(
  workspaceId: string,
  endpoint?: UarSidecarEndpoint
): Promise<UarWorkflowsSnapshot> {
  const state = await workflowState(workspaceId, endpoint)
  // Native catalog and retained-run reads are independent of launch qualification.
  const [definitions, runs] = await Promise.all([
    scopedRequest(state.workspaceId, base + '/workflow-definitions', state.generation, 'GET', undefined, endpoint),
    scopedRequest(state.workspaceId, base + '/workflow-runs', state.generation, 'GET', undefined, endpoint)
  ])
  return {
    ...state,
    definitions: z.array(uarWorkflowDefinitionSchema).parse(definitions),
    runs: z
      .array(z.unknown())
      .parse(runs)
      .map((value) => scopedRun(value, state.workspaceId))
  }
}

export async function readUarWorkflow(input: UarWorkflowSelector): Promise<UarWorkflowRun> {
  const state = await workflowState(input.workspaceId)
  return scopedRun(
    await scopedRequest(
      state.workspaceId,
      base + '/workflow-runs/' + encodeURIComponent(input.runId),
      state.generation
    ),
    state.workspaceId,
    input.runId
  )
}

export async function startUarWorkflow(input: UarWorkflowStartInput): Promise<UarWorkflowRun> {
  const state = await workflowState(input.workspaceId)
  if (!state.available) throw new Error('WORKFLOW_UNAVAILABLE')
  const team = scopedTeam(
    await scopedRequest(
      state.workspaceId,
      base + '/team-instances/' + encodeURIComponent(input.teamId),
      state.generation
    ),
    state.workspaceId
  )
  if (team.id !== input.teamId) throw new Error('WORKFLOW_SCOPE_DENIED')
  const { workspaceId: _workspaceId, ...payload } = input
  void _workspaceId
  const run = scopedRun(
    await scopedRequest(state.workspaceId, base + '/workflow-runs', state.generation, 'POST', payload),
    state.workspaceId
  )
  if (run.teamId !== team.id || run.ownerId !== team.ownerId) throw new Error('WORKFLOW_SCOPE_DENIED')
  return run
}

async function controlWorkflow(
  input: UarWorkflowDecisionInput | UarWorkflowControlInput,
  action: 'decide' | 'cancel' | 'recover'
) {
  const state = await workflowState(input.workspaceId)
  if (!state.available) throw new Error('WORKFLOW_UNAVAILABLE')
  const path = base + '/workflow-runs/' + encodeURIComponent(input.runId)
  const previous = scopedRun(
    await scopedRequest(state.workspaceId, path, state.generation),
    state.workspaceId,
    input.runId
  )
  const { workspaceId: _workspaceId, runId: _runId, ...payload } = input
  void _workspaceId
  void _runId
  const run = scopedRun(
    await scopedRequest(state.workspaceId, path + '/' + action, state.generation, 'POST', payload),
    state.workspaceId,
    input.runId
  )
  if (run.ownerId !== previous.ownerId || run.teamId !== previous.teamId) throw new Error('WORKFLOW_SCOPE_DENIED')
  return run
}

export const decideUarWorkflow = (input: UarWorkflowDecisionInput) => controlWorkflow(input, 'decide')
export const cancelUarWorkflow = (input: UarWorkflowControlInput) => controlWorkflow(input, 'cancel')
export const recoverUarWorkflow = (input: UarWorkflowControlInput) => controlWorkflow(input, 'recover')
