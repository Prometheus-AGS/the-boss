import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { digest, requireFact, write } from '../reusable-team-operation/io.mjs'

export function command(binary, args, cwd) {
  const env = Object.fromEntries(['PATH', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot'].filter((key) =>
    process.env[key] !== undefined).map((key) => [key, process.env[key]]))
  return spawnSync(binary, args, { cwd, env, shell: false, encoding: 'utf8', timeout: 30000,
    maxBuffer: 16 * 1024 * 1024 })
}

export function creator(cli, cwd, evidence) {
  const stateFile = path.join(cwd, 'team-state.json')
  const read = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  function call(name, input, refusal = false) {
    const request = path.join(cwd, 'request-' + randomUUID() + '.json')
    write(request, { state: stateFile, ...input })
    const result = command(process.execPath, [cli, name, '--input', request], cwd)
    let errorCode = null
    if (result.error) errorCode = result.error.code === 'ETIMEDOUT' ? 'C15H_CREATOR_TIMEOUT' : 'C15H_CREATOR_UNAVAILABLE'
    else if (result.status !== 0) {
      let message = ''
      try { message = JSON.parse(result.stderr).error ?? '' } catch {}
      errorCode = message.startsWith('Task revision conflict:') ? 'C15H_TASK_REVISION_CONFLICT' : 'C15H_CREATOR_REFUSED'
    }
    evidence.commands.push({ command: name, exitCode: result.status, errorCode,
      stdoutSha256: digest(result.stdout ?? ''), producerCliSha256: digest(fs.readFileSync(cli)) })
    if (refusal) return { errorCode, exitCode: result.status }
    requireFact(errorCode === null && result.status === 0, errorCode ?? 'C15H_CREATOR_UNAVAILABLE')
    try { return JSON.parse(result.stdout) } catch { requireFact(false, 'C15H_CREATOR_OUTPUT_INVALID') }
  }
  return { stateFile, read, call,
    mutate: (name, input) => call(name, { expectedRevision: read().revision, ...input }) }
}

export const team = () => ({ schemaVersion: 1, id: 'c15-handoff-operation',
  outcome: 'Carry selected local provenance to an explicitly accepted destination', scope: 'project', harness: 'codex',
  roles: ['implementer', 'reviewer'].map((id) => ({ id, description: id + ' local handoff responsibility',
    prompt: 'Inspect selected provenance and current ownership before taking work.', skills: [],
    owns: id === 'implementer' ? ['source/'] : [], inputs: ['Selected provenance'], outputs: ['Local receipts'], dependsOn: [] })) })

export function addTask(runtime, id, kbd) {
  runtime.mutate('task', { task: { action: 'add', id, title: 'Local handoff operation',
    owner: 'implementer', harness: 'codex', evidence: [], remaining: ['Parent criteria remain open'],
    ...(kbd ? { kbd } : {}) } })
}

export function create(runtime, id, cwd, provenance, memoryRefs = []) {
  const task = runtime.read().tasks.find((item) => item.id === id)
  const result = runtime.mutate('handoff-create', { cwd, handoff: {
    taskId: id, owner: task.owner, expectedTaskRevision: task.revision,
    toOwner: 'reviewer', toHarness: 'claude', context: 'Inspect this disposable local transfer; canonical work stays open.',
    evidence: [], remaining: ['Parent criteria remain open'], memoryRefs,
    ...(provenance ? { provenance } : {}) } })
  return result.handoffs.at(-1)
}

export function canonical(kbdCli, kbdPath) {
  const result = command(kbdCli, ['kbd', '--path', kbdPath, 'status', '--json'], kbdPath)
  requireFact(!result.error && result.status === 0, 'C15H_CANONICAL_READER_UNAVAILABLE')
  let value
  try { value = JSON.parse(result.stdout) } catch { requireFact(false, 'C15H_CANONICAL_OUTPUT_INVALID') }
  const phaseId = 'agent-fabric-convergence'
  const changeId = 'afc-c15-portable-skills-plugin-contracts-and-cross-harness-handoff'
  const taskId = 'C15.3'
  const phase = value.phases?.[phaseId]
  const change = phase?.changes?.[changeId]
  const task = change?.tasks?.[taskId]
  requireFact(phase?.id === phaseId && change?.id === changeId && task?.id === taskId &&
    typeof value.projectId === 'string' && typeof value.runId === 'string', 'C15H_CANONICAL_IDENTITY_UNAVAILABLE')
  return { path: kbdPath, identity: { projectId: value.projectId, runId: value.runId, phaseId, changeId, taskId },
    observation: 'observed', revision: value.revision, eventId: value.lastEventId ?? null,
    taskStatus: task.status, receiptSha256: digest(result.stdout) }
}
