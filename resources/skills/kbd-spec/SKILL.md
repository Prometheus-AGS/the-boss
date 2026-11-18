---
name: kbd-spec
description: Use to run the Spec stage of the KBD lifecycle (between Analyze and Plan) — turn an assessment and analysis into concrete, ordered OpenSpec changes for KBD task execution.
license: MIT
metadata:
  version: '1.1.0'
  tags: 'process, orchestration, automation'
---

# /kbd-spec

Run the **Spec** phase of the KBD lifecycle — between Analyze and Plan.

## What this does

Converts `assessment.md` (and `analysis.json` / `library-candidates.json` when
the Analyze stage ran) into concrete change specs that the Plan stage will
order and the Execute stage will drive one task per turn:

This repository uses **OpenSpec**, pinned by `project.json.specBackend`.
Create `openspec/changes/<change-id>/` with proposal, design, delta specs, and
explicit tasks as required by the project schema. Execute those tasks through
`kbd-apply`; do not substitute a native change when OpenSpec is unavailable.

The reusable backend library also supports existing native-kbd changes, but
that portability capability does not override this repository’s OpenSpec
policy. Detection honors the explicit pin first, then change-local evidence,
then repository evidence; an empty result is not a native-kbd default. When
nothing resolves — no pin, no `openspec/`, no Spec Kit tree and no native
changes — initialize OpenSpec (2.0.0, pack-pinned) with
`node "<mini-pack-root>/lib/platform/openspec/cli.mjs" init --project "<project-root>"` and set
`"specBackend": "openspec"` in `project.json`, unless the operator chose Spec
Kit (see `/kbd-init --spec-engine`). Every `Scenario:` carries a WHEN (or
GIVEN) step and a THEN step; `openspec validate --strict` fails a scenario
missing either.

## Progress Signals (MANDATORY)

Before any other action, emit:

```
Starting kbd-spec — <phase-name or argument>
```

When all change specs are written, emit:

```
Completed kbd-spec — <phase-name or argument>
```

Use the canonical phase name from the argument or `current-waypoint.json`.
Never guess. Emit to plain response text — no tool call needed.

## How to invoke

1. **Confirm the active phase** — from argument or
   `.kbd-orchestrator/current-waypoint.json`.
2. **Stage gate** — call `stageGate('spec', { cwd })` from
   `lib/kbd/stage-gate.mjs` and stop unless its returned `status` is zero
   (requires assess; an absent optional analyze handoff is walked back).
3. **Read inputs** — `assessment.md`; `analysis.json` /
   `library-candidates.json` if Analyze ran (adopt/adapt candidates become
   "reuse this library" tasks, not "build it" tasks).
4. **Confirm backend** — `kbd-apply` must resolve the pinned OpenSpec backend;
   repair missing CLI/setup prerequisites instead of silently changing backends.
5. **Write OpenSpec changes** — use the project’s OpenSpec creation workflow,
   with declared scope and an explicit task list for each change.
6. **Adversarial vet** — when `adversarial-review` is installed and
   `--skip-adversarial-review` was not passed, run it in artifact mode against
   the whole change set (every change named in the spec handoff, not one at a
   time — a spec is only coherent against its siblings; cross-change failures
   like a declared scope that omits a file its tasks edit, or two changes
   editing the same file with no ordering, are invisible when reviewed in
   isolation). CRITICAL findings → revise the affected OpenSpec proposal,
   design, delta specs, or tasks and re-vet (max 2 rounds, then accept with
   an "Unresolved review findings" section appended). WARNING findings → carry
   into the stage handoff.
7. **Write handoff** — see "Stage gate & handoff" below.

## Hook integration

Fires `spec:before` / `spec:after` via `hooksFire('spec', 'before'|'after', name, index, total, ctx)`
from `lib/kbd/hooks.mjs` (`spec` is a recognized `kind`).

```js
import { hooksFire } from '../../lib/kbd/hooks.mjs';

await hooksFire('spec', 'before', phase, 1, 1, { orchestratorRoot, cwd, runCommand });
// … write change specs …
await hooksFire('spec', 'after', phase, 1, 1, { orchestratorRoot, cwd, runCommand });
```

## Stage gate & handoff

```js
import { stageGate, stageHandoffWrite } from '../../lib/kbd/stage-gate.mjs';

const gate = stageGate('spec', { cwd });
if (gate.status !== 0) throw new Error(gate.stderr);

// … write change specs, adversarial vet …

stageHandoffWrite('spec', '<changes created>', [firstChangeSpecPath], { cwd });
```

## Examples

```
/kbd-spec                                # uses active waypoint phase
/kbd-spec canonical-lifecycle            # explicit phase name
```

## Finite scenario matrix + contract authoring (required, mini #60)

Spec freezes the finite scenario matrix: stable scenario IDs (pattern
`^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]+$`, e.g. `SCN-AUTH-001`), production entry point, real collaborators, oracle,
negative control, fixture identity (scratch roots + digests), evidence
requirements, and owning task ID per scenario — using
`skills/kbd-process-orchestrator/references/templates/acceptance.template.md`
fields. Separate functional scope from resilience scope; adopted resilience
requirements never defer via budget overflow. Author the phase
`adopted-contract.json` (schema:
`skills/kbd-process-orchestrator/references/schemas/adopted-contract.schema.json`)
in this stage. New contracts use version 2 (VLBV: selection rationale, structured
oracles with an independent truth source, negative controls bound to typed packet
commands, real and substituted boundaries, limitations, per-scenario invalidation
keys and restoration, optional stochastic profile, calibration, method identity
with `method.specDeltaDigest`, four closure states); version 1 contracts stay valid
until their phase closes. Check the draft with
`node "<package-root>/scripts/kbd-contract-adopt.mjs" --lint-only "<contract>"`
(document checks only; nothing executes).


Before freezing the matrix, run `value-scenario-discovery` for the candidate
frontier; only owner-adopted candidates enter `scenarioMatrix`, with stable IDs
and exact owner task IDs. Executable BDD authoring is a later, separate act
(`bdd-cucumber-js author-only`, under governing repository policy), and
execution is `value-scenario-verify` at the authorized completed boundary.

## Selected-method recovery and authority

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase-local `method-context.md` when Node is unavailable) and act on its `status`:

- `RESOLVED_REFERENCES` — continue with the recovered method, contract and stage authority; preserve the same references in role inputs, dispatch and handoff read order.
- `BLOCKED` — the contract, its binding, a calibration reference, a supersession or a deviation's cadence/reason is missing or changed, or canonical status is unavailable; resolve it explicitly. Prior commands, memory and tool inventories are not fresh authority.
- `CONFLICT` — a governing rule file the active harness loads grants an exception VLBV forbids (for example a compiler check or an hourly integration gate during generation). Stop before dependent work and show the conflict; continue only after the operator records a `KBD-POLICY-ACK` decision for that file's current hash. Never rewrite operator-owned policy, and never treat an exception as authority for tests, builds, dry-runs or generated-code verification.

VLBV is the method for every phase (project default `verificationMethod: "VLBV"`); a deviation exists only as a signed `KBD-METHOD` decision naming the method, its execution cadence and its reason, and it is disclosed in the closure packet. Define acceptance before generation; generated code executes only at the value-phase boundary (B4) and, after an authorized repair, at B5 — see `kbd-process-orchestrator/references/boundaries.md`. Tasks, hours, commits, reviewer requests and compiler problems create no boundary. Preserve original evidence, consumed budgets and unresolved effects across resume and supersession; reconcile an uncertain effect before any retry. Full rules: `kbd-process-orchestrator/references/method-context.md`.

