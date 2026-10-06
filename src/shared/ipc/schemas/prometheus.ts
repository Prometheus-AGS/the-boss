import * as z from 'zod'

import {
  literConfigEditSchema,
  literConfigSourceSchema,
  type LiterConfigApplyResult,
  type LiterConfigExportResult,
  type LiterConfigPreview,
  type LiterConfigSourceSelection,
  type LiterConfigSnapshot
} from '@shared/types/literConfig'
import {
  literAliasMutationSchema,
  literConnectionMutationSchema,
  literGatewaySelectionSchema,
  type LiterGatewayCatalogSnapshot
} from '@shared/types/literGateway'
import {
  literRoleMutationSchema,
  literRoleSourceSchema,
  type LiterRoleApplyResult,
  type LiterRoleDocumentSnapshot,
  type LiterRoleExportResult,
  type LiterRoleSnapshot,
  type LiterRoleSourceSelection
} from '@shared/types/literRoles'
import type { PrometheusDoctorReport, PrometheusFixOutcome, PrometheusPushState } from '@shared/types/prometheus'
import {
  integrationActionSchema,
  integrationUpdateSchema,
  secretPatchSchema,
  uarA2uiComponentSaveSchema,
  uarAgentSaveSchema,
  uarAgentRunTargetSchema,
  uarAgentSkillsSchema,
  uarArtifactSchemaSaveSchema,
  uarCompilerRequestSchema,
  uarFederatedAgentSaveSchema,
  uarPresentationSaveSchema,
  uarPresentationSelectionSchema,
  uarKnowledgeCreateSchema,
  uarKnowledgeSearchSchema,
  uarMemoryCreateSchema,
  uarProviderMutationSchema,
  uarSkillToggleSchema,
  type IntegrationOperation,
  type IntegrationOperationEvent,
  type IntegrationOperationEventPage,
  type IntegrationOperationLogExport,
  type IntegrationOperationLogPage,
  type IntegrationSnapshot,
  type WorkspaceIntegration
} from '@shared/types/prometheusIntegration'
import {
  uarSettingsNamespaceSchema,
  type UarAdministrationSnapshot,
  type UarAgentRunTarget,
  type UarCatalogSnapshot,
  type UarCompilerResult,
  type UarAuthorityDiagnosticResult,
  type UarModelSourceSnapshot,
  type UarKnowledgeSearchResult,
  type UarKnowledgeUploadResult,
  type UarOperationalSnapshot,
  type UarPresentationAdministrationSnapshot,
  type UarRunDetailSnapshot,
  type UarSettingsSnapshot,
  type UarSettingsUpdateResult
} from '@shared/types/prometheusIntegration'
import type { UarTeamApprovalHistory } from '@shared/types/uarApprovalRecords'
import {
  uarChannelObserverActionSchema,
  uarChannelSubscriptionSchema,
  uarChannelDeliveriesSchema,
  uarChannelObserversSnapshotSchema
} from '@shared/types/uarChannelObservers'
import type {
  UarDurableBinding,
  UarDurableInstance,
  UarDurableObserver,
  UarDurableWorkspaceSnapshot
} from '@shared/types/uarDurableAdministration'
import {
  uarInstanceDeleteSchema,
  uarInstanceSaveSchema,
  uarInstanceSelectSchema,
  type UarInstanceInventorySnapshot
} from '@shared/types/uarServiceInstance'
import { uarTeamContextSchema, uarTeamPeerMessagesSchema } from '@shared/types/uarTeamContext'
import type { UarExecutionOwnerSnapshot, UarExecutionReclaimReceipt } from '@shared/types/uarTeamProfiles'
import type { UarTeamRunEventsSnapshot } from '@shared/types/uarTeamRunEvents'
import {
  uarAuthoredTeamSchema,
  type UarTeamAuthoringSnapshot,
  type UarAuthoredTeamRevision,
  type UarTeamSkillCatalog
} from '@shared/types/uarTeams'
import type {
  UarTeamArtifact,
  UarTeamExecutionAttempt,
  UarTeamExecutionSummary,
  UarTeamBinding,
  UarTeamApproval,
  UarTeamInstance,
  UarTeamMailboxMessage,
  UarTeamMailboxPage,
  UarTeamsSnapshot
} from '@shared/types/uarTeams'
import {
  uarWorkflowWorkspaceSchema,
  uarWorkflowSelectorSchema,
  uarWorkflowStartSchema,
  uarWorkflowDecisionSchema,
  uarWorkflowControlSchema,
  uarWorkflowRunSchema,
  uarWorkflowsSnapshotSchema
} from '@shared/types/uarWorkflows'

import { defineRoute } from '../define'

const literRemoteEndpointSchema = z.url().refine((value) => {
  const endpoint = new URL(value)
  return /^https?:$/.test(endpoint.protocol) && !endpoint.username && !endpoint.password
})

const teamTaskCommandSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    teamInstanceId: z.string().min(1).max(256),
    taskId: z.string().min(1).max(256),
    commandId: z.uuid(),
    expectedTeamRevision: z.number().int().nonnegative(),
    expectedTaskRevision: z.number().int().nonnegative(),
    memberId: z.string().min(1).max(256)
  })
  .strict()

const teamExecutionSelectorSchema = z
  .object({
    workspaceId: z.string().min(1).max(256),
    teamInstanceId: z.string().min(1).max(256)
  })
  .strict()
const teamControlSchema = teamExecutionSelectorSchema.extend({
  commandId: z.uuid(),
  expectedTeamRevision: z.number().int().nonnegative(),
  reason: z.string().min(1).max(512)
})

/**
 * The Prometheus settings section's commands.
 *
 * Unlike the native Doctor, results come back on the response rather than through the shared
 * cache: the pack's `scripts/doctor.mjs` buffers every check and prints them together at the end,
 * so there is no partial state to stream. Adding a cache key would imply progress the underlying
 * process cannot report.
 */
export const prometheusRequestSchemas = {
  'prometheus.uar.workflows.snapshot': defineRoute({
    input: uarWorkflowWorkspaceSchema,
    output: uarWorkflowsSnapshotSchema
  }),
  'prometheus.uar.workflows.read': defineRoute({ input: uarWorkflowSelectorSchema, output: uarWorkflowRunSchema }),
  'prometheus.uar.workflows.start': defineRoute({ input: uarWorkflowStartSchema, output: uarWorkflowRunSchema }),
  'prometheus.uar.workflows.decide': defineRoute({ input: uarWorkflowDecisionSchema, output: uarWorkflowRunSchema }),
  'prometheus.uar.workflows.cancel': defineRoute({ input: uarWorkflowControlSchema, output: uarWorkflowRunSchema }),
  'prometheus.uar.workflows.recover': defineRoute({ input: uarWorkflowControlSchema, output: uarWorkflowRunSchema }),
  'prometheus.liter_config.select_local': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<LiterConfigSourceSelection>()
  }),
  'prometheus.liter_config.read': defineRoute({
    input: z.object({ source: literConfigSourceSchema }).strict(),
    output: z.custom<LiterConfigSnapshot>()
  }),
  'prometheus.liter_config.preview': defineRoute({
    input: z
      .object({
        source: literConfigSourceSchema,
        expectedRevision: z.string().length(64),
        edits: z.array(literConfigEditSchema).max(4096)
      })
      .strict(),
    output: z.custom<LiterConfigPreview>()
  }),
  'prometheus.liter_config.preview_saved': defineRoute({
    input: z.object({ source: literConfigSourceSchema, expectedRevision: z.string().length(64) }).strict(),
    output: z.custom<LiterConfigPreview>()
  }),
  'prometheus.liter_config.apply': defineRoute({
    input: z
      .object({
        source: literConfigSourceSchema,
        expectedRevision: z.string().length(64),
        edits: z.array(literConfigEditSchema).max(4096)
      })
      .strict(),
    output: z.custom<LiterConfigApplyResult>()
  }),
  'prometheus.liter_config.apply_saved': defineRoute({
    input: z.object({ source: literConfigSourceSchema, expectedRevision: z.string().length(64) }).strict(),
    output: z.custom<LiterConfigApplyResult>()
  }),
  'prometheus.liter_config.export': defineRoute({
    input: z
      .object({
        source: literConfigSourceSchema,
        expectedRevision: z.string().length(64),
        edits: z.array(literConfigEditSchema).max(4096),
        remoteEndpoint: literRemoteEndpointSchema.optional()
      })
      .strict(),
    output: z.custom<LiterConfigExportResult>()
  }),
  'prometheus.liter_config.export_saved': defineRoute({
    input: z
      .object({
        source: literConfigSourceSchema,
        expectedRevision: z.string().length(64),
        remoteEndpoint: literRemoteEndpointSchema.optional()
      })
      .strict(),
    output: z.custom<LiterConfigExportResult>()
  }),
  'prometheus.liter.catalog.read': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<LiterGatewayCatalogSnapshot>()
  }),
  'prometheus.liter.catalog.refresh': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<LiterGatewayCatalogSnapshot>()
  }),
  'prometheus.liter.gateway.select': defineRoute({
    input: literGatewaySelectionSchema,
    output: z.custom<LiterGatewayCatalogSnapshot>()
  }),
  'prometheus.liter.connections.save': defineRoute({
    input: literConnectionMutationSchema,
    output: z.custom<LiterGatewayCatalogSnapshot>()
  }),
  'prometheus.liter.connections.delete': defineRoute({
    input: z
      .object({
        providerConnectionId: z.string().min(1).max(128),
        expectedRevision: z.number().int().nonnegative()
      })
      .strict(),
    output: z.custom<LiterGatewayCatalogSnapshot>()
  }),
  'prometheus.liter.aliases.save': defineRoute({
    input: literAliasMutationSchema,
    output: z.custom<LiterGatewayCatalogSnapshot>()
  }),
  'prometheus.liter.aliases.delete': defineRoute({
    input: z
      .object({
        gatewayConnectionId: z.string().min(1).max(128),
        alias: z.string().min(1).max(256),
        expectedRevision: z.number().int().nonnegative()
      })
      .strict(),
    output: z.custom<LiterGatewayCatalogSnapshot>()
  }),
  'prometheus.liter.roles.read': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<LiterRoleSnapshot>()
  }),
  'prometheus.liter.roles.save': defineRoute({
    input: literRoleMutationSchema,
    output: z.custom<LiterRoleSnapshot>()
  }),
  'prometheus.liter.roles.select_local': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<LiterRoleSourceSelection>()
  }),
  'prometheus.liter.roles.read_document': defineRoute({
    input: z.object({ source: literRoleSourceSchema }).strict(),
    output: z.custom<LiterRoleDocumentSnapshot>()
  }),
  'prometheus.liter.roles.apply': defineRoute({
    input: z.object({ source: literRoleSourceSchema, expectedRevision: z.string().length(64) }).strict(),
    output: z.custom<LiterRoleApplyResult>()
  }),
  'prometheus.liter.roles.export': defineRoute({
    input: z.object({ source: literRoleSourceSchema, expectedRevision: z.string().length(64) }).strict(),
    output: z.custom<LiterRoleExportResult>()
  }),
  'prometheus.integration.snapshot': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<IntegrationSnapshot>()
  }),
  'prometheus.integration.configure': defineRoute({
    input: z.object({ updates: z.array(integrationUpdateSchema).max(4), secrets: secretPatchSchema }).strict(),
    output: z.custom<IntegrationSnapshot>()
  }),
  'prometheus.integration.workspace_enabled': defineRoute({
    input: z.object({ workspacePath: z.string().min(1), enabled: z.boolean() }).strict(),
    output: z.custom<WorkspaceIntegration>()
  }),
  'prometheus.integration.start': defineRoute({
    input: z.object({ action: integrationActionSchema, workspacePath: z.string().optional() }).strict(),
    output: z.custom<IntegrationOperation>()
  }),
  'prometheus.integration.cancel': defineRoute({ input: z.object({ id: z.uuid() }).strict(), output: z.void() }),
  'prometheus.integration.operation_events': defineRoute({
    input: z
      .object({
        id: z.uuid(),
        after: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().max(500).optional()
      })
      .strict(),
    output: z.custom<IntegrationOperationEventPage>()
  }),
  'prometheus.integration.operation_log': defineRoute({
    input: z
      .object({
        id: z.uuid(),
        offset: z.number().int().nonnegative().optional(),
        limit: z
          .number()
          .int()
          .positive()
          .max(1024 * 1024)
          .optional()
      })
      .strict(),
    output: z.custom<IntegrationOperationLogPage>()
  }),
  'prometheus.integration.export_log': defineRoute({
    input: z.object({ id: z.uuid() }).strict(),
    output: z.custom<IntegrationOperationLogExport>()
  }),
  'prometheus.uar.admin.snapshot': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarAdministrationSnapshot>()
  }),
  'prometheus.uar.channel_observers.read': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256) }).strict(),
    output: uarChannelObserversSnapshotSchema
  }),
  'prometheus.uar.channel_observers.deliveries': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        subscriptionId: z.string().min(1).max(256),
        generation: z.number().int().nonnegative()
      })
      .strict(),
    output: uarChannelDeliveriesSchema
  }),
  'prometheus.uar.channel_observers.action': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        subscriptionId: z.string().min(1).max(256),
        generation: z.number().int().nonnegative(),
        expectedRevision: z.number().int().nonnegative(),
        action: uarChannelObserverActionSchema
      })
      .strict(),
    output: uarChannelSubscriptionSchema
  }),
  'prometheus.uar.durable.read': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarDurableWorkspaceSnapshot>()
  }),
  'prometheus.uar.teams.snapshot': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarTeamsSnapshot>()
  }),
  'prometheus.uar.teams.setup_starter': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        model: z
          .object({
            source: z.enum(['uar', 'gateway']),
            providerId: z.string().min(1).max(128),
            modelId: z.string().min(1).max(256)
          })
          .strict()
          .optional()
      })
      .strict(),
    output: z.custom<UarTeamBinding>()
  }),
  'prometheus.uar.teams.rebind_starter': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        bindingId: z.string().min(1).max(512),
        expectedBindingRevision: z.number().int().positive(),
        model: z
          .object({
            source: z.enum(['uar', 'gateway']),
            providerId: z.string().min(1).max(128),
            modelId: z.string().min(1).max(256)
          })
          .strict()
      })
      .strict(),
    output: z.custom<UarTeamBinding>()
  }),
  'prometheus.uar.teams.setup_coding': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        model: z
          .object({
            source: z.enum(['uar', 'gateway']),
            providerId: z.string().min(1).max(128),
            modelId: z.string().min(1).max(256)
          })
          .strict()
      })
      .strict(),
    output: z.custom<UarTeamBinding>()
  }),
  'prometheus.uar.teams.authoring': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarTeamAuthoringSnapshot>()
  }),
  'prometheus.uar.teams.skills': defineRoute({ input: z.object({}).strict(), output: z.custom<UarTeamSkillCatalog>() }),
  'prometheus.uar.teams.select_knowledge': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256) }).strict(),
    output: z.array(z.string())
  }),
  'prometheus.uar.teams.save_authoring': defineRoute({
    input: z.object({ team: uarAuthoredTeamSchema, expectedRevision: z.number().int().nonnegative() }).strict(),
    output: z.custom<UarAuthoredTeamRevision>()
  }),
  'prometheus.uar.teams.deploy_authored': defineRoute({
    input: z
      .object({ workspaceId: z.string().min(1).max(256), teamId: z.uuid(), revision: z.number().int().positive() })
      .strict(),
    output: z.custom<UarTeamBinding>()
  }),
  'prometheus.uar.teams.submit_task': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        teamInstanceId: z.string().min(1).max(256),
        commandId: z.uuid(),
        prompt: z.string().trim().min(1).max(32768)
      })
      .strict(),
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.approvals': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256), teamInstanceId: z.string().min(1).max(256) }).strict(),
    output: z.custom<{ approvals: UarTeamApproval[]; history: UarTeamApprovalHistory[] }>()
  }),
  'prometheus.uar.teams.decide_approval': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        teamInstanceId: z.string().min(1).max(256),
        attemptId: z.string().min(1).max(256),
        approvalId: z.string().min(1).max(256),
        issuerId: z.string().min(1).max(256).optional(),
        challengeId: z.string().min(1).max(256).optional(),
        eventId: z.string().min(1).max(256),
        cursor: z.number().int().nonnegative(),
        approved: z.boolean()
      })
      .strict(),
    output: z.object({ resolved: z.literal(true) })
  }),
  'prometheus.uar.teams.create': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        commandId: z.uuid(),
        deploymentBindingId: z.string().min(1).max(256),
        teamDefinition: z
          .object({ id: z.string().min(1), version: z.string().min(1), digest: z.string().min(1) })
          .strict(),
        input: z.unknown(),
        memberSlots: z
          .array(z.object({ role: z.string().min(1), count: z.number().int().positive() }).strict())
          .optional()
      })
      .strict(),
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.add_task': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        teamInstanceId: z.string().min(1).max(256),
        commandId: z.uuid(),
        taskId: z.string().min(1).max(256),
        expectedTeamRevision: z.number().int().nonnegative(),
        title: z.string().min(1).max(512),
        role: z.string().min(1).max(256),
        input: z.unknown(),
        outputContract: z.unknown(),
        dependsOn: z.array(z.string().min(1).max(256)).max(128)
      })
      .strict(),
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.claim_task': defineRoute({
    input: teamTaskCommandSchema,
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.reassign_task': defineRoute({
    input: teamTaskCommandSchema,
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.assign_reviewer': defineRoute({
    input: teamTaskCommandSchema,
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.update_task_state': defineRoute({
    input: teamTaskCommandSchema.omit({ memberId: true }).extend({
      status: z.literal('ready'),
      reason: z.string().min(1).max(512)
    }),
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.execution_owner': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarExecutionOwnerSnapshot>()
  }),
  'prometheus.uar.teams.quiesce_owner': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<{ fencingEvidenceRef: string; claim: NonNullable<UarExecutionOwnerSnapshot['claim']> }>()
  }),
  'prometheus.uar.teams.reclaim_owner': defineRoute({
    input: z
      .object({
        commandId: z.uuid(),
        catalogId: z.string().min(1).max(128),
        expectedEpoch: z.number().int().positive(),
        replacementServiceInstanceId: z.string().min(1).max(128),
        reason: z.string().min(1).max(2048),
        fencingEvidenceRef: z
          .string()
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
          .max(128)
      })
      .strict(),
    output: z.custom<UarExecutionReclaimReceipt>()
  }),
  'prometheus.uar.teams.peer_messages': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256), teamInstanceId: z.string().min(1).max(256) }).strict(),
    output: uarTeamPeerMessagesSchema
  }),
  'prometheus.uar.teams.context': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        teamInstanceId: z.string().min(1).max(256),
        attemptId: z.string().min(1).max(256)
      })
      .strict(),
    output: uarTeamContextSchema
  }),
  'prometheus.uar.teams.execution': defineRoute({
    input: teamExecutionSelectorSchema,
    output: z.custom<UarTeamExecutionSummary>()
  }),
  'prometheus.uar.teams.events': defineRoute({
    input: teamExecutionSelectorSchema.extend({
      attemptId: z.string().min(1).max(256),
      after: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()
    }),
    output: z.custom<UarTeamRunEventsSnapshot>()
  }),
  'prometheus.uar.teams.artifacts': defineRoute({
    input: teamExecutionSelectorSchema,
    output: z.custom<{ artifacts: UarTeamArtifact[] }>()
  }),
  'prometheus.uar.teams.admit_task': defineRoute({
    input: teamTaskCommandSchema.extend({
      reservation: z
        .object({
          tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          costMicrounits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          elapsedSeconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
        })
        .strict(),
      contextArtifactIds: z.array(z.string().min(1).max(256)).max(128)
    }),
    output: z.custom<UarTeamExecutionAttempt>()
  }),
  'prometheus.uar.teams.queue_task': defineRoute({
    input: teamTaskCommandSchema.extend({
      reservation: z
        .object({
          tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          costMicrounits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          elapsedSeconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
        })
        .strict(),
      contextArtifactIds: z.array(z.string().min(1).max(256)).max(128)
    }),
    output: z.custom<UarTeamExecutionAttempt>()
  }),
  'prometheus.uar.teams.dispatch_attempt': defineRoute({
    input: teamExecutionSelectorSchema.extend({
      commandId: z.uuid(),
      expectedTeamRevision: z.number().int().nonnegative(),
      attemptId: z.string().min(1).max(256)
    }),
    output: z.custom<UarTeamExecutionAttempt>()
  }),
  'prometheus.uar.teams.cancel_attempt': defineRoute({
    input: teamControlSchema.extend({ attemptId: z.string().min(1).max(256) }),
    output: z.custom<UarTeamExecutionAttempt>()
  }),
  'prometheus.uar.teams.recover': defineRoute({
    input: teamControlSchema,
    output: z.custom<UarTeamExecutionAttempt[]>()
  }),
  'prometheus.uar.teams.revoke_member': defineRoute({
    input: teamControlSchema.extend({ memberId: z.string().min(1).max(256) }),
    output: z.custom<UarTeamInstance>()
  }),
  'prometheus.uar.teams.mailbox_list': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256), teamInstanceId: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarTeamMailboxPage>()
  }),
  'prometheus.uar.teams.mailbox_send': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        teamInstanceId: z.string().min(1).max(256),
        commandId: z.uuid(),
        recipientMemberId: z.string().min(1).max(256),
        mode: z.enum(['queue-only', 'trigger-turn']),
        content: z.string().min(1).max(16000)
      })
      .strict(),
    output: z.custom<UarTeamMailboxMessage>()
  }),
  'prometheus.uar.durable.setup_starter': defineRoute({
    input: z.object({ workspaceId: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarDurableBinding>()
  }),
  'prometheus.uar.durable.create_instance': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        deploymentBindingId: z.string().min(1).max(256),
        profile: z.enum(['request', 'on_demand', 'resident'])
      })
      .strict(),
    output: z.custom<UarDurableInstance>()
  }),
  'prometheus.uar.durable.instance_action': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        instanceId: z.string().min(1).max(256),
        action: z.enum(['activate', 'passivate', 'drain', 'disable', 'restart', 'cancel']),
        commandId: z.uuid()
      })
      .strict(),
    output: z.custom<UarDurableInstance>()
  }),
  'prometheus.uar.durable.create_observer': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        observerInstanceId: z.string().min(1).max(256),
        sourceInstanceIds: z.array(z.string().min(1).max(256)).min(1).max(64),
        conversationIds: z.array(z.string().min(1).max(256)).max(64).optional()
      })
      .strict(),
    output: z.custom<UarDurableObserver>()
  }),
  'prometheus.uar.durable.observer_action': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        subscriptionId: z.string().min(1).max(256),
        action: z.enum(['pause', 'resume']),
        expectedRevision: z.number().int().nonnegative()
      })
      .strict(),
    output: z.custom<UarDurableObserver>()
  }),
  'prometheus.uar.durable.acknowledge_gap': defineRoute({
    input: z
      .object({
        workspaceId: z.string().min(1).max(256),
        subscriptionId: z.string().min(1).max(256),
        expectedRevision: z.number().int().nonnegative(),
        sourceInstanceId: z.string().min(1).max(256),
        missingFrom: z.number().int().nonnegative(),
        missingThrough: z.number().int().nonnegative()
      })
      .strict(),
    output: z.custom<UarDurableObserver>()
  }),
  'prometheus.uar.admin.diagnose_authority': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarAuthorityDiagnosticResult>()
  }),
  'prometheus.uar.instances.read': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarInstanceInventorySnapshot>()
  }),
  'prometheus.uar.instances.save': defineRoute({
    input: uarInstanceSaveSchema,
    output: z.custom<UarInstanceInventorySnapshot>()
  }),
  'prometheus.uar.instances.delete': defineRoute({
    input: uarInstanceDeleteSchema,
    output: z.custom<UarInstanceInventorySnapshot>()
  }),
  'prometheus.uar.instances.select': defineRoute({
    input: uarInstanceSelectSchema,
    output: z.custom<UarInstanceInventorySnapshot>()
  }),
  'prometheus.uar.instances.test': defineRoute({
    input: z.object({ instanceId: z.string().min(1).max(128) }).strict(),
    output: z.custom<UarInstanceInventorySnapshot>()
  }),
  'prometheus.uar.instances.migrate': defineRoute({
    input: z.object({ sessionId: z.string().min(1).max(256), targetInstanceId: z.string().min(1).max(128) }).strict(),
    output: z.object({ supported: z.literal(false), reason: z.string() })
  }),
  'prometheus.uar.operations.read': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarOperationalSnapshot>()
  }),
  'prometheus.uar.runs.read': defineRoute({
    input: z.object({ runId: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarRunDetailSnapshot>()
  }),
  'prometheus.uar.runs.cancel': defineRoute({
    input: z.object({ runId: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarRunDetailSnapshot>()
  }),
  'prometheus.uar.runs.save_policy': defineRoute({
    input: z.object({ runId: z.string().min(1).max(256), policy: z.record(z.string(), z.unknown()) }).strict(),
    output: z.custom<UarRunDetailSnapshot>()
  }),
  'prometheus.uar.runs.reset_policy': defineRoute({
    input: z.object({ runId: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarRunDetailSnapshot>()
  }),
  'prometheus.uar.knowledge.create': defineRoute({
    input: uarKnowledgeCreateSchema,
    output: z.custom<UarOperationalSnapshot>()
  }),
  'prometheus.uar.knowledge.delete': defineRoute({
    input: z.object({ sessionId: z.string().min(1), knowledgeBaseId: z.string().min(1) }).strict(),
    output: z.custom<UarOperationalSnapshot>()
  }),
  'prometheus.uar.knowledge.search': defineRoute({
    input: uarKnowledgeSearchSchema,
    output: z.custom<UarKnowledgeSearchResult[]>()
  }),
  'prometheus.uar.knowledge.upload': defineRoute({
    input: z.object({ sessionId: z.string().min(1), knowledgeBaseId: z.string().min(1) }).strict(),
    output: z.custom<UarKnowledgeUploadResult>()
  }),
  'prometheus.uar.knowledge.delete_document': defineRoute({
    input: z
      .object({ sessionId: z.string().min(1), knowledgeBaseId: z.string().min(1), documentId: z.string().min(1) })
      .strict(),
    output: z.custom<UarOperationalSnapshot>()
  }),
  'prometheus.uar.memory.create': defineRoute({
    input: uarMemoryCreateSchema,
    output: z.custom<UarOperationalSnapshot>()
  }),
  'prometheus.uar.memory.delete': defineRoute({
    input: z.object({ id: z.string().min(1).max(512) }).strict(),
    output: z.custom<UarOperationalSnapshot>()
  }),
  'prometheus.uar.catalog.read': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarCatalogSnapshot>()
  }),
  'prometheus.uar.catalog.save_agent': defineRoute({
    input: uarAgentSaveSchema,
    output: z.custom<UarCatalogSnapshot>()
  }),
  'prometheus.uar.catalog.prepare_run': defineRoute({
    input: uarAgentRunTargetSchema,
    output: z.custom<UarAgentRunTarget>()
  }),
  'prometheus.uar.catalog.delete_agent': defineRoute({
    input: z.object({ id: z.string().min(1).max(256) }).strict(),
    output: z.custom<UarCatalogSnapshot>()
  }),
  'prometheus.uar.catalog.compile': defineRoute({
    input: uarCompilerRequestSchema,
    output: z.custom<UarCompilerResult>()
  }),
  'prometheus.uar.catalog.save_agent_skills': defineRoute({
    input: uarAgentSkillsSchema,
    output: z.custom<UarCatalogSnapshot>()
  }),
  'prometheus.uar.catalog.toggle_skill': defineRoute({
    input: uarSkillToggleSchema,
    output: z.custom<UarCatalogSnapshot>()
  }),
  'prometheus.uar.catalog.refresh_skills': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarCatalogSnapshot>()
  }),
  'prometheus.uar.catalog.save_federated_agent': defineRoute({
    input: uarFederatedAgentSaveSchema,
    output: z.custom<UarCatalogSnapshot>()
  }),
  'prometheus.uar.presentations.read': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.presentations.save': defineRoute({
    input: uarPresentationSaveSchema,
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.presentations.delete': defineRoute({
    input: z.object({ id: z.string().min(1).max(256), expectedRevision: z.number().int().nonnegative() }).strict(),
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.presentations.save_schema': defineRoute({
    input: uarArtifactSchemaSaveSchema,
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.presentations.delete_schema': defineRoute({
    input: z.object({ schemaId: z.string().min(1).max(256), expectedRevision: z.string().min(1).max(128) }).strict(),
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.presentations.save_component': defineRoute({
    input: uarA2uiComponentSaveSchema,
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.presentations.delete_component': defineRoute({
    input: z.object({ id: z.string().min(1).max(256), expectedRevision: z.string().min(1).max(128) }).strict(),
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.presentations.save_policy': defineRoute({
    input: z
      .object({ expectedPolicy: z.record(z.string(), z.unknown()), selection: uarPresentationSelectionSchema })
      .strict(),
    output: z.custom<UarPresentationAdministrationSnapshot>()
  }),
  'prometheus.uar.settings.read': defineRoute({
    input: z.object({ namespace: uarSettingsNamespaceSchema }).strict(),
    output: z.custom<UarSettingsSnapshot>()
  }),
  'prometheus.uar.settings.update': defineRoute({
    input: z
      .object({
        namespace: uarSettingsNamespaceSchema,
        changes: z
          .array(
            z
              .object({
                field: z
                  .string()
                  .regex(/^[a-zA-Z0-9_.-]+$/)
                  .max(128),
                value: z.unknown(),
                expectedRevision: z.string().min(1).max(128)
              })
              .strict()
          )
          .min(1)
          .max(128)
      })
      .strict(),
    output: z.custom<UarSettingsUpdateResult>()
  }),
  'prometheus.uar.models.sources': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<UarModelSourceSnapshot>()
  }),
  'prometheus.uar.providers.save': defineRoute({
    input: uarProviderMutationSchema,
    output: z.custom<UarModelSourceSnapshot>()
  }),
  'prometheus.uar.providers.delete': defineRoute({
    input: z.object({ id: z.string().min(1).max(128) }).strict(),
    output: z.custom<UarModelSourceSnapshot>()
  }),
  'prometheus.uar.providers.default': defineRoute({
    input: z.object({ id: z.string().min(1).max(128) }).strict(),
    output: z.custom<UarModelSourceSnapshot>()
  }),
  'prometheus.uar.providers.test': defineRoute({
    input: z.object({ id: z.string().min(1).max(128), modelId: z.string().min(1).max(256) }).strict(),
    output: z.object({ ok: z.boolean(), providerId: z.string(), modelId: z.string(), latencyMs: z.number() })
  }),
  'prometheus.doctor.run': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<PrometheusDoctorReport>()
  }),
  'prometheus.doctor.fix': defineRoute({
    // The pack rejects an unknown fix id itself; this only bounds the input's shape.
    input: z.object({ fixId: z.string().min(1).max(64) }).strict(),
    output: z.custom<PrometheusFixOutcome>()
  }),
  'prometheus.skills.push': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<PrometheusPushState>()
  }),
  'prometheus.skills.push_state': defineRoute({
    input: z.object({}).strict(),
    output: z.custom<PrometheusPushState>()
  })
}

export type PrometheusEventSchemas = {
  'prometheus.integration.operation_progress': IntegrationOperationEvent
}
