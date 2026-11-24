---
name: kbd-plan
description: Use to create an ordered KBD phase plan with evidenced, quality-first model and execution-route recommendations for every task, preserving task identity across OpenSpec and native KBD.
license: MIT
metadata:
  version: '1.1.0'
  tags: 'process, orchestration, automation'
---

# /kbd-plan

## User goals, value, and business rules

Always think in terms of user goals and value—not in tests or assumptions.

Before selecting or planning a unit of work, state the user's intended outcome
and why it matters. Anchor intended behavior in exact representative examples
and observed evidence; distinguish confirmed requirements from assumptions.
Before proposing a solution, query, or test, record plain-language, verifiable
business rules in the existing accepted specification or behavior contract:
condition, expected outcome, supporting evidence, exceptions, and unresolved
assumptions. Do not invent a separate workflow or treat assumptions as rules.
Trace scoped end-of-phase BDD scenarios to those rules. Test outcomes verify
user value; they do not define it. Preserve established build, release, phase-end
BDD/VLBV processes and approval gates unchanged.



Run the **Plan** phase of the KBD lifecycle for any project.

## OpenSpec lifecycle preflight

Before this stage, follow the [orchestrator preflight](../kbd-process-orchestrator/SKILL.md#openspec-lifecycle-preflight): use the pinned OpenSpec 2.0.0 CLI through the managed runner — session start runs the read-only `verify`; phase entry runs `refresh`, which updates existing KBD/OpenSpec projects — then use that same runner for OpenSpec commands. Retry a pending phase-entry refresh before OpenSpec work; preserve authored specs and task state. Phase scripts run this automatically, including canonical-runtime paths.

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

## Spec engine detection

OpenSpec (2.0.0, pack-pinned) is the primary spec engine and GitHub Spec Kit the backup;
native KBD change files remain for projects that already use them. Resolve the
engine exactly as `kbd-apply detect` does:

1. **`.kbd-orchestrator/project.json` `specBackend`** — an explicit pin wins
2. **The change's existing store** — native, then OpenSpec, then Spec Kit
3. **`openspec/` directory** at project root → OpenSpec
4. **`.specify/` or `specs/*/tasks.md`** → Spec Kit
5. **Native changes** under `.kbd-orchestrator/changes/` → native KBD

When nothing resolves, do not fall back to native files: initialize OpenSpec
with `node "<mini-pack-root>/lib/platform/openspec/cli.mjs" init --project "<project-root>"` and pin
`"specBackend": "openspec"` (or use Spec Kit when the operator chose it).

When the KBD runtime is authoritative, register each change's tasks with the
backend task ID (the ordinal that `kbd-apply list <change>` prints), so
`/kbd-apply` transitions the same records instead of mapping or refusing.

```
OpenSpec detected?
  YES → node "<mini-pack-root>/lib/platform/openspec/cli.mjs" run --project "<project-root>" -- new change <change-id>
        (managed runner; OpenSpec 2.0 has no /opsx:* commands — the skill equivalent is openspec-new-change)
      → create openspec/changes/<change-id>/proposal.md
      → tasks tracked in openspec/changes/<change-id>/tasks.md
  SPEC KIT → create specs/<change-id>/{spec.md,plan.md,tasks.md}
  NATIVE (existing native projects only)
      → create .kbd-orchestrator/changes/<change-id>/change.md
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
5. **Detect change backend** — OpenSpec, Spec Kit or native KBD (see Spec engine detection)
6. **Draft tasks and model assignments** — read [task model selection](references/task-model-selection.md). Draft backend task identities, analyze each task's requirements, discover configured models and the installed harness's controls, then write the ordered change list and one scoped concrete model/route assignment per task in `plan.md`. Quality-first is the default within explicit policy and budget constraints; a model class or agent recommendation per change is insufficient. Record unresolved routes without launching workers or configuring providers.
7. **Adversarial vet** — when `adversarial-review` is installed and
   `--skip-adversarial-review` was not passed, run it in artifact mode against
   the written plan. CRITICAL findings (ordering errors, missing dependencies,
   untestable criteria) → revise `plan.md` and re-vet (max 2 rounds). If
   CRITICAL findings remain unresolved when the round ceiling is reached,
   planning is **BLOCKED**: record the unresolved findings with their evidence
   and stop — a bounded retry limit never converts an unmet required criterion
   into acceptance (mini #59). WARNING/SUGGESTION findings → carry into the
   stage handoff summary; they never invent new blocking work. Vet **before**
   emitting change structures, so a corrected plan never leaves stale changes
   behind.
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

## Make exit reachable before adoption

Trace each predicate to the assessed end-user task and value in the exact
Origin/Before evidence. Bind the candidate selection and provenance, real entry
point and collaborators, fixtures, command and step map, independent comparator,
material negative controls, existing mandatory release prerequisites and
authorized effect bounds. Describe which dependencies each receipt relies on
and a finite affected-only recovery route. Do not optimize for scenario counts.

Statically check selectors/step mappings, fixture identity and inputs, available
prerequisites, command ordering and comparator independence. Flag a missing,
mismatched or circular prerequisite, including any artifact obtainable only
after the exit that requires it. Resolve or record the specific blocker before
adoption; do not repeatedly run a gate to discover an already-known mismatch.
Executable preflight requires the applicable adopted cadence and authority;
no preflight supplies product acceptance or changes a proven release process.
## Contract binding + single boundary packet (required, mini #60)

Plan output must bind contract identity + digest, scenario→task coverage,
worker routes, freshness keys, budgets, and ONE bounded boundary execution
packet.

Run from the consumer project. Replace `<package-root>` with the absolute root
of the loaded mini package (the directory containing `scripts` and `lib`), or
the source checkout root for development. Keep the consumer working directory;
do not copy scripts into the project. Quote paths, including paths with spaces.

Record adoption via
`node "<package-root>/scripts/kbd-contract-adopt.mjs" ".kbd-orchestrator/phases/<phase>/adopted-contract.json"`
before writing the identity-bound plan handoff (`ctx.identity` or
`KBD_HANDOFF_IDENTITY_JSON`). See
`skills/kbd-process-orchestrator/references/templates/adopted-contract.template.md`.
Plans without an adopted contract cannot pass the Plan→Execute readiness gate.

Author new contracts as version 2 (VLBV). Before adoption, run the adoption lint
alone (`node "<package-root>/scripts/kbd-contract-adopt.mjs" --lint-only "<contract>"`)
and stamp `method.specDeltaDigest` from
`node "<package-root>/scripts/kbd-spec-delta-digest.mjs" --phase "<phase>"`. Adoption is
refused while a CRITICAL review finding on acceptance content lacks an owner
decision (`--owner-decision <decision-id>`). The boundary packet lists typed
`build`, `run`, `scenario` and `negativeControl` commands and, optionally,
`runnerOutputGlobs`; it runs once at B4
(`kbd-process-orchestrator/references/boundaries.md`).

Map adopted discovery candidates (`value-scenario-discovery`) into the existing
finite `scenarioMatrix` and bind any acceptance-bearing calibration reference
through the contract adoption above before generation. Definition is distinct
from executable authoring (`bdd-cucumber-js author-only`) and from the single
boundary run (`value-scenario-verify`); neither is scheduled as a per-task test.

## Selected-method recovery and authority

Before dependent work, run `node <pack-root>/scripts/kbd-method-context.mjs --project <project-root> --phase <canonical-phase-id> --write` (or read the phase-local `method-context.md` when Node is unavailable) and act on its `status`:

- `RESOLVED_REFERENCES` — continue with the recovered method, contract and stage authority; preserve the same references in role inputs, dispatch and handoff read order.
- `BLOCKED` — the contract, its binding, a calibration reference, a supersession or a deviation's cadence/reason is missing or changed, or canonical status is unavailable; resolve it explicitly. Prior commands, memory and tool inventories are not fresh authority.
- `CONFLICT` — a governing rule file the active harness loads grants an exception VLBV forbids (for example a compiler check or an hourly integration gate during generation). Stop before dependent work and show the conflict; continue only after the operator records a `KBD-POLICY-ACK` decision for that file's current hash. Never rewrite operator-owned policy, and never treat an exception as authority for tests, builds, dry-runs or generated-code verification.

VLBV is the method for every phase (project default `verificationMethod: "VLBV"`); a deviation exists only as a signed `KBD-METHOD` decision naming the method, its execution cadence and its reason, and it is disclosed in the closure packet. Define acceptance before generation; generated code executes only at the value-phase boundary (B4) and, after an authorized repair, at B5 — see `kbd-process-orchestrator/references/boundaries.md`. Tasks, hours, commits, reviewer requests and compiler problems create no boundary. Preserve original evidence, consumed budgets and unresolved effects across resume and supersession; reconcile an uncertain effect before any retry. Full rules: `kbd-process-orchestrator/references/method-context.md`.

