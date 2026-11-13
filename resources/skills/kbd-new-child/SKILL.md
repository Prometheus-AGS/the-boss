---
name: kbd-new-child
description: Create a child phase inside the currently-active node (arbitrary depth). Mirrors /kbd-new-phase but writes into phases/<parent>/children/<child>/, appends the new child to childPhases[], moves childPointer to it, and fires child:before. Use to split a parent phase into scoped sub-processes.
---

# /kbd-new-child

Create a child phase owned by the currently-active node.

## OpenSpec lifecycle preflight

Before this stage, follow the [orchestrator preflight](../kbd-process-orchestrator/SKILL.md#openspec-lifecycle-preflight): refresh existing KBD/OpenSpec projects with the managed latest-stable CLI, then use that same runner for OpenSpec commands. Retry a pending startup refresh before OpenSpec work; preserve authored specs and task state. Phase scripts run this automatically, including canonical-runtime paths.

## What this does

1. Validates the active waypoint has a resolvable node.
2. Validates the child name (kebab-case, no traversal, no slashes) and refuses duplicates.
3. Creates `.kbd-orchestrator/phases/<parent>/children/<child-name>/` with `goals.md`, `progress.json`, `handoff-in.md` (parent→child contract), and `scope.json` (context-isolation contract).
4. Atomically appends `<child-name>` to `childPhases[]`, sets `childPointer` to the new child, updates `currentTask` and `exactNextCommand` to scope to the child.
5. Fires `child:before` exactly once for the new child.
6. Emits Progress Signals and a confirmation banner.

## When to use

When a phase (or child) reveals work that's complex enough to deserve its own
scope but not big enough to be a sibling phase. Each child carries its own
`assessment.md` / `plan.md` / `execution.md` / `reflection.md` under
`phases/<parent>/children/<child>/`.

Compare to `/kbd-new-phase`, which creates a top-level sibling.

## Progress Signals (MANDATORY)

```
Starting kbd-new-child — <parent>/<child>
Completed kbd-new-child — <parent>/<child> ready for /kbd-assess
```

## Prerequisites

- A node MUST be active (the waypoint's resolvable path is non-empty).
- The proposed child name MUST NOT already appear in `childPhases[]`.
- `current-waypoint.json` MUST be valid JSON.
- The new depth MUST NOT exceed `project.json`'s `maxChildDepth` (default 4).

## How to invoke

```bash
boss-mini kbd-new-child.mjs <child-name> [goal-1] [goal-2] …
```

## Examples

```
/kbd-new-child auth-refactor "split user-model" "migrate sessions"
/kbd-new-child docs-sweep
/kbd-new-child perf-pass-1
```

## Hook integration

Fires `child:before` exactly once, **after** the waypoint flip, so hooks
reading state see the new child as authoritative. The hook's index is the
1-based depth of the new child; total is the configured `maxChildDepth`.

## Selected-method recovery and authority

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase-local `method-context.md` when Node is unavailable) and act on its `status`:

- `RESOLVED_REFERENCES` — continue with the recovered method, contract and stage authority; preserve the same references in role inputs, dispatch and handoff read order.
- `BLOCKED` — a method decision, contract, calibration or supersession is missing or changed, or canonical status is unavailable; resolve it explicitly. Prior commands, memory and tool inventories are not fresh authority.
- `CONFLICT` — governing host policy conflicts with the selected method. Stop before dependent work and show the conflict; continue only after the operator records a `KBD-POLICY-ACK` decision for that file's current hash. Never rewrite operator-owned policy. When host policy grants an exception — for example one narrow, targeted compiler check after a blocking compile error, or an hourly integration gate — name it as host policy, state that it conflicts with the selected method, and say it does not authorize tests, dry-runs or generated-code verification.

For selected VLBV, define acceptance before generation and finish the whole agreed value phase before any generated-code verification; tasks, hours, commits, reviewer requests and compiler problems create no boundary. Preserve original evidence, consumed budgets and unresolved effects across resume and supersession; reconcile an uncertain effect before any retry. Full rules: `kbd-process-orchestrator/references/method-context.md`.

