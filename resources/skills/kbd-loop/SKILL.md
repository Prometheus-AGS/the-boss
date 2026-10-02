---
name: kbd-loop
description: Run an approved KBD execution phase with a delivery-cadence profile and the current harness as continuation owner.
license: MIT
compatibility: Requires the delivery-cadence skill and an existing approved KBD execution phase.
metadata:
  version: "1.0.0"
---

# KBD Loop

Load delivery-cadence only when this command is invoked. Read the current canonical phase and approved plan. Keep KBD's assess/analyze/plan approvals intact; this command does not skip lifecycle stages.

Use `node <delivery-cadence>/scripts/cadence.mjs resume --root <cadence-root>` or initialize an explicitly selected profile. Record profile path, root, iteration scope and publication policy in the phase's authored execution dispatch contract. Do not edit generated waypoints or completion projections.

Use the current harness's available continuation capability. Never start another scheduler or assume a slash command/API exists. When unavailable, operate in the current turn and leave a resume command.

Select a complete usable increment; delegate disjoint production ownership to the selected team. At its boundary BUILD then RUN the program's completed function. No test suites, per-task verifier or reviewer loop. Fix any build/launch/function errors before promoting the next increment. Record completion through kbd-apply and its canonical backend; cadence reports reference that evidence. Honor profile review, budget, publication and pending-hook constraints.

## Cadence child recovery

When a cadence binding exists, use delivery-cadence `child enter` after the canonical child transition, and `child return` after canonical parent restoration with explicit return evidence. Keep the parent clock running and preserve publication debt. Nested children do not count as separate deliveries. On every resumed session, reconcile canonical position before admitting scope. Load delivery-cadence/references/child-recovery.md for commands and failure recovery. An architectural approval is never implied by autonomous iteration policy.

## Bounded delivery pipeline

Use the authored dispatch contract to retain the named capability, complete featureOperation, approved creation task when needed, source/output ownership and candidate/work-ahead references. A child or change split cannot silently move the only operation to a later delivery. KBD owns scope revisions and completion; Cadence dispatch metadata does not authorize either.

After the completed current candidate is frozen, admit at most one approved independent work-ahead scope in isolated roots. Work-ahead is an assignment, not a second active iteration or phase. Preserve firstWorkAt; promote only after local delivery, required hooks, child return, review and repaired-base conditions are satisfied. Current failures receive repair priority; only disjoint authorized edits continue.

Do not hold the entire team idle for platform publication. Track candidate-specific obligations and one in-flight/one pending release; protect any version/branch the existing publisher consumes. Required remote capabilities must be observed, not inferred from local locks. Installed acceptance can remain explicitly pending independently of publication scheduling. Preserve approved duration and recurrence rather than asking again after every delivery. No background continuation is implied.
