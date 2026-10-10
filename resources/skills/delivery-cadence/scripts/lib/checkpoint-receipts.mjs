import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { artifactReceipts, captureSources, sameSources } from './checkpoints.mjs';
import { checkpointPurpose } from './delivery-contract.mjs';
import { jobTransaction, claimCommand, digest, immutableJson, now } from './jobs.mjs';
import { saveEvent } from './storage.mjs';
import { assertFrozenReconciliation } from './frozen-source-reconciliation.mjs';

export async function adoptCheckpoint(root, input = {}, args = {}) {
  const bytes = input.receiptPath ? await fs.readFile(path.resolve(input.receiptPath)) : Buffer.from(JSON.stringify(input.receipt));
  const receipt = JSON.parse(bytes), receiptDigest = createHash('sha256').update(bytes).digest('hex');
  if (!receipt.receiptId || !receipt.producer || !receipt.candidateId || !receipt.contentManifestDigest) throw new Error('External receipt needs receiptId, producer, candidate and content manifest identity');
  if (receipt.status !== 'success' || receipt.exitCode !== 0) throw new Error('Only an independently successful checkpoint receipt can be adopted');
  if (!receipt.platform || !receipt.architecture || !receipt.logPath || !receipt.logSha256) throw new Error('Receipt needs platform, architecture and immutable log provenance');
  const start = Date.parse(receipt.startedAt), end = Date.parse(receipt.finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Receipt timing must be ordered');
  const logBytes = await fs.readFile(path.resolve(receipt.logPath));
  if (createHash('sha256').update(logBytes).digest('hex') !== receipt.logSha256) throw new Error('Receipt log bytes changed');
  const artifacts = await artifactReceipts(receipt.artifacts ?? []);
  for (const artifact of artifacts) {
    const expected = receipt.artifacts.find(a => path.resolve(a.path) === artifact.path);
    if (expected.sha256 !== artifact.sha256 || expected.size !== artifact.size) throw new Error(`Receipt artifact bytes do not match: ${artifact.path}`);
  }
  return jobTransaction(root, async state => {
    const prior = claimCommand(state, 'checkpoint:adopt', input, args); if (prior) { if (prior.receiptDigest !== receiptDigest) throw new Error('Previously adopted receipt bytes changed'); return prior; }
    state.adoptedReceipts ??= [];
    const known = state.adoptedReceipts.find(r => r.receiptId === receipt.receiptId);
    if (known) {
      if (known.receiptDigest !== receiptDigest) throw new Error('Receipt identity reused with different contents');
      state.commandResults[args.commandId] = known;
      await saveEvent(root, state, 'checkpoint.adoption-reused', { receiptId: receipt.receiptId }); return known;
    }
    const candidate = state.candidates?.find(c => (c.id ?? c.candidateId) === receipt.candidateId);
    const iteration = state.iterations.find(i => i.id === candidate?.iterationId);
    if (!candidate || !iteration || iteration.candidateId !== receipt.candidateId || candidate.contentManifestDigest !== receipt.contentManifestDigest || !sameSources(receipt.sourceRefs, candidate.sourceRefs)) throw new Error('Receipt does not match the active frozen candidate inputs');
    if (!['ready','checkpoint-failed'].includes(iteration.status)) throw new Error('Only a completed candidate may adopt checkpoint evidence');
    const step = iteration.profile.checkpoints.find(c => c.id === (input.id ?? receipt.checkpointId));
    if (!step) throw new Error('Receipt checkpoint is not in the approved profile');
    const command = { command: step.command, args: step.args ?? [], cwd: path.resolve(step.cwd) };
    if (digest(receipt.command) !== digest(command)) {
      const authorized = (step.equivalentCommands ?? []).find(c => c.authorityRef && digest(c.command) === digest(receipt.command));
      if (!authorized || receipt.equivalenceAuthority !== authorized.authorityRef) throw new Error('Command differs from approved recipe without configured equivalence authority');
    }
    if (receipt.recipeDigest !== digest(step)) throw new Error('Receipt recipe digest differs from frozen checkpoint');
    if ((step.platform && step.platform !== receipt.platform) || (step.architecture && step.architecture !== receipt.architecture)) throw new Error('Receipt platform/architecture differs from checkpoint');
    const purpose = checkpointPurpose(iteration, step);
    const reconciliation = purpose === 'feature' ? await assertFrozenReconciliation(root, state, candidate, iteration) : null;
    if (purpose === 'feature' && !reconciliation &&
        !sameSources(await captureSources(candidate.sourceRefs, root), candidate.sourceRefs))
      throw new Error('Changed feature-operation source needs frozen artifact reconciliation');
    if (reconciliation && (receipt.operatedSource?.dirtyDiffSha256 !== reconciliation.operatedSource.dirtyDiffSha256 ||
        receipt.operatedSource?.driverSha256 !== reconciliation.operatedSource.driverSha256 ||
        receipt.operationEvidenceSha256 !== reconciliation.operationEvidence.sha256))
      throw new Error('Feature receipt lacks the reconciled operation-time driver and evidence identity');
    if (step.kind === 'run') {
      const preceding = checkpoint => iteration.checkpoints.some(r => r.id === checkpoint.id && r.status === 'success' && !r.invalidatedAt && sameSources(r.sourceRefs, candidate.sourceRefs) && Date.parse(r.finishedAt) <= start);
      if (!iteration.profile.checkpoints.filter(c => c.kind === 'build' && c.required !== false).every(preceding)) throw new Error('Adopt build evidence before run evidence, with ordered operation timestamps');
      if (purpose === 'feature' && !iteration.profile.checkpoints.some(c => checkpointPurpose(iteration, c) === 'launch' && preceding(c))) throw new Error('Feature evidence needs preceding source-bound launch evidence');
    }
    if (purpose === 'feature') {
      const operation = receipt.featureOperation, expected = iteration.featureOperation;
      if (operation?.id !== expected.id || operation.operated !== true || operation.evidenceLevel !== expected.evidenceLevel || operation.targetClassification !== expected.target?.kind) throw new Error('Receipt does not prove the promised feature operation at its declared evidence level');
    }
    if (step.kind === 'build' && !artifacts.length) throw new Error('Adopted build requires actual checksummed artifacts');
    const file = path.join(root, 'adopted-receipts', `${receiptDigest}.json`);
    await immutableJson(file, receipt);
    const record = { ...receipt, id: step.id, attemptId: randomUUID(), kind: step.kind, purpose, ...(purpose === 'feature' ? { featureOperationId: iteration.featureOperation.id } : {}),
      receiptDigest, receiptPath: file, adoptedAt: now(), artifacts, commandId: args.commandId, sourceRefs: candidate.sourceRefs,
      ...(reconciliation ? { frozenSourceReconciliation: reconciliation.sha256, operatedSource: reconciliation.operatedSource } : {}) };
    state.adoptedReceipts.push(record); iteration.checkpoints.push(record); iteration.status = 'ready';
    state.commandResults[args.commandId] = structuredClone(record);
    await saveEvent(root, state, 'checkpoint.adopted', { receiptId: receipt.receiptId, candidateId: receipt.candidateId }); return record;
  });
}
