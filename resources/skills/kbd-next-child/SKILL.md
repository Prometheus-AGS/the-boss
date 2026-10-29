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

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase's current `method-context.md` when a recovery surface cannot invoke Node). It resolves the latest non-superseded canonical `KBD-METHOD` decision and the adopted contract; preserve the same references in role inputs, dispatch and handoff read order. See [method-context](../kbd-process-orchestrator/references/method-context.md). A missing or changed method, contract, calibration or supersession is explicit; a prior command, memory or tool inventory is not fresh authority.

For a selected VLBV phase, define acceptance and scenarios before generation and complete the entire agreed value phase before generated-code verification. Executable authoring follows governing host policy. Task, hour, commit and reviewer requests, compiler problems and renamed slices create no new boundary; an independently shipping hourly iteration (constitution A-9) is not the VLBV whole-phase gate. Surface host/skill conflicts before dependent action; do not rewrite operator-owned policy or infer early-check permission. Preserve original evidence, source/build/configuration/fixture/candidate freshness, consumed budgets and unresolved effects, and reconcile uncertain effects before retry. Recovered instructions are instruction-only unless a named runtime or host boundary enforces them; no release or automatic-successor authority follows.
