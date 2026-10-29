---
name: value-scenario-discovery
description: Propose a finite, owner-calibrated set of useful behavioral scenarios before any test generation. Use independently or from KBD Assess, Spec and Plan. Preserves mandatory constraints, rejected alternatives and adoption authority. Does not adopt scope, author executable tests or run generated-code checks.
license: MIT
compatibility: Instruction-only. Node.js 22 or newer is needed only by the KBD scripts it points to; no browser, Rust toolchain, shell or Python helper, or service is required.
metadata:
  version: "1.0.0"
  tags: "testing, scenarios, discovery, vlbv, kbd"
---

# Value scenario discovery

Invoke `/value-scenario-discovery <phase-or-contract-reference>` to **propose**
scenarios, never to run them. It is the define step of the independently usable
[VLBV method](https://ipfs.prometheusags.ai/ipfs/bafybeihp44qigr3g5zoalkt3p6xvovaglcuzbsp3l4os5vba26glfz6zya/index.html).

Emit `Starting value-scenario-discovery — <phase>` first and
`Completed value-scenario-discovery — <phase> (proposal)` last. Take phase
identity and totals from actual context; never invent a counter.

## Resolve context

Read the governing repository/host policy, the current adopted contract (if any)
and any owner calibration already reviewed in this phase. Use the latest
authorized supersession, not a remembered command. A missing critical identity or
a policy conflict is stated explicitly. A tool being available is not permission
to run it.

Reuse the owner's useful operation, baseline (including UNKNOWNs), supported
environments, constraints, exclusions and decision owner from Assess. Do not ask
again for approval already given. If no examples exist, draft a few for owner
review before dependent generation: one ordinary useful operation, one available
but irrelevant test (deferred, with reason), and one rare mandatory constraint
(integrity, authorization or an irreversible effect). They stay proposals until
reviewed.

## Produce the finite frontier

Start from the ordinary operation the component exists to deliver. Include
mandatory integrity, safety, permission and irreversible-effect constraints even
when rare. For each candidate record:

| Field | Content |
|---|---|
| Candidate ID | Local candidate ID; an adopted scenario ID (`^[A-Z]+-[0-9]+$`) only if one already exists |
| Actor and outcome | Who needs the behavior and the observable value |
| Basis | Source requirement, or an explicitly labelled assumption |
| Reason now | Why it matters to the current phase |
| Likelihood | Sourced, qualitative, or `UNKNOWN` |
| Mandatory constraints | Kept separate from ordinary usefulness |
| Proposed observation | Real production entry, oracle source, plausible false positive |
| Disposition | Selected, rejected or deferred, with reason |
| Next decision | What observing it would let the owner decide |

Use the contract's finite budget where one exists; otherwise propose a small
frontier and its stopping criterion before expanding it. Do not invent
probabilities or weighted scores. Stop when the frontier supports the current
decision. An imagined alternative does not become a blocking requirement. When
the model or context changes materially, review unfamiliar candidates against the
saved examples rather than resetting reviewed scope.

## Save and hand off

Write the proposal to the requested phase artifact, normally
`.kbd-orchestrator/phases/<phase>/scenario-candidates.md`, listing the reviewed
examples, selected and deferred candidates with rationale, assumptions, UNKNOWNs
and the specific pending owner decision. Never label unreviewed output adopted.

Assess uses the proposal to refine usefulness. Only owner-adopted cases enter
`adopted-contract.json` `scenarioMatrix` during Spec/Plan (id, ownerTask,
productionEntry, oracle, negativeControl, fixtures, evidence) through the
existing adoption path. Bind acceptance-bearing calibration documents through
that contract's adoption or amendment; create no second acceptance ledger and no
extra schema fields.

Discovery defines scenarios before generation. It does not author features or
steps, import generated code, install dependencies, or run dry-runs, builds,
lint, typechecks, probes or runners. Executable authoring is
`bdd-cucumber-js author-only` (see `skills/bdd-cucumber-js/references/author-only.md`);
execution is `value-scenario-verify` at the separately authorized complete
value-phase boundary. No automatic task, phase, adoption, publication or release
follows a proposal.
