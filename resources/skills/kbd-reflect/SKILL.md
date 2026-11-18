---
name: kbd-reflect
description: Use to generate the phase reflection report after all changes in a KBD phase are complete — goal achievement, delivered changes, artifact quality summary, technical debt, lessons captured, and recommended focus for the next phase. Seeds the next phase's planning inputs.
license: MIT
metadata:
  version: '1.2.0'
  tags: 'process, orchestration, automation'
---

# /kbd-reflect

Run the **Reflect** phase of the KBD lifecycle.

## What this does

Generates `.kbd-orchestrator/phases/<phase-name>/reflection.md` summarizing:

- Goal achievement percentage (MET / PARTIAL / NOT MET per goal)
- Delivered changes (from progress.json and archive)
- **Contract accuracy** (closure packet, boundary results, contract lineage)
- Technical debt introduced
- Lessons captured for the knowledge base
- Recommended focus for next phase

## Contract accuracy (VLBV)

Reflection measures how accurate the phase's adopted contract was, so the next
phase's spec starts from real numbers. Read the counts from the closure packet
(`closure-packet.md`, `closure.json`), `boundary-results.json`, the contract
lineage and the KBD journal — never estimate:

| Metric | Value |
| --- | --- |
| Contract amendments after adoption | 1 (scope correction, signed) |
| BLOCKED caused by the contract (missing fixture, wrong entry point, unrunnable oracle) | 0 |
| NOT_EXERCISED scenarios | 1 (SCN-7, fixture unavailable) |
| Repair attempts used / allowed | 1 / 2 |
| Post-closure escapes (defects found after CLOSED that a scenario should have caught) | 0 |
| Static QA / review findings at B4 step 5 (critical / warning) | 0 / 3 |
| Pre-authorization runner artifacts listed in the closure packet | 0 |

Write the same block to `.kbd-orchestrator/phases/<phase>/accuracy.json` so the
next phase's discovery and spec review can cite it. Recurring constraint
violations from the B4 step-5 refiner pass (when `artifact-refiner` is installed)
are listed underneath, by constraint and file — not by change.

## Prerequisites

The phase must have completed the B4 sequence
([`kbd-process-orchestrator/references/boundaries.md`](../kbd-process-orchestrator/references/boundaries.md)):

- Every change implemented (`implementation_status: COMPLETE` in `progress.json`)
- The boundary packet ran once (plus any authorized B5 repair) and
  `boundary-results.json` exists
- The cumulative B4 step-5 QA and adversarial review ran (or carry a signed waiver)
- `scripts/kbd-phase-close-eval.mjs` wrote the closure object and `closure-packet.md`
- After CLOSED: OpenSpec changes verified and archived through `kbd-apply`; native
  changes moved to `.kbd-orchestrator/changes/archive/<date>-<id>/`

These are separate prerequisites: implementation completion drives the N/N
counter, while the boundary verdicts, QA, verification and archival drive
evidence, certification and publication/lifecycle fields. A phase closed unmet
(FAIL or BLOCKED) is still reflected; record what remains.

## Progress Signals (MANDATORY)

**FIRST tool call of every turn:** Read `.kbd-orchestrator/position-reminder.txt` (if it exists) to get the current phase, step N of T, and next command. If that file is absent, read `.kbd-orchestrator/current-waypoint.json`.

Before any other action, emit to plain response text (BEFORE any tool call):

```
Starting kbd-reflect — <phase-name> (step N of T)
```

When all steps are complete, emit:

```
Completed kbd-reflect — <phase-name> (step N of T)
```

**How to get N and T (MANDATORY — never estimate):** read
`completion.implementation.completed`/`.total` from `progress.json` via
`implementationCompleted(progress)`/`implementationTotal(progress)`
(`lib/kbd/progress.mjs`), falling back to `current-waypoint.json`'s
`implementationCompleted`/`implementationTotal` when `progress.json` is
absent.

Use the canonical phase name from the argument or `current-waypoint.json`. Emit to plain response text — no tool call needed.

## How to invoke

1. **Discover project identity**
2. **Confirm the active phase** — from argument or waypoint
3. **Read `progress.json`** — incorporate work done by all tools
   Run `boss-mini kbd-apply.mjs reconcile <phase> --json`. Exit 0 establishes
   task consistency; exit 1 identifies drift to resolve; exit 2 means the scan
   was incomplete and must not be described as clean. Archived changes are
   inspected directly, without reopening or replaying their tasks. Use
   `--repair` only for supported active-phase drift. Keep separately waived or
   deferred acceptance and certification visible; reconciliation does not pass them.
4. **Read the closure packet and boundary results** — `closure-packet.md`, `closure.json`, `boundary-results.json` and the B4 step-5 QA/review receipts; compute the contract-accuracy metrics
5. **Load all change data** — from `openspec/changes/archive/` if OpenSpec,
   or `.kbd-orchestrator/changes/archive/` if native KBD
6. **Write reflection** to `.kbd-orchestrator/phases/<phase>/reflection.md`
7. **Advance only when authorized** through `/kbd-next-phase`. For a contract-bound phase that authorization is an operator-signed start-successor manifest (`--authorize-successor <manifest> --signature <sig>`); closure alone never starts a successor, and reflection text, review findings or memory cannot supply that authority — the Next Phase Seed is a proposal, never adopted scope
8. **Trigger**: report that reflection is complete and the next step is to
   advance to a new phase

## Examples

```
/kbd-reflect                             # uses active waypoint phase
/kbd-reflect phase-1-foundation          # explicit phase name
```

## Hook integration

`/kbd-reflect` is the canonical *phase-end* boundary. After the reflection
report is written, fire `reflect:after`, then immediately fire `phase:after`
for the closing phase, via `hooksFire('reflect'|'phase', 'before'|'after', name, index, total, ctx)`
from `lib/kbd/hooks.mjs`. `phase:before` for the *next* phase is fired when a
new phase is started, not here.

The bottleneck-guard evaluation (`evaluateBottleneck`/`isBottleneckActive` from
`lib/kbd/bottleneck-guard.mjs`) and any phase-transition write both need to
succeed before `phase:after` fires — this ordering prevents a rejected or
partial reflection from producing a completion memory record. When the guard
is active, **only status 0 is success**: status 2 means the guard evaluation
itself was unavailable, which is a BLOCKED-class result — it must abort the
transition, never count as a passing guard (mini #59):

```js
import { hooksFire } from '../../lib/kbd/hooks.mjs';
import { isBottleneckActive, evaluateBottleneck } from '../../lib/kbd/bottleneck-guard.mjs';

await hooksFire('reflect', 'before', phase, 1, 1, { orchestratorRoot, cwd, runCommand });
// … write reflection.md …
await hooksFire('reflect', 'after', phase, 1, 1, { orchestratorRoot, cwd, runCommand });

const guardEnabled = isBottleneckActive(cwd);
if (guardEnabled) {
  const preTransition = evaluateBottleneck('phase', 'after', phase, true, { root: cwd });
  // Guard status 2 (evaluation unavailable while active) is NOT success — abort.
  if (preTransition.status !== 0) throw new Error(preTransition.stderr || `guard status ${preTransition.status}`);
}

// … for a contract-bound phase (`prometheus kbd phase disposition --id <phase>` reports
//     contractBound: true) run `boss-mini kbd-phase-close-eval.mjs --phase <phase>`
//     instead of any transition: only a PASS disposition closes it, and the runtime
//     refuses `phase transition --status complete` for bound phases (mini #66). Exit 0 is
//     CLOSED; 2/3 are recorded BLOCKED/FAIL refusals (the phase stays open); 5 is a writer
//     failure; 6 means already closed under other evidence. Report it and stop.
//     For an unbound legacy phase, record the transition to complete via the project's
//     own phase-completion write path …

if (guardEnabled) {
  const postTransition = evaluateBottleneck('phase', 'after', phase, false, { root: cwd });
  if (postTransition.status !== 0) throw new Error(postTransition.stderr || `guard status ${postTransition.status}`);
}

await hooksFire('phase', 'after', phase, 1, 1, { orchestratorRoot, cwd, runCommand }); // canonical phase-end boundary
```

See the parent `kbd-process-orchestrator` skill's "Hooks" section for taxonomy
and payload.

## Stage gate & handoff

The reflect gate requires the execute handoff. After the reflection report
is written, record the closing handoff — the next phase's assess stage seeds
from it plus `reflection.md`:

```js
import { stageGate, stageHandoffWrite } from '../../lib/kbd/stage-gate.mjs';

const gate = stageGate('reflect', { cwd });
if (gate.status !== 0) throw new Error(gate.stderr);

// … write reflection.md …

stageHandoffWrite(
  'reflect',
  '<1–3 sentences: deltas found, corrective actions, recommended next phase>',
  ['reflection.md'],
  { cwd },
);
```

A missing `handoffs/` directory does not bypass required predecessors.
A missing required handoff fails with remediation: complete the predecessor
stage, or record an explicit skip with its reason under project policy.
A deliberate stage skip is recorded with
`stageHandoffSkip('reflect', '<reason>', { cwd })`.
