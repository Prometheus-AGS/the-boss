import { realpath } from 'node:fs/promises'

import * as z from 'zod'

import { application } from '@application'
import { agentWorkspaceService } from '@data/services/AgentWorkspaceService'
import { FileSystemServer } from '@main/ai/mcp/servers/filesystem'
import { uarApprovalLifecycleStore } from '@main/ai/runtime/uar/UarApprovalLifecycleStore'
import { createUarAuthorityProvider } from '@main/ai/runtime/uar/UarAuthorityProvider'
import { rawPendingApproval } from '@main/ai/runtime/uar/uarApprovalLifecycle'
import { rawBinding } from '@main/ai/runtime/uar/uarBindingPosture'
import { codingReadTools, codingWriteTools } from '@main/ai/runtime/uar/uarCodingTeamPackage'
import { createUarHostMcpBridge, type UarHostMcpBridge } from '@main/ai/runtime/uar/UarHostMcpBridge'
import type { UarPreparedInvocation } from '@main/ai/runtime/uar/UarHostToolAdmission'
import { uarPrincipalForSession } from '@main/ai/runtime/uar/uarPrincipal'
import { t } from '@main/i18n'
import {
  bossFangDelegatedBindingSchema,
  bossFangDelegatedIdentitySchema,
  bossFangPreparedEffectSchema,
  type BossFangDelegatedApprovalInspection,
  type BossFangDelegatedContext
} from '@shared/types/bossFangDelegatedApproval'
import { uarApprovalHistorySchema } from '@shared/types/uarApprovalRecords'

import type { PrivateUarAuthorization } from './retainedAuthorizations'

const collection = '/api/uar/full-harness/v1/delegated-host-contexts'
const registration = z.object({
  context_id: z.string(), grant_id: z.string(), workspace_id: z.string(), runtime_epoch: z.string(),
  definition: bossFangDelegatedIdentitySchema, binding: bossFangDelegatedBindingSchema,
  agent_id: z.string(), expires_at: z.string()
})
const taskSchema = z.object({
  task_id: z.string(), native_task_id: z.string(), run_id: z.string(), workspace_id: z.string(),
  runtime_epoch: z.string(), state: z.string(), delegated_host_context: registration
})
const approvalSchema = rawPendingApproval.shape.pending.unwrap().extend({ cursor: z.number().nullable() })
const pendingSchema = rawPendingApproval.extend({ pending: approvalSchema.nullable() })
const callbackSchema = z.object({
  version: z.literal(1), contextId: z.string(), grantId: z.string(), runtimeEpoch: z.string(),
  workspaceId: z.string(), workingDirectory: z.string(), definition: bossFangDelegatedIdentitySchema,
  binding: bossFangDelegatedBindingSchema, taskId: z.string(), nativeTaskId: z.string(), runId: z.string(),
  approval: approvalSchema, approved: z.boolean()
}).strict()
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const failure = (code: string) => new Error(`${t('bossfang.retainedAuthentication')} [${code}]`)

class ContextRegistrationError extends Error {
  constructor(readonly code: string) { super(code) }
}

/** Private resource attachment owned and disposed by the BossFang connection lifecycle. */
export class DelegatedHostContext {
  private receipt!: z.infer<typeof registration>
  private bridge!: UarHostMcpBridge
  private constructor(
    readonly authorization: PrivateUarAuthorization,
    private readonly directory: string
  ) {}

  get id() { return this.receipt.context_id }
  get safe(): BossFangDelegatedContext {
    return {
      contextId: this.id, workspaceId: this.receipt.workspace_id, runtimeEpoch: this.receipt.runtime_epoch,
      definition: this.receipt.definition, binding: this.receipt.binding, expiresAt: this.receipt.expires_at
    }
  }

  static async create(authorization: PrivateUarAuthorization, binding: z.infer<typeof rawBinding>) {
    const directory = await realpath(agentWorkspaceService.getById(authorization.workspaceId).path)
    const context = new DelegatedHostContext(authorization, directory)
    context.bridge = await createUarHostMcpBridge(
      { filesystem: { name: 'filesystem', createInstance: () => new FileSystemServer(directory).server } },
      {
        sessionId: 'bossfang:' + authorization.workspaceId,
        ownerId: authorization.grant!.principal,
        principalId: binding.package.id,
        workspace: directory,
        authorityProvider: await createUarAuthorityProvider(),
        persistLifecycle: (snapshot) => uarApprovalLifecycleStore.persist(snapshot),
        disposition: (name) => codingReadTools.includes(name) ? 'auto' : codingWriteTools.includes(name) ? 'ask' : 'deny',
        verifyInvocation: (invocation) => context.verifyInvocation(invocation),
        recordDelegatedApproval: (body) => context.recordApproval(body)
      }
    )
    try {
      context.receipt = registration.parse(await context.request(collection, 'POST', {
        grant_id: authorization.grant!.id,
        workspace_id: authorization.workspaceId,
        runtime_epoch: authorization.runtimeEpoch,
        deployment_binding_id: binding.id,
        definition: binding.package,
        working_directory: directory,
        mcp_servers: context.bridge.servers,
        tool_admission: context.bridge.toolAdmission
      }))
      if (
        context.receipt.grant_id !== authorization.grant!.id ||
        context.receipt.workspace_id !== authorization.workspaceId ||
        context.receipt.runtime_epoch !== authorization.runtimeEpoch ||
        context.receipt.binding.id !== binding.id || context.receipt.binding.revision !== binding.revision ||
        !same(context.receipt.definition, binding.package) ||
        context.receipt.expires_at !== authorization.grant!.expires_at
      ) throw failure('DELEGATED_CONTEXT_REGISTRATION_MISMATCH')
      return context
    } catch (error) {
      if (context.receipt) await context.release()
      else await context.bridge.close()
      throw error
    }
  }

  private async assertOriginal(requireLive = true) {
    const endpoint = await application.get('UarSidecarService').resolveInstance(this.authorization.inventoryId)
    if (
      endpoint.generation !== this.authorization.endpoint.generation ||
      endpoint.observed.id !== this.authorization.endpoint.observed.id ||
      (requireLive && (!this.receipt || Date.parse(this.receipt.expires_at) <= Date.now()))
    ) throw failure('DELEGATED_CONTEXT_UNAVAILABLE')
  }

  async request(path: string, method = 'GET', body?: object): Promise<unknown> {
    const response = await application.get('UarSidecarService').requestInstance(
      this.authorization.endpoint, path, uarPrincipalForSession('bossfang'), {
        method, headers: { 'x-uar-workspace-id': this.authorization.workspaceId, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      }
    )
    if (!response.ok) {
      const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(await response.json().catch(() => null))
      throw new ContextRegistrationError(error.success ? error.data.error.code : 'delegated_host_context_unavailable')
    }
    return response.status === 204 ? undefined : response.json()
  }

  private validateTask(value: unknown, runId: string, taskId?: string, nativeTaskId?: string) {
    const task = taskSchema.parse(value)
    if (
      task.run_id !== runId || task.workspace_id !== this.authorization.workspaceId ||
      task.runtime_epoch !== this.receipt.runtime_epoch || !same(task.delegated_host_context, this.receipt) ||
      (taskId && task.task_id !== taskId) || (nativeTaskId && task.native_task_id !== nativeTaskId)
    ) throw failure('DELEGATED_CONTEXT_TASK_MISMATCH')
    return task
  }

  private async verifyInvocation(invocation: UarPreparedInvocation) {
    try {
      await this.assertOriginal()
      if (
        invocation.ownerId !== this.authorization.grant!.principal ||
        invocation.principalId !== this.receipt.agent_id || invocation.workspace !== this.directory ||
        invocation.rootRunId !== invocation.executingRunId
      ) return false
      const task = await this.request(`${collection}/${encodeURIComponent(this.id)}/runs/${encodeURIComponent(invocation.executingRunId)}`)
      this.validateTask(task, invocation.executingRunId)
      return true
    } catch { return false }
  }

  private async readApproval(taskId: string, runId: string, nativeTaskId: string) {
    await this.assertOriginal(false)
    const task = this.validateTask(
      await this.request('/api/uar/full-harness/v1/tasks/' + encodeURIComponent(taskId)), runId, taskId, nativeTaskId
    )
    const path = '/api/uar/runs/' + encodeURIComponent(runId) + '/tool-approval'
    const result = pendingSchema.parse(await this.request(path + '/pending'))
    const history = uarApprovalHistorySchema.parse(await this.request(path))
    if (result.runId !== runId || history.runId !== runId) throw failure('DELEGATED_APPROVAL_RUN_MISMATCH')
    if (history.records.some((record) => record.workspaceId !== this.authorization.workspaceId || record.rootRunId !== runId))
      throw failure('DELEGATED_APPROVAL_OWNER_MISMATCH')
    const pending = result.pending
    let actionablePending = pending
    if (pending) {
      const challenge = history.records.find((record) => record.issuerId === pending.issuerId && record.challengeId === pending.challengeId)
      if (
        !pending.admissionId || !pending.issuerId || !pending.challengeId || pending.rootRunId !== runId ||
        pending.admissionOwner !== 'paired-host' || !challenge ||
        challenge.admissionId !== pending.admissionId || challenge.toolCallId !== pending.toolCallId ||
        challenge.toolName !== pending.name || challenge.admissionOwner !== 'paired-host'
      ) throw failure('DELEGATED_APPROVAL_STALE')
      if (challenge.state !== 'pending' || !challenge.resolvable) actionablePending = null
    }
    return { task, pending: actionablePending, history }
  }

  private async recordApproval(body: unknown): Promise<Record<string, unknown>> {
    const input = callbackSchema.parse(body)
    await this.assertOriginal()
    if (
      input.contextId !== this.id || input.grantId !== this.receipt.grant_id || input.runtimeEpoch !== this.receipt.runtime_epoch ||
      input.workspaceId !== this.authorization.workspaceId || input.workingDirectory !== this.directory ||
      !same(input.definition, this.receipt.definition) || !same(input.binding, this.receipt.binding)
    ) throw failure('DELEGATED_APPROVAL_CONTEXT_MISMATCH')
    const current = await this.readApproval(input.taskId, input.runId, input.nativeTaskId)
    if (!current.pending || !same(current.pending, input.approval)) throw failure('DELEGATED_APPROVAL_STALE')
    if (!(await this.bridge.recordHumanDecision(current.pending.admissionId!, input.approved)))
      throw failure('DELEGATED_APPROVAL_STALE')
    return {
      version: 1, contextId: this.id, runId: input.runId, issuerId: current.pending.issuerId,
      challengeId: current.pending.challengeId, admissionId: current.pending.admissionId,
      approved: input.approved, recorded: true
    }
  }

  async inspect(taskId: string, runId: string, bossTaskId: string): Promise<BossFangDelegatedApprovalInspection> {
    let current = await this.readApproval(taskId, runId, bossTaskId)
    let preparedEffect: BossFangDelegatedApprovalInspection['preparedEffect'] = null
    if (current.pending) {
      const pending = current.pending
      const response = await fetch(this.bridge.toolAdmission.url + '/inspect', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { ...this.bridge.toolAdmission.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ admissionId: pending.admissionId, inspection: {
          ownerId: this.authorization.grant!.principal, workspace: this.directory, rootRunId: pending.rootRunId,
          runId, toolCallId: pending.toolCallId, callIndex: pending.callIndex, toolName: pending.name,
          actionDisplay: JSON.parse(pending.argumentsJson)
        } })
      })
      if (!response.ok) throw failure('DELEGATED_APPROVAL_STALE')
      preparedEffect = z.object({ preparedEffect: bossFangPreparedEffectSchema.optional() }).parse(await response.json()).preparedEffect ?? null
      const rechecked = await this.readApproval(taskId, runId, bossTaskId)
      if (!same(rechecked.pending, pending)) preparedEffect = null
      current = rechecked
    }
    const pending = preparedEffect ? current.pending : null
    return {
      ...this.safe, bossTaskId, taskId, runId, history: current.history, preparedEffect,
      pending: pending ? {
        approvalId: pending.approvalId, issuerId: pending.issuerId!, challengeId: pending.challengeId!,
        admissionId: pending.admissionId!, toolCallId: pending.toolCallId, callIndex: pending.callIndex,
        eventId: pending.eventId, cursor: pending.cursor, rootRunId: pending.rootRunId
      } : null
    }
  }

  redact(text: string) {
    for (const value of this.bridge.redactions) text = text.split(value).join('<redacted>')
    return text
  }

  async release() {
    try { await this.request(collection + '/' + encodeURIComponent(this.id), 'DELETE') }
    finally { await this.bridge.close() }
  }
}

export async function registerDelegatedHostContexts(authorization: PrivateUarAuthorization) {
  if (!authorization.grant || authorization.endpoint.ownership !== 'managed') return []
  const sidecar = application.get('UarSidecarService')
  const read = async (path: string) => {
    const response = await sidecar.requestInstance(authorization.endpoint, path, uarPrincipalForSession('bossfang'), {
      headers: { 'x-uar-workspace-id': authorization.workspaceId }
    })
    if (!response.ok) throw failure('DELEGATED_CONTEXT_CATALOG_UNAVAILABLE')
    return response.json()
  }
  const capability = z.object({ delegated_host_context_v1: z.boolean().optional() }).parse(
    await read('/api/uar/full-harness/v1/capabilities')
  )
  if (!capability.delegated_host_context_v1) return []
  const bindings = z.array(rawBinding).parse(await read('/api/v1/collaboration/deployment-bindings'))
  const contexts: DelegatedHostContext[] = []
  try {
    for (const binding of bindings) {
      if (binding.workspaceId !== authorization.workspaceId) throw failure('DELEGATED_CONTEXT_WORKSPACE_MISMATCH')
      if (!binding.activationSupported) continue
      try { contexts.push(await DelegatedHostContext.create(authorization, binding)) }
      catch (error) {
        if (!(error instanceof ContextRegistrationError) || error.code !== 'delegated_host_binding_not_agent') throw error
      }
    }
    return contexts
  } catch (error) {
    await Promise.allSettled(contexts.map((context) => context.release()))
    throw failure(error instanceof ContextRegistrationError ? error.code : 'DELEGATED_CONTEXT_REGISTRATION_FAILED')
  }
}
