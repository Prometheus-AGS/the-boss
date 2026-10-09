/** Fixed assertions-only diagnostics; never return captured content or identifiers. */
export function historyAssertionDiagnostic(
  streamError: string,
  captures: ReadonlyArray<Record<string, unknown>>,
  requests: ReadonlyArray<{ authorized: boolean; containsCanary: boolean; systemProjected: boolean; racedPrompt: boolean }>
) {
  const expected = {
    inlineArtifactOnly: true, systemProjected: true, catalogWrites: 0, catalogWritesProjected: true,
    catalogSnapshotMatched: true, runSnapshotMatched: true, catalogRaceObserved: true,
    preparedInvocations: 0, preparedRevisionsMatched: false,
    credentialsPreserved: true, historyPresent: true, historyContainsCanary: false,
    inputContainsCanary: false, inputContainsReplacement: true,
    historyContainsReplacement: true, historyToolIdentityPreserved: true
  }
  const capture = captures[0]
  const expectedKeys = Object.keys(expected)
  return {
    operation: 'capture_assertions' as 'capture_assertions' | 'provider_assertions' | 'stored_history_read' | 'stored_history_assertion',
    streamErrorPresent: Boolean(streamError),
    captureCount: captures.length,
    captureShapeMatches: Boolean(capture) && Object.keys(capture).length === expectedKeys.length
      && expectedKeys.every((key) => Object.hasOwn(capture, key)),
    fieldMatches: Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, capture?.[key] === value])),
    providerRequestCount: requests.length,
    providerMinimumCountMet: requests.length >= 2,
    providerAuthenticated: requests.every((request) => request.authorized),
    providerCanaryAbsent: requests.every((request) => !request.containsCanary),
    providerSystemProjected: requests.every((request) => request.systemProjected),
    providerRacedPromptAbsent: requests.every((request) => !request.racedPrompt),
    originalHistoryUnchanged: null as boolean | null
  }
}
