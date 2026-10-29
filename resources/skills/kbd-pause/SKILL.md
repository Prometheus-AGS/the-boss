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

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase's current `method-context.md` when a recovery surface cannot invoke Node). It resolves the latest non-superseded canonical `KBD-METHOD` decision and the adopted contract; preserve the same references in role inputs, dispatch and handoff read order. See [method-context](../kbd-process-orchestrator/references/method-context.md). A missing or changed method, contract, calibration or supersession is explicit; a prior command, memory or tool inventory is not fresh authority.

For a selected VLBV phase, define acceptance and scenarios before generation and complete the entire agreed value phase before generated-code verification. Executable authoring follows governing host policy. Task, hour, commit and reviewer requests, compiler problems and renamed slices create no new boundary; an independently shipping hourly iteration (constitution A-9) is not the VLBV whole-phase gate. Surface host/skill conflicts before dependent action; do not rewrite operator-owned policy or infer early-check permission. Preserve original evidence, source/build/configuration/fixture/candidate freshness, consumed budgets and unresolved effects, and reconcile uncertain effects before retry. Recovered instructions are instruction-only unless a named runtime or host boundary enforces them; no release or automatic-successor authority follows.
