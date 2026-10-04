import * as z from 'zod'

export const UAR_WORKFLOW_EXECUTION_CAPABILITY = 'prometheus.workflow-execution/1.0.0'

const identity = z.object({ id: z.string(), version: z.string(), digest: z.string() })
const selector = z.string().min(1).max(256)
const revision = z.number().int().nonnegative()
const reservation = z
  .object({
    tokens: z.number().int().positive(),
    costMicrounits: z.number().int().nonnegative(),
    elapsedSeconds: z.number().int().positive()
  })
  .strict()

export const uarWorkflowWorkspaceSchema = z.object({ workspaceId: selector }).strict()
export const uarWorkflowSelectorSchema = uarWorkflowWorkspaceSchema.extend({ runId: selector })
export const uarWorkflowStartSchema = uarWorkflowWorkspaceSchema.extend({
  commandId: z.uuid(),
  workflowDefinition: identity.strict(),
  teamId: selector,
  expectedTeamRevision: revision,
  expectedBindingRevision: revision,
  input: z.object({ feedback: z.string().min(1) }).strict(),
  steps: z.tuple([
    z.object({ stepId: z.literal('classify'), memberId: selector, reservation }).strict(),
    z.object({ stepId: z.literal('draft'), memberId: selector, reservation }).strict()
  ])
})
export const uarWorkflowDecisionSchema = uarWorkflowSelectorSchema.extend({
  commandId: z.uuid(),
  expectedRunRevision: revision,
  waitId: selector,
  decision: z.enum(['accept', 'reject', 'cancel']),
  artifactId: selector,
  artifactDigest: z.string().min(1).max(256)
})
export const uarWorkflowControlSchema = uarWorkflowSelectorSchema.extend({
  commandId: z.uuid(),
  expectedRunRevision: revision,
  reason: z.string().min(1).max(512)
})

export type UarWorkflowStartInput = z.infer<typeof uarWorkflowStartSchema>
export type UarWorkflowSelector = z.infer<typeof uarWorkflowSelectorSchema>
export type UarWorkflowDecisionInput = z.infer<typeof uarWorkflowDecisionSchema>
export type UarWorkflowControlInput = z.infer<typeof uarWorkflowControlSchema>

const usage = z.object({ tokens: revision, costMicrounits: revision, elapsedSeconds: revision })
const compiledStep = z.object({
  id: z.string(),
  role: z.string(),
  instructions: z.string(),
  inputMapping: z.record(z.string(), z.string()),
  output: z.unknown()
})
export const uarWorkflowDefinitionSchema = z.object({
  identity,
  package: identity,
  title: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  steps: z.array(compiledStep),
  supported: z.boolean(),
  diagnostics: z.array(z.object({ field: z.string(), code: z.string(), message: z.string() }))
})
const artifact = z.object({ id: z.string(), digest: z.string(), content: z.unknown(), attemptId: z.string() })
export const uarWorkflowRunSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  workspaceId: z.string(),
  revision,
  status: z.enum([
    'ready',
    'running',
    'awaiting_decision',
    'reconciling',
    'cancellation_requested',
    'accepted',
    'rejected',
    'cancelled',
    'failed'
  ]),
  definition: identity,
  package: identity,
  definitionSnapshot: z.unknown(),
  plan: z.object({
    interpretationVersion: z.string(),
    digest: z.string(),
    input: z.unknown(),
    output: z.unknown(),
    steps: z.array(compiledStep),
    maxActivations: revision
  }),
  teamId: z.string(),
  teamDefinition: identity,
  binding: z.object({ id: z.string(), revision }),
  input: z.unknown(),
  steps: z.array(
    z.object({
      stepId: z.string(),
      taskId: z.string(),
      memberId: z.string(),
      memberRevision: revision,
      memberDefinition: identity,
      reservation: usage,
      status: z.string(),
      attemptId: z.string().nullable(),
      artifact: artifact.nullable()
    })
  ),
  wait: z
    .object({
      id: z.string(),
      artifactId: z.string(),
      artifactDigest: z.string(),
      decisions: z.array(z.enum(['accept', 'reject', 'cancel'])),
      createdAt: z.string()
    })
    .nullable(),
  decision: z
    .object({
      id: z.string(),
      commandId: z.string(),
      waitId: z.string(),
      decision: z.enum(['accept', 'reject', 'cancel']),
      artifactId: z.string(),
      artifactDigest: z.string(),
      runRevision: revision,
      committedAt: z.string()
    })
    .nullable(),
  stateReason: z.string().nullable(),
  accounting: z.object({ committed: usage, reserved: usage, unresolvedAttemptIds: z.array(z.string()) }),
  createdAt: z.string(),
  updatedAt: z.string()
})
export const uarWorkflowsSnapshotSchema = z.object({
  workspaceId: z.string(),
  available: z.boolean(),
  stage: z.enum(['operation', 'unqualified', 'qualified']),
  definitions: z.array(uarWorkflowDefinitionSchema),
  runs: z.array(uarWorkflowRunSchema)
})
export type UarWorkflowDefinition = z.infer<typeof uarWorkflowDefinitionSchema>
export type UarWorkflowRun = z.infer<typeof uarWorkflowRunSchema>
export type UarWorkflowsSnapshot = z.infer<typeof uarWorkflowsSnapshotSchema>
