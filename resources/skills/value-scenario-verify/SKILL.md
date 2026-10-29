---
name: value-scenario-verify
description: Verify an adopted finite scenario set at the authorized completed value-phase boundary using the project's existing real-path runner, with a safe oracle-sensitivity challenge, preserved attempts and canonical evidence. Not a runner, repair loop or early check.
license: MIT
compatibility: Node.js 22 or newer. Runs the runner and commands named in the adopted contract's boundaryPacket; API and CLI scenarios need no browser, Rust toolchain, shell or Python helper, or background service.
metadata:
  version: "1.0.0"
  tags: "testing, verification, vlbv, evidence, kbd"
---

# Value scenario verification

Invoke `/value-scenario-verify <contract-reference>`. This instruction-only
procedure routes an adopted boundary packet through existing tools. It does not
intercept commands and grants no permission the host does not provide.

Emit `Starting value-scenario-verify — <phase>` before work. Emit completion with
the actual scoped verdict only after observations are recorded. BLOCKED or
NOT_EXERCISED is never a completed acceptance claim.

## Admit the boundary

Resolve the canonical phase and run, the latest non-superseded contract binding,
and the contract's scenario IDs, exclusions, current candidate, oracle, evidence
invalidation keys, budgets, owned resources and cleanup. Reconcile uncertain
effects from earlier attempts before any retry.

Every agreed production obligation must be complete. A task, hour, commit,
checkpoint, reviewer request or compiler problem is not this boundary, and
unfinished production prevents running it. Readiness for implementation is not
permission to test: run the readiness check, then require separate current
authority for this boundary and its effects. If the frozen contract needs a
material amendment (including `status.implementationComplete`), use the existing
adoption path with `--supersedes`; never edit a bound contract or forge approval.

```
node "<package-root>/scripts/kbd-phase-readiness-check.mjs" --phase "<phase>"
```

Replace `<package-root>` with the absolute root of the loaded mini package; keep
the consumer working directory and quote paths.

## Run the smallest adequate real path

Use the exact commands in `boundaryPacket.commands`, once, in order, through the
project's existing runner (for example `bdd-cucumber-js` features on Node). Use
the real process, network, filesystem or CLI boundary: a Node/API or CLI journey
needs no browser. A mock that replaces the behavior under test is a substituted
boundary, recorded as such. A missing runner, permission, fixture, identity or
isolation is BLOCKED; never install tools or silently skip an adopted case.

Freeze source, configuration, fixture and candidate digests before running.
Assert the contract's externally meaningful observation against an independent
source of truth. Then challenge each material oracle family safely: run the
agreed plausible false positive or negative control (for example a deliberately
wrong expected value or a mutated copy under the scratch fixture root) and
confirm the real assertion fails. Never mutate production sources or shared
state for this. A disconnected `return false` step proves nothing about
sensitivity, and process exit zero alone is not an observation.

## Retain every material attempt

Save original runner output and observations before deriving any verdict. Record
contract/run/phase/scenario/assertion identity, expected-truth source, digests,
actual argv, what was attempted and observed, real versus substituted boundaries,
failed and successful attempts, consumed-budget high-water marks, repair lineage,
uncertain effects, restoration and cleanup.

| Situation | Disposition |
|---|---|
| Real exercised product oracle unmet | FAIL, with the observation |
| Required assertion never exercised, disabled or always true | NOT_EXERCISED; cannot pass |
| Stale candidate, configuration, oracle or evidence | BLOCKED; keep the stale attempt |
| Runner, prerequisite, fixture, permission or isolation unavailable | BLOCKED, not a product failure |
| Cleanup failed or effects uncertain | BLOCKED; reconcile before retry |
| Correct scoped observation, effective negative control, limits and cleanup met | PASS within that scope |

Never overwrite an earlier failure with a later green receipt. Budget exhaustion
checkpoints BLOCKED without dropping mandatory constraints. An authorized repair
finishes its complete implementation batch before one targeted reverification;
preserve prior consumption and re-evaluate affected evidence. Start no automatic
repair loop, new task, new phase, publication or successor.

## Return evidence to the existing writer

Write the existing `boundary-results.json` the mini evaluator already reads:
`phase`, `projectId`, `runId`, `contractDigest`, `sourceDigests`, `scenarios`
(each with `id`, `status`, `attempted`, `observed`, `evidence`) and
`budgetConsumption` (with its source and measured/estimate/unknown classes). Keep
assertions and negative-control receipts linked from `evidence`. Do not derive
fields from an exit code, and add no new ledger or schema field. Then:

```
node "<package-root>/scripts/kbd-phase-close-eval.mjs" --phase "<phase>"
```

Only that evaluator closes a bound phase; FAIL or BLOCKED stays recorded and the
phase stays open. Unsupported terminal vocabulary (cancelled, deferred, "closed
unmet") stays refused and is never mapped to PASS.

Report these separately: authored implementation, measured contract acceptance,
demonstrated runtime value, unresolved gaps, and release authority. Independent
final review stays separate.
