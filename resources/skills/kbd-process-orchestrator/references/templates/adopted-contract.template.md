# Adopted completion contract — authoring template

Author this during Spec/Plan, freeze it before production implementation, and
adopt it through the existing canonical writer. The machine-checked artifact is
`adopted-contract.json` in the phase directory, validated against
`references/schemas/adopted-contract.schema.json`, which dispatches on
`contractVersion`: new contracts use version 2 (VLBV,
`adopted-contract.v2.schema.json`); version 1 contracts
(`adopted-contract.v1.schema.json`) stay valid until their phase closes. This
template explains each section; placeholders are not acceptance evidence.

## Adoption (canonical writer only)

Run from the consumer project. Replace `<package-root>` with the absolute root
of the loaded mini package (the directory containing `scripts` and `lib`), or
the source checkout root for development. Keep the consumer working directory;
do not copy scripts into the project. Quote paths, including paths with spaces.

```
node "<package-root>/scripts/kbd-contract-adopt.mjs" ".kbd-orchestrator/phases/<phase>/adopted-contract.json"
```

The writer validates the contract against the schema, computes the digest with
the frozen normalization, stamps `identity.planRevision` (from
`prometheus kbd status --json`) and `identity.contractDigest`, and records an
immutable `prometheus kbd decision record` bound to the current plan revision.
It never hand-writes journals, waypoints, or signatures. Re-running with
identical content is idempotent (no duplicate decision).

Before any canonical read or write, the writer runs the **adoption lint**
(`lib/kbd/contract-lint.mjs`; document checks only, legal before B4): scenario
IDs, and for version 2 scope coverage (`scopeRefs` or `nonObservable`), a
`scenario` and a `negativeControl` packet command per scenario, safety-check
mapping, weak oracles (bare exit status, truth taken from the system under
test), undeclared nondeterminism, template placeholders, `sourceRequirement`
form, the exact status vocabulary, closure states, `method.name` and the
calibration digest, `ownerTask` against the registered task surface, and
unresolved CRITICAL review findings on acceptance content in
`.kbd-orchestrator/phases/<phase>/review/contract/findings.json`. A CRITICAL
finding blocks adoption until the owner records a canonical decision and the
writer is re-run with `--owner-decision <decision-id>`. Run the lint alone (no
canonical read or write, works outside a KBD project) with:

```
node "<package-root>/scripts/kbd-contract-adopt.mjs" --lint-only ".kbd-orchestrator/phases/<phase>/adopted-contract.json"
```

Before adoption, stamp the phase's OpenSpec delta digest into
`method.specDeltaDigest` (version 2):

```
node "<package-root>/scripts/kbd-spec-delta-digest.mjs" --phase "<phase>"
```

Readiness recomputes it and returns `REJECT-STALE` when a bound requirement
changed after adoption; adopt the new deltas through a signed amendment.

## Digest normalization (frozen per contract)

```
sha256( stableStringify(contract minus identity.contractDigest minus identity.planRevision) )
```

implemented by `lib/kbd/adopted-contract.mjs` (`stableStringify` +
`digestPayload`) — recursively key-sorted compact JSON hashed with
node:crypto; the Node equivalent of the full pack's frozen
`jq -S -c 'del(.identity.contractDigest) | del(.identity.planRevision)'`.
`identity.contractDigest` is excluded to avoid self-referential recursion.
`identity.planRevision` is excluded because the canonical Decision binds
`plan_revision` at record time. Writer and checker MUST use the identical
normalization recorded in `digestNormalization.command`.

## Amendment / restart

An amendment is a content change (e.g. `status.implementationComplete` false→true)
adopted with `--supersedes <prior-decision-id>`: new digest, new canonical
decision, history preserved. The readiness checker accepts only the latest
non-superseded adoption digest for the contract path; any older digest is
REJECT-STALE. Consumed budgets and history are never reset by amendment.
Budget extensions distinguish additive allowance (a bare number or
`{"operation":"add"}`), a replacement ceiling (`{"operation":"replace"}` or an
explicit `resultingCeilings` snapshot), and unchanged settings
(`{"operation":"unchanged"}`): an additive time/tool extension must never
silently double a no-progress threshold.

## Section checklist

| Section | Requirement |
|---|---|
| `identity` | projectId / runId / phaseId from canonical sources; planRevision + contractDigest stamped at adoption |
| `adoptionSource` | explicit operator instruction; never inferred |
| `releaseClaim` | real user operation, supported environments, honest current capabilities, explicit UNKNOWNs — never task counts |
| `scenarioMatrix` | finite, frozen stable IDs; each entry: production entry, real collaborators, oracle, negative control, fixture identity (scratch roots + digests), evidence requirements, owner task |
| `functionalScope` / `resilienceScope` | separate lists; adopted resilience never defers via budget overflow; only never-adopted optional items in `deferredOptional` |
| `exclusions` | frozen; scope change only via operator-adopted amendment |
| `requiredSafetyChecks` | non-waivable; never downgraded by repair-budget exhaustion |
| `budgets` | time/tool/repair/no-progress ceilings; token = measured or `UNKNOWN` + fallback; exhaustion => checkpoint + BLOCKED |
| `evidenceInvalidation` | digest/revision/fixture-keyed; only affected evidence invalidated; history preserved |
| `workerRoutes` | agent + model route, billing confirmation, subagent policy, review-round cap |
| `boundaryPacket` | `postImplementationOnly: true`; typed commands (`build`, `run`, `scenario`, `negativeControl`) run once at B4; expected effects, approvals, receipts, cleanup, `runnerOutputGlobs` (runner output scanned at closure against the B4 authorization; report only), stop conditions |
| `calibration` / `method` / `closure` | v2: owner-reviewed examples by SHA-256; method identity incl. `specDeltaDigest` (`scripts/kbd-spec-delta-digest.mjs`); four closure states, all false at adoption |

## Field reference (generated from the schema)

<!-- generated:contract-fields:start — scripts/generate-contract-templates.mjs; do not edit by hand -->
Scenario ID pattern: `^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]+$` (for example `SCN-AUTH-001`).

Contract (v2) required top-level fields: `contractVersion`, `kind`, `identity`, `digestNormalization`, `adoptionSource`, `decisionOwner`, `amendmentPolicy`, `releaseClaim`, `statusVocabulary`, `scenarioMatrix`, `functionalScope`, `resilienceScope`, `exclusions`, `requiredSafetyChecks`, `budgets`, `evidenceInvalidation`, `workerRoutes`, `boundaryPacket`, `status`, `calibration`, `method`, `closure`.

| Scenario field | Required | Shape | Meaning |
|---|---|---|---|
| `id` | yes | string |  |
| `name` | yes | string |  |
| `ownerTask` | yes | string | Owning task ID(s) from tasks.json, e.g. "T4+T5+T7". |
| `productionEntry` | yes | string | Shipped script/CLI path and exact invocation. |
| `realCollaborators` | yes | array |  |
| `oracle` | yes | object (observation, expectedTruthSource, comparator) |  |
| `negativeControl` | yes | object (input, expectedRejection, commandRef) |  |
| `fixtures` | yes | string | Fixture identity: scratch roots, content digests, isolation guarantees. |
| `evidence` | yes | string | Required recorded evidence: argv, exit codes, stdout/stderr excerpts, digests. |
| `classification` | no | string | Optional: marks delivery/packaging-only validation so its failure is never cascaded into product-failure claims. |
| `actor` | yes | string | Who needs the behavior (VLBV 01). |
| `usefulOutcome` | yes | string | The observable value delivered (VLBV 01). |
| `sourceRequirement` | yes | string | OpenSpec requirement reference (openspec:<capability>#<requirement>), another backend reference, or an explicit 'assumption: <text>' (VLBV 01). |
| `reasonNow` | yes | string | Why this scenario matters in this phase (VLBV 01). |
| `likelihood` | yes | string | Sourced estimate, a qualitative judgment, or the literal UNKNOWN. Never an invented probability. |
| `mandatory` | yes | boolean | A mandatory gate, as opposed to ordinary priority (VLBV 03). |
| `scopeRefs` | no | array | functionalScope items (exact text) this scenario covers. |
| `substitutedBoundaries` | yes | array | Boundaries replaced by a stub or double; their evidence can never be promoted to a real claim (VLBV 08). |
| `limitations` | yes | array | What this scenario does not establish (VLBV 16). |
| `invalidationKeys` | yes | array | Source/fixture/config/oracle identities whose change makes only this scenario's evidence stale (VLBV 15). |
| `restoration` | yes | string | Restoration and cleanup this scenario requires before closure (VLBV 14). |
| `nondeterministic` | no | boolean |  |
| `stochastic` | no | object (samples, grader, stoppingRule) | Declared before any result exists (VLBV 21). Required when nondeterministic is true. |

Status vocabulary: `PASS` / `FAIL` / `BLOCKED` / `NOT_EXERCISED`.
Boundary packet command kinds: `build`, `run`, `scenario`, `negativeControl`.
<!-- generated:contract-fields:end -->

## Status vocabulary (exactly four verdicts)

`PASS` / `FAIL` (product: real oracle unmet) / `BLOCKED` (verification:
validator/env/fixture unavailable) / `NOT_EXERCISED`. Every scenario run
records attempted / observed / evidence. Unknown is neither success nor
observed failure. Delivery/packaging-only checks (e.g. strict skill validation)
are marked with `classification` and their failures never cascade into
product-failure claims.
