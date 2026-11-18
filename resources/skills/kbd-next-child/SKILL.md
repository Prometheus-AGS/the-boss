---
name: kbd-next-child
description: Advance childPointer to the next entry in childPhases[], or jump to a named child directly. Fires child:after for the closing child and child:before for the new active child. Refuses to advance past the last child (suggesting /kbd-reflect + /kbd-next-phase instead).
license: MIT
metadata:
  version: '1.0.0'
  tags: 'process, orchestration, automation, nested-phases'
---

# /kbd-next-child

Advance the active child within the current parent phase.

## OpenSpec lifecycle preflight

Before this stage, follow the [orchestrator preflight](../kbd-process-orchestrator/SKILL.md#openspec-lifecycle-preflight): use the pinned OpenSpec 2.0.0 CLI through the managed runner — session start runs the read-only `verify`; phase entry runs `refresh`, which updates existing KBD/OpenSpec projects — then use that same runner for OpenSpec commands. Retry a pending phase-entry refresh before OpenSpec work; preserve authored specs and task state. Phase scripts run this automatically, including canonical-runtime paths.

## What this does

1. With no argument: moves `childPointer` to the next entry in `childPhases[]` after the current pointer.
2. With `<child-name>`: jumps directly to that child (must already be in `childPhases[]`).
3. Fires `child:after` for the closing child (if any) before the waypoint flip; fires `child:before` for the new active child after the flip.
4. Refuses to advance past the last child — suggests `/kbd-reflect` then `/kbd-next-phase`.

## When to use

Move between children declared by `/kbd-new-child`. Use the no-arg form for linear traversal (work child 1 → 2 → 3); use the explicit form for random access.

## Progress Signals (MANDATORY)

```
Starting kbd-next-child — <parent>/<from> → <to>
Completed kbd-next-child — now on <parent>/<to>
```

Where `<from>` is `(none)` when no child was previously active.

## Prerequisites

- A top-level phase MUST be active.
- `childPhases[]` MUST be non-empty (run `/kbd-new-child` first).
- For the explicit form: `<child-name>` MUST already be in `childPhases[]`.

## How to invoke

```bash
boss-mini kbd-next-child.mjs [<child-name>]
```

## Examples

```
/kbd-next-child                  # linear advance from current pointer
/kbd-next-child auth-refactor    # explicit jump
```

## Hook integration

Fires `child:after` (closing child, if any) with the waypoint still describing the old pointer, then writes the waypoint, then fires `child:before` (new active child). This symmetry means a hook that reads on-disk state sees the closing context when `child:after` fires and the opening context when `child:before` fires.

## Selected-method recovery and authority

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase-local `method-context.md` when Node is unavailable) and act on its `status`:

- `RESOLVED_REFERENCES` — continue with the recovered method, contract and stage authority; preserve the same references in role inputs, dispatch and handoff read order.
- `BLOCKED` — the contract, its binding, a calibration reference, a supersession or a deviation's cadence/reason is missing or changed, or canonical status is unavailable; resolve it explicitly. Prior commands, memory and tool inventories are not fresh authority.
- `CONFLICT` — a governing rule file the active harness loads grants an exception VLBV forbids (for example a compiler check or an hourly integration gate during generation). Stop before dependent work and show the conflict; continue only after the operator records a `KBD-POLICY-ACK` decision for that file's current hash. Never rewrite operator-owned policy, and never treat an exception as authority for tests, builds, dry-runs or generated-code verification.

VLBV is the method for every phase (project default `verificationMethod: "VLBV"`); a deviation exists only as a signed `KBD-METHOD` decision naming the method, its execution cadence and its reason, and it is disclosed in the closure packet. Define acceptance before generation; generated code executes only at the value-phase boundary (B4) and, after an authorized repair, at B5 — see `kbd-process-orchestrator/references/boundaries.md`. Tasks, hours, commits, reviewer requests and compiler problems create no boundary. Preserve original evidence, consumed budgets and unresolved effects across resume and supersession; reconcile an uncertain effect before any retry. Full rules: `kbd-process-orchestrator/references/method-context.md`.

