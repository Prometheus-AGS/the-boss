import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { setup } from '../approval-lifecycle-operation/setup.mjs'
import { runtimeState } from '../bossfang-workflow-delegation-operation/setup.mjs'
import { admissions, capture, data, digest, ipc, profile, rawIpc, rejected, requireFact, safeFailure,
  save, terminal, waitFor } from './admission-v2-common.mjs'

async function restart(evaluate, signal) {
  const operation = await ipc(evaluate, 'prometheus.integration.start', { action: 'uar-restart' })
  await waitFor(signal, async () => {
    const snapshot = await ipc(evaluate, 'prometheus.integration.snapshot')
    const state = snapshot.operations?.find(row => row.id === operation.id)
    if (!state || ['queued', 'running'].includes(state.status)) return false
    requireFact(state.status === 'succeeded', 'ADMISSION_V2_OWNED_RESTART_FAILED')
    return true
  }, 'ADMISSION_V2_OWNED_RESTART_NOT_SETTLED', 90000, 500)
}

async function open(evaluate, sessionId, modelId, prompt, parentAnchorId) {
  const response = await ipc(evaluate, 'ai.stream.open', { trigger: 'submit-message',
    topicId: `agent-session:${sessionId}`, mentionedModelIds: [modelId],
    ...(parentAnchorId ? { parentAnchorId } : {}), userMessageParts: [{ type: 'text', text: prompt }] })
  requireFact(response.mode === 'started', 'ADMISSION_V2_FRESH_TURN_NOT_ADMITTED')
}

export async function scenario({ evaluate, signal }, configuration) {
  const evidence = { schemaVersion: 1, kind: 'integrated-admission-v2-native-work-operation',
    complete: false, startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs,
    credentialValueRecorded: false, checks: [], limitations: [
      'Ordinary Work UAR uses the existing proxy model; direct Claude/Codex subscriptions are separate evidence.',
      'Reconnect is real renderer stream detach/attach to the same running execution, not a native process restart.',
      'This scoped operation does not certify fault-injected lost acknowledgments, Windows or representation grants.'
    ] }
  let stage = 'owned-packaged-profile', stream, topicId, priorSettings, ownedProfile
  try {
    ownedProfile = await profile(evaluate, configuration)
    await waitFor(signal, () => evaluate(`(() => {
      const skip=[...document.querySelectorAll('button')].find(n=>n.getClientRects().length&&n.innerText.trim()==='Set up later');
      if(skip)skip.click();return Boolean(document.querySelector('#app-sidebar'));
    })()`), 'ADMISSION_V2_ONBOARDING_NOT_READY')
    stage = 'supported-gateway-and-native-file-settings'
    const workspace = await setup(evaluate, configuration)
    // Establish the selected supported gateway provider through the existing
    // typed setup. No team inference or activation is submitted here.
    await ipc(evaluate, 'prometheus.uar.teams.setup_starter', { workspaceId: workspace.workspaceId, model: workspace.model })
    const sources = await ipc(evaluate, 'prometheus.uar.models.sources')
    const providers = sources.sources.filter(source => source.source === 'uar' && source.operational)
      .flatMap(source => source.providers.filter(provider => provider.enabled && provider.credentialConfigured &&
        provider.models.some(model => model.id === configuration.gateway.alias && model.enabled &&
          model.pricingIdentity?.providerId === configuration.gateway.providerId &&
          model.pricingIdentity?.modelId === configuration.gateway.modelId)))
    requireFact(providers.length === 1, 'ADMISSION_V2_NATIVE_PROXY_MODEL_AMBIGUOUS')
    const provider = providers[0]
    await ipc(evaluate, 'prometheus.uar.providers.save', { mode: 'update', id: provider.id,
      displayName: provider.name, baseUrl: provider.baseUrl, protocol: provider.protocol,
      defaultModel: provider.defaultModel, enabled: provider.enabled, credential: { operation: 'unchanged' },
      models: provider.models.map(({ effectiveIdentity, name, ...model }) => ({ ...model, displayName: name,
        ...(model.id === configuration.gateway.alias ? { contextWindow: configuration.modelContext.contextWindow } : {}) })) })
    evidence.modelContext = { ...configuration.modelContext, route: 'prometheus.uar.providers.save', credentialsChanged: false }
    const settings = await ipc(evaluate, 'prometheus.uar.settings.read', { namespace: 'native-tools' })
    priorSettings = ['file_tools_enabled', 'file_allowed_paths'].map(field => {
      const row = settings.settings.find(item => item.field === field)
      requireFact(row, 'ADMISSION_V2_NATIVE_FILE_SETTING_UNAVAILABLE')
      return { field, value: row.saved }
    })
    const updated = await ipc(evaluate, 'prometheus.uar.settings.update', { namespace: 'native-tools',
      changes: priorSettings.map(({ field }) => ({ field,
        value: field === 'file_tools_enabled' ? true : [configuration.workspaceDirectory],
        expectedRevision: settings.settings.find(row => row.field === field).revision })) })
    requireFact(!updated.errors?.length, 'ADMISSION_V2_NATIVE_FILE_SETTINGS_REFUSED')
    await restart(evaluate, signal)
    const effective = await ipc(evaluate, 'prometheus.uar.settings.read', { namespace: 'native-tools' })
    requireFact(effective.settings.find(row => row.field === 'file_tools_enabled')?.effective === true &&
      JSON.stringify(effective.settings.find(row => row.field === 'file_allowed_paths')?.effective) ===
        JSON.stringify([configuration.workspaceDirectory]), 'ADMISSION_V2_NATIVE_FILE_SETTINGS_NOT_EFFECTIVE')
    evidence.runtime = await runtimeState(evaluate)
    const inventory = await ipc(evaluate, 'prometheus.uar.instances.read')
    const selected = inventory.instances.find(row => row.id === inventory.selectedInstanceId)
    requireFact(selected?.ownership === 'managed' && selected.observed?.capabilities.includes('tool_admission_v2'),
      'ADMISSION_V2_SELECTED_CAPABILITY_NOT_OBSERVED')
    evidence.capability = { instanceId: selected.id, version: selected.observed.version,
      capabilities: selected.observed.capabilities }
    const models = await data(evaluate, 'GET', '/models')
    const model = models.find(row => row.isEnabled && !/^(claude-code|openai-codex)::/.test(row.id))
    requireFact(model, 'ADMISSION_V2_WORK_COMPATIBILITY_MODEL_UNAVAILABLE')
    const agent = await ipc(evaluate, 'ai.agent.create', { type: 'uar', name: configuration.marker,
      instructions: 'Read only the exact requested synthetic file. Never write, send, spend or delegate. After approval quote the file exactly.',
      model: model.id, mcps: [], configuration: { permission_mode: 'default',
        uar_model_assignment: { source: 'gateway', modelId: configuration.gateway.alias } } })
    requireFact(agent.type === 'uar', 'ADMISSION_V2_WORK_RUNTIME_MISMATCH')
    const created = await ipc(evaluate, 'ai.agent.session.reuse_or_create', { agentId: agent.id,
      workspace: { type: 'user', workspaceId: workspace.workspaceId } })
    const sessionId = created.session.id
    topicId = `agent-session:${sessionId}`
    evidence.owner = { agentId: agent.id, sessionId, workspaceId: workspace.workspaceId,
      assignment: { source: 'gateway', modelId: configuration.gateway.alias } }
    const file = path.join(configuration.workspaceDirectory, 'native-read.txt')
    const content = 'Synthetic native read only. ' + configuration.marker + '\n'
    fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 })
    evidence.file = { pathSha256: digest(file), sha256: digest(content) }
    const before = new Set((await data(evaluate, 'GET', `/agent-sessions/${sessionId}/messages`)).items.map(row => row.id))
    stream = await capture(evaluate, topicId, configuration.marker)
    stage = 'actual-runtime-native-file-read-approval'
    await open(evaluate, sessionId, model.id,
      `Use file_read exactly once to read ${JSON.stringify(file)}. Await approval. Do not use any other tool. After the real tool succeeds quote the exact file contents.`)
    const pending = await waitFor(signal, async () => {
      const state = await stream.read()
      requireFact(!state.error && !state.done, 'ADMISSION_V2_NATIVE_READ_ENDED_BEFORE_APPROVAL')
      return state.approvals.length && state.approvals[0]
    }, 'ADMISSION_V2_REAL_NATIVE_FILE_APPROVAL_NOT_OBSERVED', 180000)
    requireFact(pending.toolName === 'file_read' && pending.input?.operation === 'file_read' &&
      pending.input.target === file && pending.input.detailsAvailable === true,
      'ADMISSION_V2_NATIVE_FILE_APPROVAL_SCOPE_MISMATCH')
    const inspection = await ipc(evaluate, 'prometheus.uar.operations.read')
    const current = inspection.approvals.find(row => row.ownerSessionId === sessionId &&
      row.state === 'awaiting-human' && `uar:${row.rootRunId}:${row.approvalId}` === pending.approvalId)
    requireFact(current?.admissionId, 'ADMISSION_V2_EXACT_APPROVAL_ID_NOT_CORRELATED')
    const stored = admissions(ownedProfile, row => row.admissionId === current.admissionId)
    requireFact(stored.length === 1 && stored[0].executionKind === 'runtime_native' &&
      stored[0].state === 'awaiting-human', 'ADMISSION_V2_NATIVE_EXECUTION_KIND_NOT_BOUND')
    evidence.pending = { approvalId: pending.approvalId, rawApprovalId: current.approvalId,
      admission: stored[0], actionTargetSha256: digest(pending.input.target) }
    const foreign = await rawIpc(evaluate, 'ai.tool.respond_approval', { topicId,
      approvalId: pending.approvalId + ':foreign', approved: true })
    requireFact(rejected(foreign), 'ADMISSION_V2_FOREIGN_APPROVAL_ACCEPTED')
    stage = 'real-stream-reconnect-with-pending-exact-approval'
    const beforeReconnect = await stream.read()
    await ipc(evaluate, 'ai.stream.detach', { topicId })
    await ipc(evaluate, 'ai.stream.attach', { topicId })
    const reconnected = await ipc(evaluate, 'prometheus.uar.operations.read')
    const sameApproval = reconnected.approvals.find(row => row.admissionId === current.admissionId && row.state === 'awaiting-human')
    requireFact(sameApproval?.rootRunId === current.rootRunId && sameApproval?.approvalId === current.approvalId,
      'ADMISSION_V2_RECONNECT_CHANGED_APPROVAL_AUTHORITY')
    await ipc(evaluate, 'ai.tool.respond_approval', { topicId, approvalId: pending.approvalId, approved: true })
    requireFact(rejected(await rawIpc(evaluate, 'ai.tool.respond_approval', { topicId,
      approvalId: pending.approvalId, approved: true })), 'ADMISSION_V2_APPROVAL_REPLAY_ACCEPTED')
    const completed = await waitFor(signal, async () => {
      const state = await stream.read()
      requireFact(!state.error, 'ADMISSION_V2_NATIVE_FILE_READ_FAILED')
      return state.done && state
    }, 'ADMISSION_V2_NATIVE_READ_NOT_TERMINAL', 180000)
    const message = await terminal(evaluate, signal, sessionId, before, completed)
    requireFact(completed.terminalStatus === 'success' && message.status === 'success' &&
      completed.toolResultContainsMarker && message.searchableText?.includes(configuration.marker),
      'ADMISSION_V2_NATIVE_TOOL_RESULT_NOT_COMMITTED')
    const succeeded = admissions(ownedProfile, row => row.sessionId === sessionId && row.toolName === 'file_read')
    requireFact(succeeded.length === 1 && succeeded[0].admissionId === current.admissionId &&
      succeeded[0].executionKind === 'runtime_native' && succeeded[0].state === 'succeeded' &&
      completed.executionIds.length === 1 && beforeReconnect.executionIds[0] === completed.executionIds[0],
      'ADMISSION_V2_READ_RECONNECT_EFFECT_NOT_SINGLE')
    const persistedModel = message.messageSnapshot?.model
    requireFact(persistedModel?.id === configuration.gateway.alias && persistedModel.provider === 'the-boss-gateway',
      'ADMISSION_V2_NATIVE_READ_MODEL_IDENTITY_MISMATCH')
    evidence.nativeRead = { admission: succeeded[0], messageId: message.id,
      replySha256: digest(message.searchableText), toolResultContainsMarker: true,
      model: { id: persistedModel.id, provider: persistedModel.provider },
      executionId: completed.executionIds[0], reconnectSameRun: true, foreignRefused: true, replayRefused: true }
    evidence.checks.push('actual-proxy-runtime-native-file-read-exact-approval-and-consumption',
      'real-pending-approval-detach-attach-same-execution-without-repeat-effect')
    await stream.close(); stream = null
    stage = 'semantic-stream-cancel-and-fresh-recovery'
    const beforeCancel = new Set((await data(evaluate, 'GET', `/agent-sessions/${sessionId}/messages`)).items.map(row => row.id))
    stream = await capture(evaluate, topicId, configuration.marker)
    await open(evaluate, sessionId, model.id, 'Do not use tools. Write all integers from 1 to 10000, one per line. Do not summarize.', message.id)
    const live = await waitFor(signal, async () => {
      const state = await stream.read()
      requireFact(!state.error && !state.done && !state.approvals.length, 'ADMISSION_V2_SEMANTIC_CANCEL_TURN_UNAVAILABLE')
      return state.textChunks > 0 && state
    }, 'ADMISSION_V2_SEMANTIC_TEXT_NOT_OBSERVED', 180000)
    const cancelRequestedAt = new Date().toISOString()
    await ipc(evaluate, 'ai.stream.abort', { topicId })
    const cancelled = await waitFor(signal, async () => {
      const state = await stream.read()
      requireFact(!state.error, 'ADMISSION_V2_CANCELLATION_STREAM_FAILED')
      return state.done && state
    }, 'ADMISSION_V2_CANCELLATION_NOT_TERMINAL', 60000)
    const paused = await terminal(evaluate, signal, sessionId, beforeCancel, cancelled)
    requireFact(cancelled.terminalStatus === 'paused' && paused.status === 'paused',
      'ADMISSION_V2_CANCELLATION_NOT_PERSISTED')
    const attach = await ipc(evaluate, 'ai.stream.attach', { topicId })
    requireFact(['paused', 'not-found'].includes(attach.status), 'ADMISSION_V2_CANCELLED_EXECUTION_STILL_LIVE')
    evidence.cancel = { requestedAt: cancelRequestedAt, textChunksBeforeCancel: live.textChunks,
      textCharactersBeforeCancel: live.textCharacters, messageId: paused.id,
      terminalStatus: cancelled.terminalStatus, persistedStatus: paused.status, attachStatus: attach.status }
    await stream.close(); stream = null
    const recoveredMarker = configuration.marker + '-recovered'
    const beforeRecovery = new Set((await data(evaluate, 'GET', `/agent-sessions/${sessionId}/messages`)).items.map(row => row.id))
    stream = await capture(evaluate, topicId, recoveredMarker)
    await open(evaluate, sessionId, model.id, `Do not use tools. Reply only with ${recoveredMarker}.`, paused.id)
    const recovered = await waitFor(signal, async () => {
      const state = await stream.read()
      requireFact(!state.error && !state.approvals.length, 'ADMISSION_V2_RECOVERY_STREAM_FAILED')
      return state.done && state
    }, 'ADMISSION_V2_FRESH_RECOVERY_NOT_TERMINAL', 180000)
    const reply = await terminal(evaluate, signal, sessionId, beforeRecovery, recovered)
    requireFact(recovered.terminalStatus === 'success' && reply.status === 'success' && recovered.textChunks > 0 &&
      reply.searchableText?.trim() === recoveredMarker, 'ADMISSION_V2_FRESH_RECOVERY_REPLY_MISMATCH')
    requireFact([paused, reply].every(row => row.messageSnapshot?.model?.id === configuration.gateway.alias &&
      row.messageSnapshot.model.provider === 'the-boss-gateway'), 'ADMISSION_V2_LIFECYCLE_MODEL_IDENTITY_CHANGED')
    requireFact(digest(fs.readFileSync(file)) === evidence.file.sha256, 'ADMISSION_V2_READ_FIXTURE_CHANGED')
    requireFact(fs.readdirSync(configuration.workspaceDirectory).filter(name => name !== '.git').sort().join(',') ===
      'README.md,native-read.txt', 'ADMISSION_V2_UNREQUESTED_WORKSPACE_EFFECT')
    evidence.recovery = { messageId: reply.id, status: reply.status, exactReply: true, textChunks: recovered.textChunks,
      model: { id: reply.messageSnapshot.model.id, provider: reply.messageSnapshot.model.provider } }
    evidence.checks.push('actual-semantic-stream-cancellation-persisted-paused-and-fresh-recovery')
    evidence.complete = true
  } catch (error) { evidence.failure = safeFailure(error, stage) }
  finally {
    if (topicId) try { await ipc(evaluate, 'ai.stream.abort', { topicId }) }
    catch { evidence.cleanupAbortUnconfirmed = true; evidence.complete = false }
    if (stream) try { await stream.close() }
    catch { evidence.listenerCleanupUnconfirmed = true; evidence.complete = false }
    if (priorSettings) try {
      const current = await ipc(evaluate, 'prometheus.uar.settings.read', { namespace: 'native-tools' })
      const result = await ipc(evaluate, 'prometheus.uar.settings.update', { namespace: 'native-tools',
        changes: priorSettings.map(row => ({ ...row, expectedRevision: current.settings.find(field => field.field === row.field).revision })) })
      requireFact(!result.errors?.length, 'ADMISSION_V2_SETTINGS_RESTORE_REFUSED')
      evidence.settingsRestoredForNextRestart = true
    } catch { evidence.cleanupSettingsUnconfirmed = true; evidence.complete = false }
    evidence.finishedAt = new Date().toISOString()
    save(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failure: evidence.failure, evidence: configuration.evidence }) }
}
