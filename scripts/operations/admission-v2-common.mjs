import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { digest, requireFact, waitFor } from '../bossfang-workflow-delegation-operation/io.mjs'

export { digest, requireFact, waitFor }
export async function ipc(evaluate, channel, input = {}) {
  const result = await rawIpc(evaluate, channel, input)
  requireFact(result?.ok && result.data?.ok !== false, 'ADMISSION_V2_IPC_REFUSED')
  return result.data
}
export const rawIpc = (evaluate, channel, input = {}) =>
  evaluate(`window.api.ipcApi.request(${JSON.stringify(channel)},${JSON.stringify(input)})`)
export async function data(evaluate, method, resource, body) {
  const result = await evaluate(`window.api.dataApi.request(${JSON.stringify({ id: randomUUID(), method,
    path: resource, ...(body === undefined ? {} : { body }) })})`)
  requireFact(!result?.error && result?.data, 'ADMISSION_V2_DATA_API_REFUSED')
  return result.data
}
export const rejected = result => !result?.ok || result.data?.ok === false
export const safeFailure = (error, stage) => ({ stage,
  code: /^[A-Za-z][A-Za-z0-9_:-]{0,159}$/.test(error?.code ?? '') ? error.code : 'ADMISSION_V2_OPERATION_UNCONFIRMED' })
export function save(file, evidence) {
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 })
}

// The launcher owns this disposable profile. Read only the sanitized admission
// document; credentials and unrelated application state never leave SQLite.
export async function profile(evaluate, configuration) {
  const info = await ipc(evaluate, 'app.get_info')
  requireFact(info.isPackaged && info.version === configuration.version, 'ADMISSION_V2_PACKAGE_VERSION_MISMATCH')
  const root = fs.realpathSync(info.appDataPath)
  requireFact(path.dirname(root) === fs.realpathSync(os.tmpdir()) &&
    path.basename(root).startsWith('cadence-boss-'), 'ADMISSION_V2_DISPOSABLE_LAUNCHER_PROFILE_REQUIRED')
  return { root, database: path.join(root, 'Data', 'cherrystudio.sqlite'), version: info.version }
}
export function admissions(ownedProfile, predicate) {
  const db = new DatabaseSync(ownedProfile.database, { readOnly: true })
  try {
    const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get('uarToolAdmission:lifecycle')
    const document = row ? JSON.parse(row.value) : { records: [] }
    return document.records.filter(predicate).map(record => ({ admissionId: record.admissionId,
      invocationId: record.invocationId, rootRunId: record.rootRunId, executingRunId: record.executingRunId,
      sessionId: record.sessionId, hostEpoch: record.hostEpoch, authorityRevision: record.authorityRevision,
      executionKind: record.executionKind, toolName: record.toolName, state: record.state,
      hostDisposition: record.hostDisposition, updatedAt: record.updatedAt,
      targetSha256: digest(String(record.actionDisplay?.target ?? '')) }))
  } finally { db.close() }
}

export async function capture(evaluate, topicId, marker) {
  const key = '__integratedAdmission_' + randomUUID().replaceAll('-', '')
  await evaluate(`(() => {
    const topicId=${JSON.stringify(topicId)}, marker=${JSON.stringify(marker)};
    const state=window[${JSON.stringify(key)}]={chunks:0,textChunks:0,textCharacters:0,done:false,error:false,
      terminalStatus:null,anchorMessageId:null,executionIds:[],approvals:[],toolResultContainsMarker:false,
      admissionCompatibilityError:false,off:[]};
    for(const name of ['ai.stream.chunk','ai.stream.done','ai.stream.error']) {
      state.off.push(window.api.ipcApi.on(name,event=>{
        if(event.topicId!==topicId)return;
        if(event.anchorMessageId)state.anchorMessageId=event.anchorMessageId;
        if(event.executionId&&!state.executionIds.includes(event.executionId))state.executionIds.push(event.executionId);
        if(name==='ai.stream.chunk') {
          state.chunks++;
          const c=event.chunk;
          if(c?.type==='text-delta'&&typeof c.delta==='string'&&c.delta.length){state.textChunks++;state.textCharacters+=c.delta.length;}
          if(c?.type==='tool-output-available'&&JSON.stringify(c.output).includes(marker))state.toolResultContainsMarker=true;
          if(c?.type==='tool-approval-request')state.approvals.push({approvalId:c.approvalId,toolCallId:c.toolCallId,
            toolName:c.toolName,input:c.input});
        } else if(name==='ai.stream.error') {
          state.error=true;
          state.admissionCompatibilityError=String(event.error?.message??'').includes('does not support tool admission v2');
        } else if(event.isTopicDone) {
          state.done=true;state.terminalStatus=event.status;
        }
      }));
    }
  })()`)
  return {
    read: () => evaluate(`(() => {const {off,...value}=window[${JSON.stringify(key)}];return value})()`),
    close: () => evaluate(`(() => {const s=window[${JSON.stringify(key)}];if(s){for(const off of s.off)off();delete window[${JSON.stringify(key)}];}})()`)
  }
}
export async function terminal(evaluate, signal, sessionId, before, observed) {
  return waitFor(signal, async () => {
    const rows = (await data(evaluate, 'GET', `/agent-sessions/${sessionId}/messages`)).items
    return rows.find(row => row.role === 'assistant' && !before.has(row.id) && row.status !== 'pending' &&
      (!observed.anchorMessageId || row.id === observed.anchorMessageId))
  }, 'ADMISSION_V2_TERMINAL_MESSAGE_NOT_PERSISTED', 60000)
}
