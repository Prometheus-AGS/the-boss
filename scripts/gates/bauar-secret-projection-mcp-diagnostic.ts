import assert from 'node:assert/strict'

import type { ProjectionCatalogProfile, ProjectionToolMode } from './bauar-secret-projection-mcp'
import type { ProjectionApprovalCapture } from './bauar-secret-projection-turn'
import type { ProjectionProviderConversation } from './bauar-secret-projection-provider'
import type { CaptureDiagnostic } from './bauar-secret-projection-revision'

type RevisionCapture = { runSnapshotMatched: boolean; preparedRevisionsMatched: boolean; preparedInvocations: number;
  toolSources?: { discovery: number; target: number; other: number; discoveryRevisionsMatched: boolean; targetRevisionsMatched: boolean } }

/** Fixed scalar mirrors of the existing MCP assertions, without tool content or identifiers. */
export function mcpAssertionDiagnostic(
  mode: ProjectionToolMode,
  revisions: readonly RevisionCapture[],
  calls: ReadonlyArray<{ mode: ProjectionToolMode; originalArguments: boolean }>,
  before: number,
  toolInputs: ReadonlyArray<{ mode: ProjectionToolMode; redacted: boolean }>,
  stream: { present: boolean; containsCanary: boolean; category: string },
  capture: CaptureDiagnostic | null,
  profile: ProjectionCatalogProfile,
  approvals: ProjectionApprovalCapture,
  targetName: string
) {
  const revision = revisions[0]
  const lastCall = calls.at(-1)
  const callDelta = calls.length - before
  const matchingInputs = toolInputs.filter((input) => input.mode === mode)
  return {
    mode, profile, toolSources: revision?.toolSources, revisionCaptureCount: revisions.length,
    runSnapshotMatched: revision?.runSnapshotMatched === true,
    preparedRevisionsMatched: revision?.preparedRevisionsMatched === true,
    preparedInvocationCount: revision?.preparedInvocations ?? null,
    mcpCallCountBefore: before, mcpCallCountAfter: calls.length, mcpCallDelta: callDelta,
    matchingToolInputCount: matchingInputs.length,
    redactedMatchingToolInputCount: matchingInputs.filter((input) => input.redacted).length,
    streamErrorPresent: stream.present, streamCategory: stream.category,
    fieldMatches: {
      oneRevisionCapture: revisions.length === 1,
      runAndPreparedRevisions: revision?.runSnapshotMatched === true && revision?.preparedRevisionsMatched === true,
      expectedPreparedInvocations: revision?.preparedInvocations === (profile === 'deferred' ? 2 : 1),
      oneMcpCall: callDelta === 1,
      lastCallMode: lastCall?.mode === mode,
      originalArguments: lastCall?.originalArguments === true,
      streamCanaryAbsent: !stream.containsCanary,
      emptyStreamError: mode === 'error' ? null : !stream.present,
      redactedToolInput: mode === 'error' ? null : matchingInputs.some((input) => input.redacted)
    },
    approvals: projectionApprovalDiagnostic(profile, targetName, approvals),
    capture
  }
}

export type McpRunContext = {
  mode: ProjectionToolMode; profile: ProjectionCatalogProfile; before: number; inputBefore: number;
  calls: ReadonlyArray<{ mode: ProjectionToolMode; originalArguments: boolean }>;
  toolInputs: ReadonlyArray<{ mode: ProjectionToolMode; redacted: boolean }>;
  providerRequests: ReadonlyArray<{ authorized: boolean; containsCanary: boolean }>;
}

/** Read existing counters after a failed run; never dispatch or resolve an approval. */
export function mcpRunDiagnostic(context: McpRunContext, capture: CaptureDiagnostic | null, turn: unknown, category: string) {
  const currentCalls = context.calls.slice(context.before)
  const matchingInputs = context.toolInputs.slice(context.inputBefore).filter((input) => input.mode === context.mode)
  return {
    mode: context.mode, profile: context.profile, failureCategory: category, turn,
    actualCallDelta: currentCalls.length,
    calls: currentCalls.map((call) => ({ modeMatches: call.mode === context.mode, originalArguments: call.originalArguments })),
    providerRequestCount: context.providerRequests.length,
    authorizedProviderRequestCount: context.providerRequests.filter((request) => request.authorized).length,
    canaryFreeProviderRequestCount: context.providerRequests.filter((request) => !request.containsCanary).length,
    modelToolInputCount: context.toolInputs.length, matchingModelToolInputCount: matchingInputs.length,
    redactedMatchingModelToolInputCount: matchingInputs.filter((input) => input.redacted).length,
    capture
  }
}

/** Fixed counts and comparisons only; approval IDs and tool names remain transient. */
function projectionApprovalDiagnostic(profile: ProjectionCatalogProfile, targetName: string, approvals: ProjectionApprovalCapture) {
  const discoveryCount = profile === 'deferred' ? 1 : 0
  const expectedCount = discoveryCount + 1
  const discoveryApprovals = approvals.requests.filter((entry) => entry.name === 'search_tools').length
  const targetApprovals = approvals.requests.filter((entry) => entry.name === targetName).length
  const uniqueRequests = new Set(approvals.requests.map((entry) => entry.id)).size
  const uniqueDecisions = new Set(approvals.accepted).size
  const correlatedRequests = approvals.requests.filter((entry) => entry.matchingInputStarts === 1).length
  return { expectedCount, requestCount: approvals.requests.length, discoveryApprovals, targetApprovals,
    uniqueRequests, decisionCount: approvals.accepted.length, uniqueDecisions, correlatedRequests,
    fieldMatches: {
      expectedRequests: approvals.requests.length === expectedCount,
      discoveryApprovals: discoveryApprovals === discoveryCount,
      targetApproval: targetApprovals === 1,
      uniqueRequests: uniqueRequests === expectedCount,
      uniqueDecisions: uniqueDecisions === expectedCount,
      exactDecisionCount: approvals.accepted.length === expectedCount,
      exactDecisionIds: approvals.requests.every((entry) => approvals.accepted.includes(entry.id)),
      exactInputCorrelation: correlatedRequests === expectedCount
    } }
}

/** Source-specific counts belong to the current actual desktop turn, never a prior mode. */
export function assertProjectionSources(
  profile: ProjectionCatalogProfile, mode: ProjectionToolMode, targetName: string,
  revision: RevisionCapture, approvals: ProjectionApprovalCapture,
  conversation: ReturnType<ProjectionProviderConversation['diagnostic']>, effectCount: number, fillerCount: number
) {
  const discoveryCount = profile === 'deferred' ? 1 : 0
  const source = revision.toolSources
  assert(source)
  assert.equal(revision.preparedInvocations, discoveryCount + 1)
  assert.equal(source.discovery, discoveryCount)
  assert.equal(source.target, 1)
  assert.equal(source.other, 0)
  assert.equal(source.targetRevisionsMatched, true)
  assert.equal(source.discoveryRevisionsMatched, profile === 'deferred')
  const discoveryApprovals = approvals.requests.filter((entry) => entry.name === 'search_tools')
  const targetApprovals = approvals.requests.filter((entry) => entry.name === targetName)
  assert.equal(approvals.requests.length, discoveryCount + 1)
  assert.equal(discoveryApprovals.length, discoveryCount)
  assert.equal(targetApprovals.length, 1)
  assert.equal(new Set(approvals.requests.map((entry) => entry.id)).size, discoveryCount + 1)
  assert.equal(new Set(approvals.accepted).size, discoveryCount + 1)
  assert.equal(approvals.accepted.length, discoveryCount + 1)
  assert(approvals.requests.every((entry) => approvals.accepted.includes(entry.id)))
  assert(approvals.requests.every((entry) => entry.matchingInputStarts === 1))
  assert.equal(conversation.failure, null)
  assert.equal(conversation.discoveryProposals, discoveryCount)
  assert.equal(conversation.targetProposals, 1)
  assert.equal(conversation.initiallyAdvertised, profile === 'eager')
  assert.equal(conversation.discoveryCorrelated, profile === 'deferred')
  assert.equal(conversation.advertisedAfterDiscovery, profile === 'deferred')
  if (mode !== 'error') assert.equal(conversation.targetCorrelated, true)
  assert.equal(effectCount, 1)
  assert.equal(fillerCount, 0)
  return { profile, mode, preparation: source, discoveryApprovals: discoveryApprovals.length,
    targetApprovals: targetApprovals.length, exactDecisions: approvals.accepted.length,
    targetEffects: effectCount, fillerEffects: fillerCount, conversation }
}
