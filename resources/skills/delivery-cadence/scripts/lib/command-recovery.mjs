import { evidenceFile } from './children.mjs';
export function assertCommandReplay(state, commandId) {
  if (state?.commandErrors?.[commandId]) throw new Error(state.commandErrors[commandId].message);
  if (state?.commandSignatures?.[commandId] && !state.commandResults?.[commandId]
      && state.commandRecoveries?.[commandId]?.status !== 'not-applied') {
    throw new Error('Command outcome unknown after interruption: ' + commandId + '. Inspect canonical state and effects; resume with commandRecovery evidence before retrying.');
  }
}
export async function reconcileCommand(state, input) {
  const { commandId, evidencePath } = input;
  if (!state.commandSignatures?.[commandId] || state.commandResults?.[commandId] || state.commandErrors?.[commandId]) throw new Error('Only an interrupted command without a terminal result can be reconciled');
  const evidence = await evidenceFile(evidencePath), doc = evidence.document;
  if (doc.runId !== state.runId || doc.commandId !== commandId || doc.outcome !== 'not-applied'
      || doc.inspectedRevision !== state.eventsSeq - 1 || !doc.authorityRef || !doc.reason
      || !Array.isArray(doc.effectChecks) || !doc.effectChecks.length
      || doc.effectChecks.some(check => check.absent !== true || !check.evidence)) {
    throw new Error('Command recovery needs matching run/command, inspected current revision, authority, reason and evidence that all effects were absent');
  }
  state.commandRecoveries ??= {};
  const receipt = { status:'not-applied', recordedAt:new Date().toISOString(), evidencePath:evidence.path, sha256:evidence.sha256, authorityRef:doc.authorityRef };
  state.commandRecoveries[commandId] = receipt;
  return { commandId, ...receipt, next:'Explicit retry with the original command ID and unchanged input is allowed once.' };
}
