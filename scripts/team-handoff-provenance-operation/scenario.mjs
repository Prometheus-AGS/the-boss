import { isDeepStrictEqual } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

import { digest, requireFact, waitFor, write } from '../reusable-team-operation/io.mjs'
import { addTask, canonical, create, creator, team } from './creator.mjs'
import { legacy } from './legacy.mjs'
import { inspection, packetIdentity } from './receipts.mjs'

export async function scenario({ evaluate, targets, signal }, configuration) {
  const evidence = { schemaVersion: 1, kind: 'packaged-team-handoff-provenance-operation', creationTaskRef: 'C15.3',
    complete: false, startedAt: new Date().toISOString(), sourceRefs: configuration.sourceRefs, checks: [], commands: [],
    mutationSurface: 'actual bundled agent-team-creator CLI; isolated local team state',
    canonicalSurface: 'explicit read-only kbd status; no canonical task transition',
    memoryPublication: 'not-invoked', nativeDestinationSession: 'not-launched',
    nativeWindowsAcceptance: 'pending', wholeC15_3Completion: 'pending', rawContentRecorded: false }
  let stage = 'packaged-application-readiness'
  try {
    requireFact(targets.some((target) => target.type === 'page' &&
      target.url.includes('/windows/main/index.html') && !/^https?:/i.test(target.url)), 'C15H_PACKAGED_MAIN_TARGET_UNAVAILABLE')
    const application = await waitFor(signal, () => evaluate(`(() => {
      if(document.readyState!=='complete'||!document.body?.getClientRects().length||
        typeof window.api?.ipcApi?.request!=='function')return null;
      return {timeOrigin:performance.timeOrigin,readyState:document.readyState,ipcAvailable:true};})()`),
    'C15H_PACKAGED_APPLICATION_NOT_READY')
    evidence.application = application
    stage = 'read-real-canonical-identity'
    const before = canonical(configuration.kbdCli, configuration.kbdPath)
    evidence.canonicalBefore = before
    const runtime = creator(configuration.creatorCli, configuration.workspaceDirectory, evidence)
    runtime.call('init', { team: team() })
    addTask(runtime, 'handoff-local-task', before.identity)
    stage = 'queue-existing-scoped-memory'
    const memoryId = 'c15-handoff-operation-memory'
    runtime.mutate('memory-queue', { projectId: before.identity.projectId, entry: {
      id: memoryId, content: 'Selected disposable handoff provenance remains local; inspect current references before acceptance.',
      scope: 'role:implementer', roleId: 'implementer', kind: 'progress', provenance: { kbd: before.identity },
      author: { harness: 'codex', agentId: 'implementer' } } })
    const queued = runtime.read().outbox.find((item) => item.id === memoryId)
    requireFact(queued?.status === 'queued' && queued.scope === 'role:implementer' && queued.receipt === undefined,
      'C15H_MEMORY_NOT_LOCAL_QUEUED')
    stage = 'capture-dirty-source-and-provenance'
    const source = path.join(configuration.workspaceDirectory, 'source')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'changed.md'), 'Disposable selected source before local transfer.\n', { flag: 'wx', mode: 0o600 })
    fs.writeFileSync(path.join(source, 'missing.md'), 'Disposable selected reference retained at capture.\n', { flag: 'wx', mode: 0o600 })
    const selectedEvidence = path.join(configuration.workspaceDirectory, 'application-ready.json')
    write(selectedEvidence, { schemaVersion: 1, observation: 'real-packaged-main-ready', ...application,
      appAsarSha256: configuration.sourceRefs.appAsarSha256 })
    const selection = { sourceFiles: ['source/changed.md', 'source/missing.md'], evidenceFiles: [selectedEvidence],
      karpathyFiles: [configuration.karpathyFile], memoryIds: [memoryId],
      kbdCli: configuration.kbdCli, kbdPath: configuration.kbdPath }
    const packet = create(runtime, 'handoff-local-task', configuration.workspaceDirectory, selection, [memoryId])
    evidence.packet = packetIdentity(packet)
    evidence.capturedProvenanceSha256 = digest(JSON.stringify(packet.provenance))
    requireFact(packet.git.dirty === true && packet.provenance?.schemaVersion === 1,
      'C15H_DIRTY_SOURCE_PROVENANCE_NOT_CAPTURED')
    const inspect = (id) => runtime.call('handoff-inspect', { id, cwd: configuration.workspaceDirectory,
      kbdCli: configuration.kbdCli, kbdPath: configuration.kbdPath })
    const initialBytes = digest(fs.readFileSync(runtime.stateFile))
    const initial = inspect(packet.id)
    evidence.initialInspection = inspection(initial)
    requireFact(digest(fs.readFileSync(runtime.stateFile)) === initialBytes, 'C15H_INSPECTION_MUTATED_STATE')
    requireFact(initial.legacy === false && initial.ownership.owner === 'implementer' &&
      initial.ownership.harness === 'codex' && initial.ownership.acceptedAt === null && !initial.ownership.stale,
      'C15H_CAPTURE_TRANSFERRED_OWNERSHIP')
    requireFact(initial.captured.canonical.observation === 'observed' &&
      isDeepStrictEqual(initial.captured.canonical.identity, before.identity) &&
      initial.captured.canonical.taskStatus === before.taskStatus, 'C15H_CANONICAL_CAPTURE_NOT_OBSERVED')
    for (const group of ['sources', 'evidence', 'karpathy', 'memory'])
      requireFact(initial.current[group].length > 0 && initial.current[group].every((row) => row.comparison === 'matches'),
        'C15H_SELECTED_PROVENANCE_NOT_MATCHING')
    const memory = initial.captured.memory[0]
    requireFact(memory.id === memoryId && memory.status === 'queued' && memory.scope === 'role:implementer' &&
      memory.projectId === before.identity.projectId && isDeepStrictEqual(memory.kbd, before.identity) &&
      memory.contentSha256 && memory.provenanceSha256 && memory.publication === null, 'C15H_MEMORY_PROVENANCE_NOT_RETAINED')
    evidence.checks.push('actual-packaged-creator-captures-dirty-files-evidence-karpathy-and-local-scoped-memory',
      'real-canonical-task-identity-status-read-without-transition', 'read-only-inspection-preserves-source-ownership')
    stage = 'inspect-changed-and-missing-source'
    fs.writeFileSync(path.join(source, 'changed.md'), 'Disposable selected source changed after capture.\n', { mode: 0o600 })
    fs.unlinkSync(path.join(source, 'missing.md'))
    const changedBytes = digest(fs.readFileSync(runtime.stateFile))
    const changed = inspect(packet.id)
    evidence.changedInspection = inspection(changed)
    requireFact(changed.current.sources[0].comparison === 'changed' && changed.current.sources[1].comparison === 'missing' &&
      changed.ownership.owner === 'implementer' && changed.ownership.acceptedAt === null &&
      digest(fs.readFileSync(runtime.stateFile)) === changedBytes &&
      isDeepStrictEqual(changed.captured, initial.captured), 'C15H_CHANGED_SOURCE_INSPECTION_INCORRECT')
    evidence.checks.push('changed-and-missing-selected-source-reported-without-rewriting-capture')
    stage = 'explicit-destination-acceptance'
    runtime.mutate('handoff-accept', { id: packet.id, destination: { owner: 'reviewer', harness: 'claude' } })
    const accepted = inspect(packet.id)
    evidence.acceptedInspection = inspection(accepted)
    const acceptedState = runtime.read()
    requireFact(accepted.ownership.owner === 'reviewer' && accepted.ownership.harness === 'claude' &&
      accepted.ownership.revision === packet.taskRevision + 1 && accepted.ownership.acceptedAt &&
      accepted.ownership.stale === false && isDeepStrictEqual(accepted.captured, initial.captured) &&
      acceptedState.outbox[0].status === 'queued' && acceptedState.outbox[0].receipt === undefined &&
      acceptedState.tasks[0].status !== 'complete', 'C15H_EXPLICIT_ACCEPTANCE_NOT_PRESERVED')
    evidence.checks.push('explicit-cross-harness-local-ownership-transfer-retains-provenance-and-queued-memory')
    stage = 'stale-task-revision-refusal'
    addTask(runtime, 'stale-local-task')
    const stale = create(runtime, 'stale-local-task', configuration.workspaceDirectory)
    runtime.mutate('task', { task: { action: 'start', id: stale.taskId, owner: 'implementer',
      expectedTaskRevision: stale.taskRevision } })
    const staleBefore = digest(fs.readFileSync(runtime.stateFile))
    const refusal = runtime.call('handoff-accept', { expectedRevision: runtime.read().revision, id: stale.id,
      destination: { owner: 'reviewer', harness: 'claude' } }, true)
    evidence.staleRefusal = { packet: packetIdentity(stale), ...refusal, beforeStateSha256: staleBefore,
      afterStateSha256: digest(fs.readFileSync(runtime.stateFile)), inspection: inspection(inspect(stale.id)) }
    requireFact(refusal.exitCode !== 0 && refusal.errorCode === 'C15H_TASK_REVISION_CONFLICT' &&
      evidence.staleRefusal.afterStateSha256 === staleBefore && evidence.staleRefusal.inspection.ownership.stale &&
      evidence.staleRefusal.inspection.ownership.owner === 'implementer', 'C15H_STALE_ACCEPTANCE_NOT_REFUSED')
    evidence.checks.push('stale-original-task-revision-refused-without-state-mutation')
    stage = 'genuine-prior-packaged-producer-legacy-read'
    legacy(configuration, evidence)
    evidence.checks.push('prior-packaged-producer-legacy-packet-readable-without-invented-provenance')
    stage = 'canonical-task-remains-unchanged'
    evidence.canonicalAfter = canonical(configuration.kbdCli, configuration.kbdPath)
    requireFact(isDeepStrictEqual(evidence.canonicalAfter.identity, before.identity) &&
      evidence.canonicalAfter.taskStatus === before.taskStatus, 'C15H_CANONICAL_TASK_CHANGED_DURING_OPERATION')
    evidence.checks.push('canonical-parent-task-status-unchanged')
    evidence.complete = true
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
    return { passed: true, observedBehavior: JSON.stringify({ checks: evidence.checks,
      packetId: packet.id, ownership: accepted.ownership, memoryPublication: 'not-invoked', wholeC15_3Completion: 'pending' }) }
  } catch (error) {
    evidence.failureStage = stage
    evidence.failureCode = /^C15H_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code :
      error.message === 'Renderer evaluation failed.' ? 'C15H_RENDERER_EVALUATION_FAILED' : 'C15H_OPERATION_UNAVAILABLE'
    evidence.finishedAt = new Date().toISOString()
    write(configuration.evidence, evidence)
    throw Object.assign(new Error(evidence.failureCode), { code: evidence.failureCode })
  }
}
