// The existing scoped execution IPC has already validated these diagnostic fields.
export function attemptFailureEvidence(attempt) {
  const diagnostic = attempt.diagnostic
  return {
    id: attempt.id,
    runId: attempt.runId,
    taskId: attempt.taskId,
    memberId: attempt.memberId,
    status: attempt.status,
    executionOutcome: attempt.executionOutcome,
    diagnostic: diagnostic
      ? {
          code: diagnostic.code,
          sourceStage: diagnostic.sourceStage,
          category: diagnostic.category,
          httpStatus: diagnostic.httpStatus,
          collaborationCode: diagnostic.collaborationCode,
          protectedDiagnosticRef: diagnostic.protectedDiagnosticRef
        }
      : null
  }
}
