---
name: kbd-resume
description: Use to resume a paused KBD run after validating its checkpoint and plan revision. A normal assistant response is never a resume signal — resuming requires this explicit skill.
license: MIT
metadata:
  version: '1.0.0'
  tags: 'process, orchestration, control, resume'
---

# /kbd-resume

Resume an explicitly paused KBD run. A normal assistant response is never a
resume signal.

## OpenSpec lifecycle preflight

Before this stage, follow the [orchestrator preflight](../kbd-process-orchestrator/SKILL.md#openspec-lifecycle-preflight): use the pinned OpenSpec 2.0.0 CLI through the managed runner — session start runs the read-only `verify`; phase entry runs `refresh`, which updates existing KBD/OpenSpec projects — then use that same runner for OpenSpec commands. Retry a pending phase-entry refresh before OpenSpec work; preserve authored specs and task state. Phase scripts run this automatically, including canonical-runtime paths.

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

## Selected-method recovery and authority

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase-local `method-context.md` when Node is unavailable) and act on its `status`:

- `RESOLVED_REFERENCES` — continue with the recovered method, contract and stage authority; preserve the same references in role inputs, dispatch and handoff read order.
- `BLOCKED` — the contract, its binding, a calibration reference, a supersession or a deviation's cadence/reason is missing or changed, or canonical status is unavailable; resolve it explicitly. Prior commands, memory and tool inventories are not fresh authority.
- `CONFLICT` — a governing rule file the active harness loads grants an exception VLBV forbids (for example a compiler check or an hourly integration gate during generation). Stop before dependent work and show the conflict; continue only after the operator records a `KBD-POLICY-ACK` decision for that file's current hash. Never rewrite operator-owned policy, and never treat an exception as authority for tests, builds, dry-runs or generated-code verification.

VLBV is the method for every phase (project default `verificationMethod: "VLBV"`); a deviation exists only as a signed `KBD-METHOD` decision naming the method, its execution cadence and its reason, and it is disclosed in the closure packet. Define acceptance before generation; generated code executes only at the value-phase boundary (B4) and, after an authorized repair, at B5 — see `kbd-process-orchestrator/references/boundaries.md`. Tasks, hours, commits, reviewer requests and compiler problems create no boundary. Preserve original evidence, consumed budgets and unresolved effects across resume and supersession; reconcile an uncertain effect before any retry. Full rules: `kbd-process-orchestrator/references/method-context.md`.

## Method, contract and effect recovery

Run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase's current `method-context.md` when a recovery surface cannot invoke Node). It re-resolves the latest non-superseded canonical `KBD-METHOD` decision, the adopted contract revision and digest, stage authority, candidate/evidence freshness, adopted budgets with their consumption high-water and unresolved boundary obligations; see [method-context](../kbd-process-orchestrator/references/method-context.md). A prior command, receipt or stored `exactNextCommand` is history, not fresh authority.

- A `BLOCKED` index, a changed or missing method/contract/calibration reference, or an unreadable canonical state is an explicit prerequisite: report it and stop. Do not guess from memory and do not widen or change scope.
- Resume preserves budget consumption, original evidence and candidate/source/configuration/fixture identity. Never reset consumed limits or discard an original failure to make a retry look fresh.
- Reconcile uncertain or unresolved effects (open boundary obligations, a task begun and not ended, a side effect with no receipt) before any retry; a retry without that reconciliation is a blind retry.
- For a selected VLBV phase, resuming opens no generated-code verification: only the complete agreed value phase, under separate authority, does. A task, hour, commit, compiler or reviewer boundary does not. Surface conflicting host policy before dependent action; do not rewrite operator-owned rules.
- These steps are instruction-only unless a named runtime command enforces them. No release or automatic-successor authority follows from a resume.
