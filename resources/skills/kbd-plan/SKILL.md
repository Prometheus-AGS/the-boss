---
name: kbd-plan
description: Use to create an ordered KBD phase plan with evidenced, quality-first model and execution-route recommendations for every task, preserving task identity across OpenSpec and native KBD.
---

# /kbd-plan

Run the **Plan** phase of the KBD lifecycle for any project.

## OpenSpec lifecycle preflight

Before this stage, follow the [orchestrator preflight](../kbd-process-orchestrator/SKILL.md#openspec-lifecycle-preflight): refresh existing KBD/OpenSpec projects with the managed latest-stable CLI, then use that same runner for OpenSpec commands. Retry a pending startup refresh before OpenSpec work; preserve authored specs and task state. Phase scripts run this automatically, including canonical-runtime paths.

## What this does

Reads `.kbd-orchestrator/phases/<phase-name>/assessment.md` and produces an
ordered list of changes to implement this phase. Refreshes the waypoint so
every tool knows the exact next step.

Output:

- `.kbd-orchestrator/phases/<phase-name>/plan.md` — ordered change list and Task model assignments
- `.kbd-orchestrator/current-waypoint.md` and `current-waypoint.json` — refreshed

## Analyze inputs (when the Analyze stage ran)

When `.kbd-orchestrator/phases/<phase>/library-candidates.json` exists, read it
before ordering changes:

- A change addressing a gap whose candidate has verdict `adopt` or `adapt`
  carries a `library: cand-###` annotation in `plan.md` and, for OpenSpec, the
  candidate's evidence block in the design doc — the change *reuses* the library
  rather than rebuilding it.
- `build_required[]` entries (gaps with no adoptable candidate) become build
  changes; a `capability_gap_id` (when present) marks a blocked-on dependency.

When no `library-candidates.json` exists (Analyze skipped), plan as before.

## OpenSpec Detection

Before emitting changes, detect the change management backend:

1. **Check for `openspec/` directory** at project root
2. **Check for `openspec/` directory** inside the skill being developed
3. **Check `.kbd-orchestrator/project.json`** for `"change_backend": "openspec"`

If any of these exist, emit changes as OpenSpec structures. Otherwise, use
native KBD change files.

When the KBD runtime is authoritative, register each change's tasks with the
backend task ID (the ordinal that `kbd-apply list <change>` prints), so
`/kbd-apply` transitions the same records instead of mapping or refusing.

```
OpenSpec detected?
  YES → emit /opsx:new <change-id> commands
      → create openspec/changes/<change-id>/proposal.md
      → tasks tracked in openspec/changes/<change-id>/tasks.md
  NO  → create .kbd-orchestrator/changes/<change-id>/change.md
      → tasks tracked inline with [ ] / [/] / [x] markers
```

## Progress Signals (MANDATORY)

**FIRST tool call of every turn:** Read `.kbd-orchestrator/position-reminder.txt` (if it exists) to get the current phase, step N of T, and next command. If that file is absent, read `.kbd-orchestrator/current-waypoint.json`.

Before any other action, emit to plain response text (BEFORE any tool call):

```
Starting kbd-plan — <phase-name> (step N of T)
```

When all steps are complete, emit:

```
Completed kbd-plan — <phase-name> (step N of T)
```

**How to get N and T (MANDATORY — never estimate):** read
`completion.implementation.completed`/`.total` from `progress.json` via
`implementationCompleted(progress)`/`implementationTotal(progress)`
(`lib/kbd/progress.mjs`), falling back to `current-waypoint.json`'s
`implementationCompleted`/`implementationTotal` when `progress.json` is
absent.

Use the canonical phase name from the argument or `current-waypoint.json`. Emit to plain response text — no tool call needed.

## How to invoke

1. **Discover project identity** — read `.kbd-orchestrator/project.json` or infer
2. **Confirm the active phase** — from argument or waypoint
3. **Load assessment** — from `.kbd-orchestrator/phases/<phase>/assessment.md`
4. **Read project constraints** — from `AGENTS.md` and project spec files
5. **Detect change backend** — OpenSpec or native KBD (see OpenSpec Detection)
6. **Draft tasks and model assignments** — read [task model selection](references/task-model-selection.md). Draft backend task identities, analyze each task's requirements, discover configured models and the installed harness's controls, then write the ordered change list and one scoped concrete model/route assignment per task in `plan.md`. Quality-first is the default within explicit policy and budget constraints; a model class or agent recommendation per change is insufficient. Record unresolved routes without launching workers or configuring providers.
7. **Adversarial vet** — when `adversarial-review` is installed and
   `--skip-adversarial-review` was not passed, run it in artifact mode against
   the written plan. CRITICAL findings (ordering errors, missing dependencies,
   untestable criteria) → revise `plan.md` and re-vet (max 2 rounds, then
   accept with an "Unresolved review findings" section appended). WARNING
   findings → carry into the stage handoff summary. Vet **before** emitting
   change structures, so a corrected plan never leaves stale changes behind.
8. **Emit and reconcile change structures** via OpenSpec or native KBD. Add non-checkbox references to the scoped assignments, preserving task IDs and titles. Reconcile every emitted task with its row before handoff; revise and re-vet material changes to the reviewed draft.
9. **Record the handoff and refresh projections** through the canonical KBD writer. Include assignment references, unresolved prerequisites and review findings; never hand-edit generated waypoints.

## Plan integrity

Before finalizing, screen the draft with `sycophancy-correction` when available using `target: completion`, `strictness: standard`, and `context.evaluation_domain: pmpo_plan_phase`. Surface unsupported feasibility, scope expansion and unresolved model evidence; do not manufacture a trade-off to satisfy a score. Report an unavailable screen honestly. This complements the independent adversarial vet.

## Examples

```
/kbd-plan                                # uses active waypoint phase
/kbd-plan phase-1-foundation             # explicit phase name
```

## Hook integration

Fire `plan:before` before reading the assessment, `plan:after` after
writing `plan.md`, via `hooksFire('plan', 'before'|'after', name, index, total, ctx)`
from `lib/kbd/hooks.mjs`. Existing Progress Signals are unchanged.

```js
import { hooksFire } from '../../lib/kbd/hooks.mjs';

await hooksFire('plan', 'before', phase, 1, 1, { orchestratorRoot, cwd, runCommand });
// … draft plan.md …
await hooksFire('plan', 'after', phase, 1, 1, { orchestratorRoot, cwd, runCommand });
```

See the parent `kbd-process-orchestrator` skill's "Hooks" section for taxonomy
and payload.

## Stage gate & handoff

The plan gate requires the assess handoff (walking back across the optional
analyze/spec stages when they have no handoff). After writing `plan.md`,
record the handoff that execute reads first:

```js
import { stageGate, stageHandoffWrite } from '../../lib/kbd/stage-gate.mjs';

const gate = stageGate('plan', { cwd });
if (gate.status !== 0) throw new Error(gate.stderr);

// … draft plan.md, adversarial vet …

stageHandoffWrite(
  'plan',
  '<1–3 sentences: change count, ordering rationale, first change to apply; include any WARNING findings from adversarial review>',
  ['plan.md'],
  { cwd },
);
```

A missing `handoffs/` directory does not bypass required predecessors.
A missing required handoff fails with remediation: complete the predecessor
stage, or record an explicit skip with its reason under project policy.
A deliberate stage skip is recorded with
`stageHandoffSkip('plan', '<reason>', { cwd })`.
