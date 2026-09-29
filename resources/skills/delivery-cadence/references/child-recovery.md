# Child phases without losing the delivery

A child belongs to its parent delivery. The parent clock and budget continue; nested work does not increment delivery counters, fire `iteration:after`, or advance publication scheduling. One leaf phase is active; parallel implementation workers remain assignments inside that scope.

## Enter

Use the canonical KBD child transition first. Then call `child enter` with:

```json
{
  "phaseId": "canonical-child-phase",
  "reason": "Inference fails through the configured gateway",
  "owner": "runtime-owner",
  "authority": "operator-approved repair scope",
  "scope": {"tasks":["canonical-repair-task"],"changes":[],"phases":[],"outcomes":["Configured inference returns a response"]},
  "returnCriteria": ["configured-inference-operates"],
  "requiresApproval": false
}
```

KBD mode requires a fresh canonical snapshot through `binding.canonicalCommand` or `canonical` input. Snapshot shape: `source:"prometheus-kbd-status"`, integer `revision`, current `phaseId`, and `phases` keyed by phase ID with `parentPhaseId/status`. Cadence validates ancestry; KBD remains the transition/completion authority. Supply `parentPhaseId` for a standalone root when needed; standalone/goal modes explicitly have no KBD lifecycle.

For architectural work, set `requiresApproval:true` and follow the existing assess/analyze/plan/approval process. Cadence records approval evidence; it never supplies approval itself. Entry appends a scope revision rather than silently discarding parent scope.

## Return

Complete/reflect the child and restore the parent through canonical KBD commands first. Call `child return` with the active leaf `childId`, `outcome:"success"`, and `evidencePath`. Evidence identifies `childId` or `phaseId` and contains:

```json
{
  "phaseId": "canonical-child-phase",
  "criteria": [{"id":"configured-inference-operates","met":true,"evidence":"path-or-canonical-receipt"}],
  "completion": {"tasks":["canonical-repair-task"],"changes":[],"phases":[]},
  "approval": {"approved":true,"reference":"actual-operator-approval-reference"}
}
```

Include `approval` only when real and required. Successful return needs every criterion, scoped completion IDs, canonical child completion, and canonical parent restoration. Completion IDs are deduplicated in reporting.

`failed` or `cancelled` outcomes need a reason and leave the child blocked on the stack. Returning with `waived` requires evidence containing `operatorScopeChange: { approved:true, reference, reason }`; a waiver is not implementation completion. Never fabricate approval to unblock progress.

After return, complete parent production scope and call `ready` again. Changed release inputs invalidate old receipts; preserve attempts and rebuild the combined completed increment. Merely exiting a phase does not meet return criteria.

## Missed hooks and restart

`child status` exposes active ancestry, blockers, return criteria and approval state. `child reconcile` and `resume` compare it with canonical KBD. A discovered child enters `needs-context`: its original entry time is unknown, and recovery observation time is labelled accordingly. Supply explicit context with `child enter` before attempting return.

Canonical restoration alone never completes a child in Cadence. Evidence remains required. Divergent ancestry blocks delivery and must be reconciled rather than overwritten. Retry mutations using the same command ID; no duplicate child, hook replay, assumed approval, or silent parent advancement.

Pack-specific argument-array adapters attach to existing lifecycle hooks without replacing user registrations. They are outside the checksummed shared payload; see [adapters](adapters.md).
