---
name: kbd-goal
description: Bind an approved KBD goal to delivery-cadence while retaining the current harness as execution and continuation owner.
license: MIT
compatibility: Node.js 22 or newer and delivery-cadence. Native goal tools are optional and must be discovered.
metadata:
  version: "1.0.0"
---

# KBD Goal

Reuse the current goal when one exists. Only create a goal when explicitly requested and through an actually available native goal tool. Do not invent goal CLI commands, install plugins, or start a second loop.

Load delivery-cadence. Initialize or resume the selected profile with mode `goal` and a binding identifying the existing goal, approved phase and canonical project. The profile controls delivery intervals, not architecture approval. Preserve native budgets and termination conditions.

Use kbd-loop's dispatch procedure: complete the usable increment, BUILD it, RUN its actual function and fix errors before promoting work-ahead. No test suites at iteration boundaries. Native continuation owns repeated turns; without it, work in the current session and provide a durable resume command. A successful build is not runtime acceptance or goal completion.

All task transitions remain with kbd-apply; generated waypoints remain read-only. Notifications run only through registered trusted cadence handlers. Follow the profile's human review and publication policies without treating silence as approval.

## Cadence child recovery

When a cadence binding exists, use delivery-cadence `child enter` after the canonical child transition, and `child return` after canonical parent restoration with explicit return evidence. Keep the parent clock running and preserve publication debt. Nested children do not count as separate deliveries. On every resumed session, reconcile canonical position before admitting scope. Load delivery-cadence/references/child-recovery.md for commands and failure recovery. An architectural approval is never implied by autonomous iteration policy.

## Bounded delivery pipeline

Use the authored dispatch contract to retain the named capability, complete featureOperation, approved creation task when needed, source/output ownership and candidate/work-ahead references. A child or change split cannot silently move the only operation to a later delivery. KBD owns scope revisions and completion; Cadence dispatch metadata does not authorize either.

After the completed current candidate is frozen, admit at most one approved independent work-ahead scope in isolated roots. Work-ahead is an assignment, not a second active iteration or phase. Preserve firstWorkAt; promote only after local delivery, required hooks, child return, review and repaired-base conditions are satisfied. Current failures receive repair priority; only disjoint authorized edits continue.

Do not hold the entire team idle for platform publication. Track candidate-specific obligations and one in-flight/one pending release; protect any version/branch the existing publisher consumes. Required remote capabilities must be observed, not inferred from local locks. Installed acceptance can remain explicitly pending independently of publication scheduling. Preserve approved duration and recurrence rather than asking again after every delivery. No background continuation is implied.
