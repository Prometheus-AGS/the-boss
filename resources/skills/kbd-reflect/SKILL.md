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

**How to get N and T:** use the phase-scoped `taskCounts.runtime.completed` and `.total` in the JSON
report from `boss-mini kbd-apply.mjs reconcile <phase> --json`. Include
the progress projection and backend counts where they disagree. For a legacy
project without runtime state, label its counts as projection-only.

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

After the execute handoff and reflection review have been accepted, run the
installed package's `node <pack-root>/scripts/kbd-reflection-finalize.mjs
--phase <id> --accepted` from the consumer project. This executable writes
accepted reflection lessons and dispatches phase completion after canonical
closure. Retry the same command to complete pending actions. For a signed
operator exit, supply `--superseded <manifest> --signature <signature>` to
the evaluator. Read its canonical closure packet before writing the reflection.
In the goal table show each exercised verdict, withdrawal destination, budget
basis and explicit limits. Put only withdrawn work assigned to the proposed
successor into Next Phase Seed. Keep the terminal token visible, including
`CLOSED_UNMET` for an exit with no exercised evidence.

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
