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

Use kbd-loop's dispatch procedure: complete the usable increment, BUILD it, RUN its actual function and fix errors before the next increment. No test suites at iteration boundaries. Native continuation owns repeated turns; without it, work in the current session and provide a durable resume command. A successful build is not runtime acceptance or goal completion.

All task transitions remain with kbd-apply; generated waypoints remain read-only. Notifications run only through registered trusted cadence handlers. Follow the profile's human review and publication policies without treating silence as approval.

## Cadence child recovery

When a cadence binding exists, use delivery-cadence `child enter` after the canonical child transition, and `child return` after canonical parent restoration with explicit return evidence. Keep the parent clock running and preserve publication debt. Nested children do not count as separate deliveries. On every resumed session, reconcile canonical position before admitting scope. Load delivery-cadence/references/child-recovery.md for commands and failure recovery. An architectural approval is never implied by autonomous iteration policy.
