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

Select a complete usable increment; delegate disjoint production ownership to the selected team. At its boundary BUILD then RUN the program's completed function. No test suites, per-task verifier or reviewer loop. Fix any build/launch/function errors before the next increment. Record completion through kbd-apply and its canonical backend; cadence reports reference that evidence. Honor profile review, budget, publication and pending-hook constraints.

## Cadence child recovery

When a cadence binding exists, use delivery-cadence `child enter` after the canonical child transition, and `child return` after canonical parent restoration with explicit return evidence. Keep the parent clock running and preserve publication debt. Nested children do not count as separate deliveries. On every resumed session, reconcile canonical position before admitting scope. Load delivery-cadence/references/child-recovery.md for commands and failure recovery. An architectural approval is never implied by autonomous iteration policy.
