---
name: vlbv
description: >
  The verification method for KBD processes (Value-Led Behavioral
  Verification, VLBV). Use in a KBD-managed project, or wherever VLBV has been
  enabled, whenever you are about to run, write or plan tests, builds, compiler
  checks, lint or type checks on code just written; when the user asks whether
  to test now, what to run before committing, or how to report results; and
  when deciding if work is verified, accepted or releasable. States the
  boundary rule (generated code executes only at the
  value-phase boundary B4 and an authorized repair B5), routes to scenario
  discovery, author-only BDD and boundary verification, and carries the
  hash-pinned method text so it works offline on any harness. Do NOT use outside a
  KBD process unless VLBV is enabled or asked for, when the operator has named
  a different verification method, or for debugging a failure in code outside
  the current change.
license: MIT
compatibility: Instruction-only. Node.js 22.20 or newer is needed only by the KBD scripts it points to; no shell, Python helper, browser or service is required.
metadata:
  version: "1.1.0"
  tags: "testing, verification, vlbv, method, kbd, bdd, boundary"
---

# VLBV — Value-Led Behavioral Verification

## Mandatory value and business-rule trace

Always think in terms of user goals and value—not in tests or assumptions.

Before selecting work or defining acceptance, state the real actor's intended
outcome and its value. In the existing accepted specification or behavior
contract, write plain-language business rules: conditions, expected outcome,
exact representative examples/evidence, exceptions, and unresolved assumptions.
Do not proceed on an unresolved assumption that changes the intended outcome.
Every adopted VLBV scenario must identify the rule it verifies through the
existing `sourceRequirement`, explain value in `usefulOutcome` and `reasonNow`,
and bind its oracle, controls and evidence to that outcome. A labelled assumption
is not a confirmed business rule; use existing owner calibration/adoption to
resolve it before claiming acceptance.

Include only reachable real user journeys, plausible supported failures,
material risks or required safeguards. Omit impossible/artificial cases and
outcomes nobody values; do not invent cases to satisfy counts. Positive and
negative controls remain required where the adopted contract requires them and
must materially distinguish the intended outcome from a false positive.

When a case fails, classify its impact on a reachable, material accepted outcome
before a repair loop. An out-of-scope test failure does not justify changing
proven infrastructure or blocking review. Record and route genuine scope/check
conflicts through existing governance; never silently delete, mask, or weaken a
required check or signed scope. Preserve current phase-end BDD/VLBV, build,
release and approval processes. Tests verify business value, not define it.


VLBV is the verification method for every phase in this pack. A different method
for one phase exists only as a signed `KBD-METHOD` decision that names the method,
its execution cadence and its reason; the closure packet discloses it.

## Where it applies

VLBV is the default in a **KBD-managed project** (a `.kbd-orchestrator/`
directory at or above the project directory). A session-start hook
(`lib/hooks/sessionstart-vlbv.mjs`) states the boundary rule there, so the
default does not depend on this skill being selected.

Outside a KBD process it is optional. Turn it on, or off, with the first of these
that is set:

| Setting | Scope |
|---|---|
| `PROMETHEUS_VLBV_DEFAULT` environment variable | the shell that starts the harness |
| `<project>/.prometheus/vlbv-default` (one word) | one project |
| `<home>/.prometheus/config/vlbv-default` (one word) | the user |

Values: `kbd` (the built-in default: KBD projects only), `always` (every
session) and `off` (never). An unrecognised value falls back to `kbd`. The
operator can name another method for a task at any time; in a KBD phase a signed
`KBD-METHOD` decision records it.

## The boundary rule

> Agree a finite value phase and its scenarios **before** generation. Author the
> whole agreed increment **without executing generated code** — no tests, builds,
> compiler checks, imports, lint, typecheck, hooks or probes (editor/LSP
> diagnostics are static reading). At the value-phase boundary (**B4**) run the
> adopted boundary packet **once**. After a FAIL, only an owner-authorized repair
> (**B5**) reruns, and only the affected scenarios. Report exactly what the
> evidence supports.

Boundaries B0–B6 and the eight-step B4 sequence are defined once in
`skills/kbd-process-orchestrator/references/boundaries.md`. There is no compiler
exception.

## Route the work

| Moment | Invoke | Produces |
|---|---|---|
| Before generation: choose what to verify | the `value-scenario-discovery` skill | Calibrated scenario candidates → the phase's adopted contract (`scenarioMatrix`, `boundaryPacket`), adopted with `node <pack-root>/scripts/kbd-contract-adopt.mjs` (`--lint-only` runs the adoption lint alone) |
| After all production is written | the `bdd-cucumber-js` skill in `author-only` mode | Features, real assertions, steps — not run |
| B4 / B5 | the `value-scenario-verify` skill, after `node <pack-root>/scripts/kbd-boundary-authorize.mjs --phase <id> --authorizer <who>` | `boundary-results.json` with one verdict per scenario: PASS, FAIL, BLOCKED or NOT_EXERCISED |
| Closure | `node <pack-root>/scripts/kbd-phase-close-eval.mjs --phase <id>` (via `kbd-execute` / `kbd-reflect`) | Closure object (`closure.json`) and `closure-packet.md` |

The verdict vocabulary is exactly those four words. Implementation complete,
behavior accepted, release eligible and release authorized are four separate states.

## Reference text (offline, hash-pinned)

- [VLBV 01–22 and AT 01–22](references/requirements.md) — every requirement with
  its acceptance challenge.
- [Compact operating checklist](references/checklist.md) — before generation,
  during generation, at phase end, at closure.
- [Supersession record](references/supersession.template.md) — retire a failed
  method so it cannot return through plans, handoffs or compaction summaries.

Each file names the published edition, its IPFS CID and the SHA-256 of the copy it
was taken from. If the published edition changes, re-vendor and update the hash in
the same change.

## Recovery without hooks

On a fresh session, after compaction or a harness handoff — even where no hook
re-anchors the method — first read canonical status and the phase's
`method-context.md` (`node <pack-root>/scripts/kbd-method-context.mjs --phase <id> --write`),
state the boundary rule above, and only then act. Never rebuild a retired method
from an old plan, handoff or summary; keep relevant product failures and mandatory
approval gates (the supersession record's acceptance check).

## Control level

These are instruction-only rules on every harness. The contract digest, staleness
and amendment checks are enforced for callers of the canonical KBD commands. No
tool interception is provided or claimed.
