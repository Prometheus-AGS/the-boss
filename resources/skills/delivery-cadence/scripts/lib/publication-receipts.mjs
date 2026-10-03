import { clone, digest, fail, nonempty, timestamp } from './pipeline-data.mjs';

export const requiredCapabilities = ['immutableSourceDispatch', 'externalCorrelation', 'artifactProvenance', 'targetSerialization', 'expectedPredecessorPromotion', 'siteReceipts'];
export function assessConsumer(adapter) {
  const missing = requiredCapabilities.filter(key => adapter?.capabilities?.[key]?.supported !== true || !nonempty(adapter.capabilities[key].evidenceRef));
  return { adapterId: adapter?.id ?? null, supported: missing.length === 0, missing,
    owner: adapter?.owner ?? null, nextAction: missing.length ? adapter?.nextAction ?? 'Provide a consumer with enforceable source, target serialization and promotion receipts; no dispatch authorized' : null };
}
export function receiptDigest(receipt) {
  const { digest: ignored, ...content } = receipt; return digest(content);
}
export function validatePublicationReceipt(receipt, obligation, attempt, candidate) {
  if (!nonempty(receipt?.id)) fail('Publication receipt needs a stable ID');
  if (receipt.candidateId !== obligation.candidateId || receipt.obligationId !== obligation.id || receipt.attemptId !== attempt.id) fail('Publication receipt identity does not match its frozen attempt');
  if (receipt.contentManifestDigest !== obligation.contentManifestDigest) fail('Publication receipt has different frozen source inputs');
  if (receipt.version !== attempt.releaseVersion) fail('Publication receipt version differs from the dispatched version');
  const actualDigest = receiptDigest(receipt);
  if (receipt.digest && receipt.digest !== actualDigest) fail('Publication receipt digest does not match content');
  const effect = receipt.effect;
  if (!obligation.requiredEffects.includes(effect)) fail(`Receipt effect is not required by this obligation: ${effect}`);
  if (!attempt.effects.includes(effect)) fail(`Receipt effect was not authorized by this attempt: ${effect}`);
  if (!nonempty(receipt.verifiedAt)) fail('Publication receipt requires observed verifiedAt; recording time is not verification time');
  timestamp(receipt.verifiedAt);
  if (!receipt.sourceRefs || digest(receipt.sourceRefs) !== digest(candidate.sourceRefs ?? candidate.repositories ?? [])) fail('Publication receipt must retain exact actual source refs');
  if (effect.startsWith('artifact:')) {
    if (receipt.platform !== effect.slice(9) || !/^[a-f0-9]{64}$/i.test(receipt.sha256 ?? '') || !Number.isSafeInteger(receipt.size) || receipt.size < 1 || !nonempty(receipt.url)) fail('Artifact receipt needs platform, SHA-256, nonzero byte size and URL');
    if (!nonempty(receipt.architecture) || !['signed', 'unsigned', 'unknown', 'ad-hoc'].includes(receipt.signingStatus)) fail('Artifact receipt needs architecture and accurate signingStatus');
    if (!nonempty(receipt.byteVerificationRef)) fail('Artifact receipt requires downloaded-byte verification evidence');
    const url = new URL(receipt.url); if (!['https:', 'http:'].includes(url.protocol)) fail('Artifact URL must be HTTP(S)');
  } else if (effect === 'metadata') {
    if (!nonempty(receipt.commit) || !nonempty(receipt.url)) fail('Metadata receipt needs actual commit and URL');
  } else if (effect === 'website') {
    if (receipt.url !== obligation.policy.websiteUrl || !nonempty(receipt.deploymentId) || !Array.isArray(receipt.links)) fail('Website receipt needs configured URL, deployment and advertised links');
    if (receipt.expectedPredecessor === undefined) fail('Website receipt requires expectedPredecessor');
    if (digest(receipt.expectedPredecessor) !== digest(attempt.expectedPredecessor)) fail('Website promotion does not match expected predecessor');
  } else if (!nonempty(receipt.evidenceRef)) fail('Publication receipt requires completion evidence');
  return { ...clone(receipt), digest: actualDigest };
}
