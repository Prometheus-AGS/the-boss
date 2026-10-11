import fs from 'node:fs'
import { capture, data, digest, ipc, profile, rawIpc, rejected, requireFact, safeFailure, save, waitFor } from './admission-v2-common.mjs'

export async function scenario({ evaluate, signal }, configuration) {
  const evidence = { schemaVersion: 1, kind: 'integrated-admission-v2-older-instance-refusal', complete: false,
    startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs, checks: [], credentialValueRecorded: false,
    limitations: ['Requires an operator supplied actual, separately owned v1 UAR instance; no fabricated capability endpoint.',
      'Read-only provider catalog comparison and local configuration/discovery only; no new remote administration compatibility.'] }
  let stage = 'owned-packaged-profile', originalSelection, oldId, topicId, stream
  try {
    await profile(evaluate, configuration)
    const old = configuration.oldInstance
    requireFact(old?.instance?.ownership === 'external' && old.instance.id !== 'managed-local' &&
      /^[0-9a-f]{40}$/.test(old.source) && /^[0-9a-f]{64}$/.test(old.binarySha256),
      'ADMISSION_V2_REAL_OLDER_INSTANCE_PROVENANCE_REQUIRED')
    requireFact(digest(fs.readFileSync(old.binaryPath)) === old.binarySha256,
      'ADMISSION_V2_OLDER_BINARY_IDENTITY_MISMATCH')
    const manifest = JSON.parse(fs.readFileSync(old.payloadManifestPath, 'utf8'))
    requireFact(manifest.source === old.source, 'ADMISSION_V2_OLDER_PAYLOAD_SOURCE_MISMATCH')
    for (const name of [old.runtimeCredentialEnv, old.adminCredentialEnv]) requireFact(
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(name ?? '') && process.env[name]?.trim(),
      'ADMISSION_V2_OLDER_CREDENTIAL_REFERENCE_UNAVAILABLE')
    for (const value of Object.values(old.instance.endpoints).filter(Boolean)) {
      const url = new URL(value)
      requireFact(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username &&
        !url.password && !url.search && !url.hash, 'ADMISSION_V2_OWNED_LOOPBACK_OLDER_INSTANCE_REQUIRED')
    }
    const headers = { authorization: 'Bearer ' + process.env[old.runtimeCredentialEnv],
      'x-uar-admin-key': process.env[old.adminCredentialEnv] }
    const read = async resource => {
      const response = await fetch(new URL(resource, old.instance.endpoints.administration), { headers, signal })
      requireFact(response.ok, 'ADMISSION_V2_OLDER_READ_ONLY_ENDPOINT_UNAVAILABLE')
      return response.json()
    }
    const actual = await read('/api/uar/capabilities')
    requireFact(!actual.capabilities.includes('tool_admission_v2') && actual.capabilities.includes('full_harness_delegation_v1') &&
      actual.instance.id === old.instance.expectedRuntimeId && actual.ownership === 'external',
      'ADMISSION_V2_ACTUAL_V1_INSTANCE_REQUIRED')
    evidence.olderInstance = { source: old.source, binaryPath: old.binaryPath, binarySha256: old.binarySha256,
      payloadManifestSha256: digest(fs.readFileSync(old.payloadManifestPath)), version: actual.uar_version,
      instanceId: actual.instance.id, capabilities: actual.capabilities }
    // Hash only the response; protected catalog content is never placed in a receipt.
    const beforeCatalog = digest(JSON.stringify(await read('/api/uar/providers')))
    const initial = await ipc(evaluate, 'prometheus.uar.instances.read')
    originalSelection = initial.selectedInstanceId
    requireFact(!initial.instances.some(row => row.id === old.instance.id), 'ADMISSION_V2_OLDER_INSTANCE_ID_ALREADY_EXISTS')
    oldId = old.instance.id
    const saved = await ipc(evaluate, 'prometheus.uar.instances.save', { expectedRevision: initial.revision,
      instance: old.instance, runtimeCredential: { operation: 'set', value: process.env[old.runtimeCredentialEnv] },
      adminCredential: { operation: 'set', value: process.env[old.adminCredentialEnv] } })
    await ipc(evaluate, 'prometheus.uar.instances.select', { expectedRevision: saved.revision, instanceId: oldId })
    const tested = await ipc(evaluate, 'prometheus.uar.instances.test', { instanceId: oldId })
    const selected = tested.instances.find(row => row.id === oldId)
    requireFact(tested.selectedInstanceId === oldId && selected?.compatibility === 'incompatible' &&
      selected.checks.reachable === true && selected.checks.authenticated === true && selected.observed?.version === actual.uar_version &&
      selected.diagnostic?.includes(actual.uar_version) && /update|upgrade|更新/i.test(selected.diagnostic),
      'ADMISSION_V2_ACTIONABLE_INCOMPATIBILITY_NOT_VISIBLE')
    evidence.discovery = { localInventoryReadable: true, selectedInstanceId: tested.selectedInstanceId,
      compatibility: selected.compatibility, checks: selected.checks,
      diagnostic: selected.diagnostic, observedVersion: selected.observed.version }
    stage = 'v2-dependent-catalog-mutation-refused'
    const mutation = await rawIpc(evaluate, 'prometheus.uar.providers.default', { id: 'admission-v2-refusal-only' })
    requireFact(rejected(mutation) && mutation.error?.message?.includes('does not support tool admission v2'),
      'ADMISSION_V2_OLDER_CATALOG_MUTATION_NOT_REFUSED_FOR_CAPABILITY')
    stage = 'actual-work-execution-refused-before-admission'
    const models = await data(evaluate, 'GET', '/models')
    const model = models.find(row => row.isEnabled && !/^(claude-code|openai-codex)::/.test(row.id))
    requireFact(model, 'ADMISSION_V2_LOCAL_COMPATIBILITY_MODEL_UNAVAILABLE')
    const workspace = await data(evaluate, 'POST', '/agent-workspaces', { path: configuration.workspaceDirectory })
    const agent = await ipc(evaluate, 'ai.agent.create', { type: 'uar', name: configuration.marker,
      instructions: 'Do not use tools. Reply only with the requested marker.', model: model.id, mcps: [],
      configuration: { permission_mode: 'default' } })
    const session = await rawIpc(evaluate, 'ai.agent.session.reuse_or_create', { agentId: agent.id,
      workspace: { type: 'user', workspaceId: workspace.id } })
    let refused
    if (rejected(session)) {
      requireFact(session.error?.message?.includes('does not support tool admission v2'),
        'ADMISSION_V2_OLDER_SESSION_REFUSED_FOR_UNRELATED_REASON')
      refused = { boundary: 'session-placement', nativeRunAdmitted: false }
    } else {
      topicId = `agent-session:${session.data.session.id}`
      stream = await capture(evaluate, topicId, configuration.marker)
      const opened = await rawIpc(evaluate, 'ai.stream.open', { trigger: 'submit-message', topicId,
        mentionedModelIds: [model.id], userMessageParts: [{ type: 'text', text: `Reply only with ${configuration.marker}.` }] })
      if (rejected(opened)) {
        requireFact(opened.error?.message?.includes('does not support tool admission v2'),
          'ADMISSION_V2_OLDER_OPEN_REFUSED_FOR_UNRELATED_REASON')
        refused = { boundary: 'stream-open', nativeRunAdmitted: false }
      } else refused = await waitFor(signal, async () => {
        const state = await stream.read()
        requireFact(!state.textChunks && !state.approvals.length, 'ADMISSION_V2_OLDER_EXECUTION_EMITTED_MODEL_OR_TOOL_OUTPUT')
        requireFact(!state.done || state.error || state.terminalStatus === 'error', 'ADMISSION_V2_OLDER_EXECUTION_COMPLETED')
        if (!state.error && state.terminalStatus !== 'error') return false
        requireFact(state.admissionCompatibilityError, 'ADMISSION_V2_OLDER_TURN_FAILED_FOR_UNRELATED_REASON')
        return { boundary: 'runtime-admission', nativeRunAdmitted: false, terminalFailure: true }
      }, 'ADMISSION_V2_OLDER_EXECUTION_NOT_REFUSED', 60000)
    }
    const afterCatalog = digest(JSON.stringify(await read('/api/uar/providers')))
    requireFact(beforeCatalog === afterCatalog, 'ADMISSION_V2_OLDER_PROVIDER_CATALOG_CHANGED')
    evidence.refusal = { catalogMutationRefused: true, execution: refused, providerCatalogBeforeSha256: beforeCatalog,
      providerCatalogAfterSha256: afterCatalog, providerCatalogUnchanged: true, externalWritesSubmitted: false }
    evidence.checks.push('actual-v1-capability-selected-actionable-incompatibility-local-config-readable',
      'v2-dependent-catalog-mutation-and-work-execution-refused-with-provider-catalog-unchanged')
    evidence.complete = true
  } catch (error) { evidence.failure = safeFailure(error, stage) }
  finally {
    if (topicId) try { await ipc(evaluate, 'ai.stream.abort', { topicId }) }
    catch { evidence.cleanupAbortUnconfirmed = true; evidence.complete = false }
    if (stream) try { await stream.close() }
    catch { evidence.listenerCleanupUnconfirmed = true; evidence.complete = false }
    if (originalSelection) try {
      const current = await ipc(evaluate, 'prometheus.uar.instances.read')
      const restored = await ipc(evaluate, 'prometheus.uar.instances.select', { expectedRevision: current.revision, instanceId: originalSelection })
      if (oldId) await ipc(evaluate, 'prometheus.uar.instances.delete', { expectedRevision: restored.revision, instanceId: oldId })
      evidence.originalSelectionRestored = true
    } catch { evidence.cleanupSelectionUnconfirmed = true; evidence.complete = false }
    evidence.finishedAt = new Date().toISOString()
    save(configuration.evidence, evidence)
  }
  return { passed: evidence.complete, observedBehavior: JSON.stringify({ complete: evidence.complete,
    checks: evidence.checks, failure: evidence.failure, evidence: configuration.evidence }) }
}
