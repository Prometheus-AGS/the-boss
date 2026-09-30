---
name: delivery-cadence
description: Operate timed usable deliveries with child-phase recovery, build-and-run checkpoints and evidence-based learning. Use when running repeated delivery increments under KBD, a native goal, or standalone work. Do NOT use for initial architecture assessment; use kbd-assess.
license: MIT
compatibility: Node.js 22 or newer. Build tools belong to the selected project. Optional KBD, Compass, memory and native goal capabilities are detected, never assumed.
metadata:
  version: "1.1.2"
  tags: "delivery, cadence, kbd, recovery"
---

# Delivery Cadence

The harness owns execution. This skill owns inspectable delivery metadata and procedures, not a second agent loop. Preserve the current goal, KBD phase approvals and canonical task ownership.

## Configure

Read project instructions and current work first. Reuse existing choices. Configure iteration duration, build and functional-run commands, human review, publication frequency and explicit optimization bounds in a profile. See [profile and commands](references/profile.md).

Invoke `node <this-skill>/scripts/cadence.mjs <command> --root <state-directory> --input <request.json>`. The default state directory is `.prometheus/cadence` in the current project. Use a stable `--command-id` when retrying a mutation.

1. `init` creates the run from a profile; `configure` changes future policy deliberately.
2. `start` selects one independently usable increment, with explicit tasks, owners, outcomes and source revisions.
3. Implement the complete increment, including its UI, strings, persistence and packaging. Keep reviewers dormant. Attach problem/architecture child phases to this delivery using `child enter`; the clock continues. Read [child recovery](references/child-recovery.md) before entry or resume.
4. `ready` records completed production scope. `checkpoint` builds the deliverable, then launches it and exercises its actual function. These are product operations, **not test-suite execution**.
5. Fix build, launch or functional errors before admitting another increment. Repeat only the failed boundary procedure after the fix; do not add test suites, per-edit checks or partial verification loops.
6. `finish` records the work outcome, dispatches approved hooks and emits the final report. `review` records actual operator approval when a human boundary is due. Never fabricate approval.
7. When publication is due, perform the profile's release procedure through its website update and record `publication`. A workflow dispatch alone is not publication.

New state/reports use schema version 2; profiles and public hook events retain version 1. Use explicit `migrate` for existing state, preserving backups and historical receipts. `history` links earlier untracked child evidence without counting it as a new delivery.

A clock tick stops new scope admission, never certifies unfinished code. Finish the committed increment with an honest overrun; a hard budget or operator stop takes precedence. If the harness cannot continue autonomously, leave durable state and a resume instruction; never claim background execution.

## Events and reports

Use `hooks scaffold`, `hooks add`, `hooks list`, `hooks enable`, `hooks disable`, `hooks remove` and deliberate `hooks retry`. Read [JavaScript hooks](references/hooks.md) before registration. Scripts have the user's privileges; registration is explicit trust, not a sandbox. Never send mail or other external effects without the configured authorization.

`report` shows tasks, changes and phases separately, carried scope, outcomes, artifact paths, overlapping wall time and unknown metrics. Use `activity start/stop` to record owned work spans explicitly. Reports distinguish gross, reopened and net progress, unknown timing and child costs. Never infer delivery from commits, a running agent, or an installer filename. See [measurement and research](references/measurement.md).

## Teams and project adapters

Use the selected `.agent-team/project-routing.json` / team manifest and the installed agent-team-creator contract. Assign disjoint `owns`, inputs and outputs. Use one implementer for isolated work, up to the configured maximum for independent stacks. One writer per shared build directory; one release metadata/site publisher. The lead performs optimization at checkpoints; it is not a continuous reviewer.

Refresh Compass for changed repositories about hourly when resources permit. Record stale/deferred status; do not launch a competing heavy build. Keep optional services optional.

For KBD/native goal binding and the Boss build-and-publication policy, read [harness adapters](references/adapters.md). Completion of this skill never closes unfinished product work.
