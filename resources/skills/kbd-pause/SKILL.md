---
name: kbd-pause
description: Use to gracefully pause the active KBD run, checkpoint its exact position, and prevent every harness from steering execution until an operator resumes it. Operator intent always outranks agent continuation.
---

# /kbd-pause

Pause the active KBD run. Operator intent always outranks agent continuation.

## Progress Signals (MANDATORY)

Before acting, emit:

```text
Starting kbd-pause — <phase-name>
```

After the checkpoint is durable, emit:

```text
Completed kbd-pause — <phase-name> paused
```

## Procedure

1. Resolve the project containing `.kbd-orchestrator/`.
2. Require a non-empty reason from the arguments or the operator.
3. If this project's own runtime CLI is available, run its pause command with
   the reason.
4. Otherwise create `.kbd-orchestrator/PAUSE` first, then atomically update the
   waypoint to `status: "paused"` (via `lib/platform/atomic-write.mjs`'s
   `atomicWrite`), preserving its prior status as `previousStatus` and
   recording `pauseReason`, `pausedAt`, and `pausedBy`. Before writing, call
   `assertProjectionWritable(root, target)` from `lib/kbd/runtime-authority.mjs`
   — it throws when the waypoint is runtime-authoritative, meaning a direct
   write here would be out of band.
5. Report the last completed work, exact next work, dirty-work summary, and
   current plan revision. Do not execute the next command.

Never remove `PAUSE`, resume work, or reinterpret ordinary prose as a resume.

## Selected-method recovery and authority

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase-local `method-context.md` when Node is unavailable) and act on its `status`:

- `RESOLVED_REFERENCES` — continue with the recovered method, contract and stage authority; preserve the same references in role inputs, dispatch and handoff read order.
- `BLOCKED` — the contract, its binding, a calibration reference, a supersession or a deviation's cadence/reason is missing or changed, or canonical status is unavailable; resolve it explicitly. Prior commands, memory and tool inventories are not fresh authority.
- `CONFLICT` — a governing rule file the active harness loads grants an exception VLBV forbids (for example a compiler check or an hourly integration gate during generation). Stop before dependent work and show the conflict; continue only after the operator records a `KBD-POLICY-ACK` decision for that file's current hash. Never rewrite operator-owned policy, and never treat an exception as authority for tests, builds, dry-runs or generated-code verification.

VLBV is the method for every phase (project default `verificationMethod: "VLBV"`); a deviation exists only as a signed `KBD-METHOD` decision naming the method, its execution cadence and its reason, and it is disclosed in the closure packet. Define acceptance before generation; generated code executes only at the value-phase boundary (B4) and, after an authorized repair, at B5 — see `kbd-process-orchestrator/references/boundaries.md`. Tasks, hours, commits, reviewer requests and compiler problems create no boundary. Preserve original evidence, consumed budgets and unresolved effects across resume and supersession; reconcile an uncertain effect before any retry. Full rules: `kbd-process-orchestrator/references/method-context.md`.

