---
name: kbd-execute
description: Use to select an execution backend for the active KBD phase, write canonical phase execution state, dispatch the phase, and maintain KBD as the source of truth. Supports multi-tool handoff via the progress.json protocol.
---

# /kbd-execute

Run the **Execute** phase of the KBD lifecycle.

## What this does

Reads `.kbd-orchestrator/phases/<phase-name>/plan.md`, selects the best
execution backend (tool or OpenSpec), writes `execution.md`, and dispatches the
phase while keeping KBD as the source of truth.

Also refreshes `.kbd-orchestrator/current-waypoint.json` so any AI tool can
resume cleanly.

## Final phase QA gate

Do not run tests, verification builds, artifact refinement, or adversarial review
after individual tasks or changes. Complete every planned production change first.
When the active harness provides an agent team, assign implementation to executor
roles and keep reviewer, auditor, verifier, and integration-checker roles dormant
until every production change is complete. Then run one production-path integration
gate and one cumulative artifact/adversarial review. The result is evidence and
certification state; it must not reopen the implementation counter:

```
all implementation_status values → COMPLETE in progress.json
  │
  ├─ artifact validation for "<change-id>" (artifact-refiner, if installed)
  │
  ├─ ALL PASS → diff-mode adversarial review for "<change-id>" (if installed)
  │   │
  │   ├─ verdict PASS → proceed to archive
  │   │   ├─ if OpenSpec: /opsx:verify → /opsx:archive
  │   │   └─ if native: move to .kbd-orchestrator/changes/archive/<date>-<id>/
  │   │   (WARNING findings: logged in the review dir, archive proceeds;
  │   │    SUGGESTION: informational)
  │   │
  │   └─ verdict BLOCK (any CRITICAL) → mark certification BLOCKED in progress.json
  │       └─ fix, then re-run only the failed final gate
  │
  └─ ANY FAIL → mark certification BLOCKED, fix, then re-run only the failed final gate
```

### Local review coverage

File-count and documentation-only skips do not exist. QA and adversarial review
cover the cumulative phase diff. They never interrupt production implementation.
Skipping either final gate records `pending_review`; final local certification
still requires a completed receipt or an explicit, signed waiver.

## Progress Signals (MANDATORY)

**FIRST tool call of every turn:** Read `.kbd-orchestrator/position-reminder.txt` (if it exists) to get the current phase, step N of T, and next command. If that file is absent, read `.kbd-orchestrator/current-waypoint.json`.

Before any other action, emit to plain response text (BEFORE any tool call):

```
Starting kbd-execute — <phase-name> (step N of T)
```

When all steps are complete, emit:

```
Completed kbd-execute — <phase-name> (step N of T)
```

**How to get N and T (MANDATORY — never estimate):** read
`completion.implementation.completed`/`.total` from `progress.json` via
`implementationCompleted(progress)`/`implementationTotal(progress)`
(`lib/kbd/progress.mjs`), falling back to `current-waypoint.json`'s
`implementationCompleted`/`implementationTotal` when `progress.json` is
absent.

When executing a named sub-phase within a multi-phase plan, emit the phase-level signal BEFORE the first change signal — even when the orchestrator is not present:

```
Starting phase <N> out of <total>: <sub-phase-name>
```

And after the last change in that sub-phase:

```
Completed phase <N> out of <total>: <sub-phase-name>
```

Additionally, emit before and after each individual change (read canonical
`completion.implementation` from `progress.json`; legacy counters are fallback
aliases only — never guess and never use evidence-task completion):

```
Starting change <N> of <total>: <change-id>
Completed change <N> of <total>: <change-id>
```

When the code/integration contract for a change is complete, update the ledger
atomically with `markImplementationComplete(progressFile, changeId, ctx)` from
`lib/kbd/progress.mjs`:

```js
import { markImplementationComplete } from '../../lib/kbd/progress.mjs';

await markImplementationComplete(
  '.kbd-orchestrator/phases/<phase>/progress.json',
  '<change-id>',
  { hooksFire },
);
```

This transition does not mark evidence, certification, or publication complete.
Never postpone it merely because those independent dimensions are pending.

Use the canonical phase name from the argument or `current-waypoint.json`. Phase and change totals must come from `progress.json` or the plan — never guessed. Emit to plain response text — no tool call needed.

## How to invoke

1. **Discover project identity** — read `.kbd-orchestrator/project.json` or infer
2. **Confirm the active phase** — from argument or waypoint
3. **Load waypoint** — `.kbd-orchestrator/current-waypoint.json` first when it exists
4. **Load assessment and plan** for the phase
5. **Write `execution.md`** with selected backend + dispatch contract
6. **Record the active path** — via the phase's canonical progress/waypoint files
7. **Register planned changes and tasks**
8. **Dispatch** to selected backend or mark phase execution-ready
9. Complete every planned production change without intermediate verification
10. Run one production-path integration gate and one cumulative final review
11. Archive changes after the final phase gates pass

## Backend Types

| Backend       | When to use                                                |
| ------------- | ---------------------------------------------------------- |
| `openspec`    | OpenSpec available; spec-backed traceability required      |
| `native-tool` | Tool has explicit planning, inspectable progress           |
| `hybrid`      | Native tool for decomposition, OpenSpec for spec execution |
| `manual`      | Human-only operation; no automation possible               |

## Examples

```
/kbd-execute                             # uses active waypoint phase
/kbd-execute phase-2-sales-module        # explicit phase name
/kbd-execute --skip-qa                   # skip the artifact QA gate
/kbd-execute --skip-adversarial-review   # skip the adversarial review gate
```

## Hook integration

Fire `execute:before` before selecting a backend, `execute:after` after
writing `execution.md`, via `hooksFire('execute', 'before'|'after', name, index, total, ctx)`
from `lib/kbd/hooks.mjs`. **`task:before`/`task:after` are fired per task by
the change-apply driver (`kbd-apply`'s scope)** — not by `/kbd-execute` and
not by bare OpenSpec apply. `/kbd-execute` writes the dispatch contract; the
apply driver walks the tasks, firing the per-task hooks and emitting the
plain-text position signal on each boundary.

```js
import { hooksFire } from '../../lib/kbd/hooks.mjs';

await hooksFire('execute', 'before', phase, 1, 1, { orchestratorRoot, cwd, runCommand });
// … select backend, write execution.md …
await hooksFire('execute', 'after', phase, 1, 1, { orchestratorRoot, cwd, runCommand });
```

Note: the `on_change_complete` legacy alias is fired automatically by
`hooksFire` on the **final** `task:after` of each change (sentinel:
`index === total`, matching `kbd_hook_index == kbd_hook_total`). Projects
relying on `on_change_complete` continue to work without changes.

## Stage gate & handoff

The execute gate requires the plan handoff. After writing `execution.md`
and registering canonical changes/tasks, record the handoff that reflect reads
first:

```js
import { stageGate, stageHandoffWrite } from '../../lib/kbd/stage-gate.mjs';

const gate = stageGate('execute', { cwd });
if (gate.status !== 0) throw new Error(gate.stderr);

// … select backend, write execution.md, register canonical work items …

stageHandoffWrite(
  'execute',
  '<1–3 sentences: backend chosen, dispatch contract, first pending change>',
  ['execution.md', 'progress.json'],
  { cwd },
);
```

Phases without a `handoffs/` directory are legacy: `stageGate` warns and still
passes. A deliberate stage skip is recorded with
`stageHandoffSkip('execute', '<reason>', { cwd })`.

## Delivery cadence profiles

When a delivery-cadence profile is selected, include its path, state root, iteration scope, required build/run actions and publication interval in the authored execution dispatch contract. The harness remains continuation owner; kbd-apply remains canonical task owner. Do not edit generated waypoints.

Finish the complete independently usable increment, then BUILD and RUN its actual function. Do not run test suites, per-task verification or reviewer loops at iteration boundaries. Fix build, launch or functional failures before beginning another increment. A timer never certifies partial work. Apply the profile's human review and publication policy; keep architecture approvals separate. See the delivery-cadence skill only for cadence-enabled work.
