# Boundaries (B0–B6) and the value-phase boundary sequence

This is the **only** definition of a gate, checkpoint or boundary in the pack.
Every skill, prompt, integration note and harness protocol that mentions one links
here and defines none of its own. VLBV is the method for every phase (see
`method-context.md`); a signed `KBD-METHOD` deviation may name another execution
cadence for one phase, and the closure packet discloses it.

Product acceptance executes at **B4** once, then only at **B5** for an admitted
affected repair. Early static runner, fixture, selector/step mapping and oracle
review, source inspection, and editor/LSP diagnostics are developer feedback,
not an execution or acceptance event. A compiler, test, build, or validator
that runs generated code requires the applicable adopted cadence and explicit
admission; only a signed method decision can specify another execution cadence.
A tier label, hook, marker, or clock never confers authority.

`<pack-root>` below is the installed mini pack root (the directory holding
`scripts/` and `lib/`). Every command is a Node ESM entry point run as
`node <file>`; none needs a shell.

| ID | Boundary | Trigger | Allowed | Not allowed |
|---|---|---|---|---|
| B0 | Edit batch | Any edit | Reading, static reasoning, editor/LSP diagnostics | Any execution of generated code: tests, builds, compiler checks, imports, lint, typecheck, probes |
| B1 | Task end | `kbd-apply end-task` | Journal the transition | QA, review, tests, build |
| B2 | Change end | Last task of a change | Record implementation complete; `openspec validate --strict` through the managed runner (a static check of spec documents only) | Refiner, adversarial review, OpenSpec verify, archive, tests, build |
| B3 | Checkpoint | Cadence tick, time limit, compaction, pause, harness handoff | Save state, stop admitting new scope, write the handoff | Any execution; refreshing the pack or OpenSpec |
| B4 | Value-phase boundary | All planned production complete, contract amended to `implementationComplete`, separate current authority | The boundary packet, once, in order (below) | Commands outside the packet; retries |
| B5 | Repair boundary | An attempt is recorded and the current owner-bound contract and admission cover a bounded repair within `budgets.repairAttempts` | Complete the agreed repair, then rerun only the affected scenarios and their negative controls; invalidate affected evidence | New scope; weakening an oracle without a signed amendment |
| B6 | Release and publication | Phase CLOSED and release authority given | Delivery-cadence publication procedures | Treating publication as acceptance |

## The B4 sequence

One normative sequence. `kbd-execute`, `value-scenario-verify`, `delivery-cadence`,
`kbd-reflect` and `kbd-handoff` reference it; none restates it differently.

1. **Admit.** `node <pack-root>/scripts/kbd-phase-readiness-check.mjs --phase <id>`
   confirms the latest non-superseded contract digest, the bound OpenSpec deltas
   (`REJECT-STALE` when a bound requirement changed), complete production, method
   resolution and current boundary authority. The owner's authorization is recorded
   once, before any attempt, with
   `node <pack-root>/scripts/kbd-boundary-authorize.mjs --phase <id> --authorizer <who>`
   (an append-only event in `boundary-authorization.json`; `--boundary B5` for an
   authorized repair). Closure compares runner output under the contract's
   `boundaryPacket.runnerOutputGlobs` against this instant and lists anything older
   in the closure packet (passive evidence of early execution; it never blocks).
2. **Freeze the candidate.** Record source, build, configuration, fixture and
   reference identities. Delivery-cadence `candidate freeze` *is* this step.
3. **Run the boundary packet once, in order.** Commands are typed `build`, `run`,
   `scenario` and `negativeControl` (contract v2; v1 contracts list them as
   strings). The cadence checkpoint's build and functional run are the packet's
   `build` and `run` entries, not a separate execution.
4. **Record.** Write `boundary-results.json` with one verdict per scenario —
   `PASS`, `FAIL`, `BLOCKED` or `NOT_EXERCISED` — and `executedBy`
   (`harness`, `version`, `model`). Keep the original runner output beside it.
5. **Cumulative static QA and adversarial review.** One artifact-refiner pass and
   one cross-model adversarial review over the whole phase diff. The refiner
   triggers no build.
6. **Close.** `node <pack-root>/scripts/kbd-phase-close-eval.mjs --phase <id>`
   evaluates against the bound contract and writes the closure object
   (`closure.json`) and `closure-packet.md`.
7. **After CLOSED only.** OpenSpec verify and archive for every change in the
   phase, through `kbd-apply verify` / `kbd-apply archive` (archiving earlier would
   write unverified behavior into `openspec/specs/`).
8. **Reflect.** Plan-versus-outcome differences and contract-accuracy metrics
   (`kbd-reflect`).

If a valid product oracle reports the required outcome unmet, record FAIL. A
broken runner, fixture, environment or unusable oracle is BLOCKED; record
unexecuted cases as NOT_EXERCISED. Neither can yield accepted closure. For a
harness-only defect, preserve the original receipt and consumption and use only
the existing signed recovery/admission for the affected check and unexercised
required cases. Retain an unaffected receipt and identical build artifact only
if its bound source, build, configuration, runtime, fixture and oracle inputs still
match. A fixture typo alone is not cause for a full rebuild or retest. Where no
supported recovery is admitted, stop and report the exact blocker. A later
green receipt never overwrites an earlier attempt.

## Closure states

The four states are separate and never inferred from each other:
`implementationComplete`, `behaviorAccepted` (B4/B5 passed every mandatory
scenario), `releaseEligible`, `releaseAuthorized` (a separate owner decision).

## Rust phase gates

For Rust and Cargo work the same boundaries apply. During B0–B2 rust-analyzer
diagnostics are static reading; no `cargo check`, `cargo build`, `cargo test` or
Clippy runs. At B4 the boundary packet names the smallest integration target that
exercises the real production path (`cargo test -p <package> --test <target>`),
never a bare `cargo test`; workspace-wide, Clippy and release builds belong to the
same single packet when the contract lists them. A B5 repair reruns only the
affected entries. Only one Cargo build runs on the machine at a time.

## Control level

The rules on this page are **instruction-only** on every harness. Contract digest,
staleness and amendment are enforced for callers of the canonical commands
(`scripts/kbd-contract-adopt.mjs`, `scripts/kbd-phase-readiness-check.mjs`,
`scripts/kbd-phase-close-eval.mjs`). No tool interception is provided or claimed.
