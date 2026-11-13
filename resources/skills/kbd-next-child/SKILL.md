---
name: kbd-next-child
description: Advance childPointer to the next entry in childPhases[], or jump to a named child directly. Fires child:after for the closing child and child:before for the new active child. Refuses to advance past the last child (suggesting /kbd-reflect + /kbd-next-phase instead).
---

# /kbd-next-child

Advance the active child within the current parent phase.

## OpenSpec lifecycle preflight

Before this stage, follow the [orchestrator preflight](../kbd-process-orchestrator/SKILL.md#openspec-lifecycle-preflight): refresh existing KBD/OpenSpec projects with the managed latest-stable CLI, then use that same runner for OpenSpec commands. Retry a pending startup refresh before OpenSpec work; preserve authored specs and task state. Phase scripts run this automatically, including canonical-runtime paths.

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
- `BLOCKED` — a method decision, contract, calibration or supersession is missing or changed, or canonical status is unavailable; resolve it explicitly. Prior commands, memory and tool inventories are not fresh authority.
- `CONFLICT` — governing host policy conflicts with the selected method. Stop before dependent work and show the conflict; continue only after the operator records a `KBD-POLICY-ACK` decision for that file's current hash. Never rewrite operator-owned policy. When host policy grants an exception — for example one narrow, targeted compiler check after a blocking compile error, or an hourly integration gate — name it as host policy, state that it conflicts with the selected method, and say it does not authorize tests, dry-runs or generated-code verification.

For selected VLBV, define acceptance before generation and finish the whole agreed value phase before any generated-code verification; tasks, hours, commits, reviewer requests and compiler problems create no boundary. Preserve original evidence, consumed budgets and unresolved effects across resume and supersession; reconcile an uncertain effect before any retry. Full rules: `kbd-process-orchestrator/references/method-context.md`.

