---
name: kbd-resume
description: Use to resume a paused KBD run after validating its checkpoint and plan revision. A normal assistant response is never a resume signal — resuming requires this explicit skill.
---

# /kbd-resume

Resume an explicitly paused KBD run. A normal assistant response is never a
resume signal.

## OpenSpec lifecycle preflight

Before this stage, follow the [orchestrator preflight](../kbd-process-orchestrator/SKILL.md#openspec-lifecycle-preflight): refresh existing KBD/OpenSpec projects with the managed latest-stable CLI, then use that same runner for OpenSpec commands. Retry a pending startup refresh before OpenSpec work; preserve authored specs and task state. Phase scripts run this automatically, including canonical-runtime paths.

## Progress Signals (MANDATORY)

Before validation, emit:

```text
Starting kbd-resume — <phase-name>
```

After the transition, emit:

```text
Completed kbd-resume — <phase-name> running at plan revision <n>
```

## Procedure

1. Resolve the project and read the current checkpoint.
2. Refuse unless the state is `paused`, `pause_requested`, or `blocked`. Then
   recover the method, contract and effect state described under "Method,
   contract and effect recovery" below, before any state change.
3. When the operator supplies a correction reason or replacement next work,
   record a plan revision bump through this project's own runtime CLI when
   available (passing `--reason` and `--exact-next-work`). Use the returned
   N+1 revision; never edit or overwrite the prior plan record.
4. If this project's own runtime CLI is available, run its resume command,
   forwarding the plan revision when supplied or created in step 3.
5. Otherwise validate the requested plan revision, atomically restore
   `previousStatus` (default `running`) via `lib/platform/atomic-write.mjs`'s
   `atomicWrite` (after checking `assertProjectionWritable(root, target)` from
   `lib/kbd/runtime-authority.mjs`), record resume metadata, and move
   `.kbd-orchestrator/PAUSE` to a timestamped audit file.
6. Print the exact resumed command. Do not silently execute it unless the
   operator also requested execution.

Never resume across a plan-revision mismatch.

## Method, contract and effect recovery

Run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase's current `method-context.md` when a recovery surface cannot invoke Node). It re-resolves the latest non-superseded canonical `KBD-METHOD` decision, the adopted contract revision and digest, stage authority, candidate/evidence freshness, adopted budgets with their consumption high-water and unresolved boundary obligations; see [method-context](../kbd-process-orchestrator/references/method-context.md). A prior command, receipt or stored `exactNextCommand` is history, not fresh authority.

- A `BLOCKED` index, a changed or missing method/contract/calibration reference, or an unreadable canonical state is an explicit prerequisite: report it and stop. Do not guess from memory and do not widen or change scope.
- Resume preserves budget consumption, original evidence and candidate/source/configuration/fixture identity. Never reset consumed limits or discard an original failure to make a retry look fresh.
- Reconcile uncertain or unresolved effects (open boundary obligations, a task begun and not ended, a side effect with no receipt) before any retry; a retry without that reconciliation is a blind retry.
- For a selected VLBV phase, resuming opens no generated-code verification: only the complete agreed value phase, under separate authority, does. A task, hour, commit, compiler or reviewer boundary does not. Surface conflicting host policy before dependent action; do not rewrite operator-owned rules.
- These steps are instruction-only unless a named runtime command enforces them. No release or automatic-successor authority follows from a resume.
