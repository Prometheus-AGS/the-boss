// The existing scoped execution IPC has already validated these diagnostic fields.
// Exact runtime reason codes only; stateReason can otherwise contain a message.
const stateReasonCodes = new Set([
  'member_binding_or_selected_context_denied_before_dispatch',
  'terminal_result_missing',
  'team_host_completion_unconfirmed',
  'team_dispatch_denied_before_kernel_entry',
  'team_output_contract_rejected',
  'team_artifact_publication_unconfirmed',
  'team_usage_or_effect_outcome_uncertain',
  'TEAM_EFFECTS_UNCERTAIN'
])

export function attemptFailureEvidence(attempt) {
  const diagnostic = attempt.diagnostic
  return {
    id: attempt.id,
    runId: attempt.runId,
    taskId: attempt.taskId,
    memberId: attempt.memberId,
    status: attempt.status,
    executionOutcome: attempt.executionOutcome,
    stateReasonPresent: typeof attempt.stateReason === 'string' && attempt.stateReason.length > 0,
    stateReasonCode: stateReasonCodes.has(attempt.stateReason) ? attempt.stateReason : null,
    contextArtifactIds: attempt.contextArtifactIds,
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
