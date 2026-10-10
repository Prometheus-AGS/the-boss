---
name: delivery-cadence
description: Operate timed usable deliveries with frozen delivery candidates, bounded work-ahead, child recovery and publication evidence. Use when running repeated delivery increments under KBD, a native goal, or standalone work. Do NOT use for initial architecture assessment; use kbd-assess.
license: MIT
compatibility: Node.js 22 or newer. Build tools belong to the selected project. Optional KBD, Compass, memory and native goal capabilities are detected, never assumed.
metadata:
  version: "1.2.7"
  tags: "delivery, cadence, kbd, recovery"
---

# Delivery Cadence

The harness owns execution. This skill owns inspectable delivery metadata and procedures, not a second agent loop. Preserve the current goal, KBD phase approvals and canonical task ownership.

## Configure

Read project instructions and current work first. Reuse existing choices. Configure iteration duration, build and functional-run commands, human review, publication frequency and explicit optimization bounds in a profile. See [profile and commands](references/profile.md).

The installed skill-pack refresh procedure is UNAVAILABLE IN THIS PROJECT: no refresh scripts ship in this mini payload, and installed/service refresh is out of scope. See [unavailable capabilities](references/profile.md#unavailable-capabilities); tracked as a follow-up in .prometheus/decisions.md and the dated mini adaptation record under .prometheus/.

Invoke `node <this-skill>/scripts/cadence.mjs <command> --root <state-directory> --input <request.json>`. The default state directory is `.prometheus/cadence` in the current project. Use a stable `--command-id` when retrying a mutation.

1. `init` creates the run from a profile; `configure` changes future policy deliberately.
2. `start` selects one independently usable increment, with explicit tasks, owners, outcomes and source revisions.
3. Implement the complete increment, including its UI, strings, persistence and packaging. Keep reviewers dormant. Attach problem/architecture child phases to this delivery using `child enter`; the clock continues. Read [child recovery](references/child-recovery.md) before entry or resume.
4. `ready` records completed production scope; `candidate freeze` pins its inputs and operation contract. `checkpoint` builds the frozen deliverable, then launches it and exercises its actual function. These are product operations, **not test-suite execution**. Read [pipeline contracts](references/pipeline-contract.md) when admitting work-ahead or adopting existing receipts.
5. Once the current candidate is frozen, `work-ahead admit` may authorize one independent scope in isolated source/output roots while the current build or publication runs. It is not another active iteration or KBD phase. Fix current delivery failures before promotion; only disjoint authorized edits continue during repair. Repeat only failed boundary procedures.
6. `finish` records the work outcome, dispatches approved hooks and emits the final report. If the last candidate failed, start an evidence-linked corrective iteration, or finalize and explicitly retire that failed iteration with `failure resolve` before unrelated work. Retirement records a failed outcome, never a successful delivery or phase completion. `review` records actual operator approval when a human boundary is due. Never fabricate approval.
7. `tick` evaluates configured publication opportunities without a daemon. Use `publication attempt/reconcile` for candidate-specific obligations and immutable platform/metadata/site receipts. For an already published release with scope-bound historical debt, use `publication adopt-historical`; read [historical publication](references/historical-publication.md). A dispatch is not publication. Keep one full release in flight and one pending candidate; preserve old debt and separately pending installed acceptance.

New state/reports use schema version 3; profiles and public hook events retain version 1. Use explicit `migrate` for existing v1/v2 state after stopping old mutators, preserving backups and historical receipts. `history` links earlier untracked child evidence without counting it as a new delivery.

The active event journal is bounded and older events are kept as checksummed gzip segments under `archives/`, listed with sequence ranges in `event-archives.json`. Rotation streams sequence validation and compression without parsing historical full-state events into memory. The latest state still comes from the committed event; `state.json` is a recovery snapshot. Keep both the manifest and segments when moving or backing up a run. Do not delete or hand-edit them to clear an oversized journal.

A clock tick stops new scope admission, never certifies unfinished code. Finish the committed increment with an honest overrun; a hard budget or operator stop takes precedence. If the harness cannot continue autonomously, leave durable state and a resume instruction; never claim background execution.

## Events and reports

Use `hooks scaffold`, `hooks add`, `hooks list`, `hooks enable`, `hooks disable`, `hooks remove` and deliberate `hooks retry`. Read [JavaScript hooks](references/hooks.md) before registration. Scripts have the user's privileges; registration is explicit trust, not a sandbox. Never send mail or other external effects without the configured authorization.

`report` shows tasks, changes and phases separately, carried scope, outcomes, artifact paths, overlapping wall time and unknown metrics. Use `activity start/stop` to record owned work spans explicitly. Reports distinguish gross, reopened and net progress, unknown timing and child costs. Never infer delivery from commits, a running agent, or an installer filename. See [measurement and research](references/measurement.md).

## Teams and project adapters

Use the selected `.agent-team/project-routing.json` / team manifest and the installed agent-team-creator contract. Assign disjoint `owns`, inputs and outputs. Use one implementer for isolated work, up to the configured maximum for independent stacks. One writer per shared build directory; one release metadata/site publisher. The lead performs optimization at checkpoints; it is not a continuous reviewer.

Refresh Compass for changed repositories about hourly when resources permit. Record stale/deferred status; do not launch a competing heavy build. Keep optional services optional.

For KBD/native goal binding and the Boss build-and-publication policy, read [harness adapters](references/adapters.md). Completion of this skill never closes unfinished product work.

## Progress Signals

Emit to plain response text (no tool call) at each delivery increment and child-phase boundary:

```
Starting delivery-cadence — <profile> increment <i> of <n>
Starting phase <i> out of <n>: <child-phase>
Completed phase <i> out of <n>: <child-phase>
Completed delivery-cadence — <profile> increment <i> of <n> (<accepted|pending|blocked>)
```

Acceptance and publication are reported separately; never report an increment as published because it was accepted.
