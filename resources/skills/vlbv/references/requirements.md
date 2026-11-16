# VLBV requirements and acceptance challenges (VLBV 01–22, AT 01–22)

> Vendored from *Value Led Behavioral Verification — KnowMe*, research & design
> edition of 27 October 2026 (author: Travis James). Source: https://ipfs.prometheusags.ai/ipfs/bafybeihp44qigr3g5zoalkt3p6xvovaglcuzbsp3l4os5vba26glfz6zya/index.html
> (IPFS CID `bafybeihp44qigr3g5zoalkt3p6xvovaglcuzbsp3l4os5vba26glfz6zya`).
> SHA-256 of the published `index.html` at vendoring (2026-11-15):
> `83becd798cfb1524ec2395907050beb970381b1833d59bff8a7f9270a69480c2`. Text is reproduced verbatim from the owner's paper; headings added.


"Core" means required for the minimal method; a profile requirement applies only when the corresponding capability or claim is offered. All executable verification of a generated implementation occurs at its declared phase-end boundary (in this pack: B4/B5, `skills/kbd-process-orchestrator/references/boundaries.md`).

| ID | Requirement | Acceptance evidence and challenge case |
|---|---|---|
| VLBV 01 | Core. Every selected scenario identifies its actor, useful outcome, source requirement or explicit assumption, and why it matters now. | AT 01 presents an attractive but irrelevant test; it is deferred with a reason rather than silently added. |
| VLBV 02 | Core. Owner-reviewed positive, rejected or deferred, and rare-critical examples calibrate scenario selection. | AT 02 uses unseen candidates; review measures relevance, missing assumptions, and critical-risk recognition rather than syntax alone. |
| VLBV 03 | Core. A finite phase contract records included value, exclusions, acceptance, authority, limits, and closure meaning before generation. | AT 03 attempts to add unrelated scope after a failure; the current contract remains unchanged and the proposal is separated. |
| VLBV 04 | Core. Generated-code execution waits until the complete agreed value phase ends; prohibited checks cannot be disguised as builds, lint, hooks, or preflight. | AT 04 challenges the declared guard with an early test-bearing command. Enforcement or advisory limitations are reported honestly; no compliance claim conceals an execution. |
| VLBV 05 | Core. Generation completion, behavioral acceptance, release eligibility, and release authorization are separate states. | AT 05 supplies completed tasks without runtime evidence; no behavioral or release verdict is produced. |
| VLBV 06 | Core. Every required outcome has an observable assertion and a known source of expected truth. | AT 06 removes an assertion and supplies a green process exit; acceptance is refused. |
| VLBV 07 | Core. Material oracle families receive an appropriate safe sensitivity challenge at phase end. | AT 07 deliberately supplies a wrong outcome; the intended assertion fails. A Cucumber step merely returning false must not count as a valid failing assertion. |
| VLBV 08 | Core. Real and substituted boundaries are explicit and cannot be silently promoted. | AT 08 supplies stub evidence for a real-provider claim; the real claim remains unverified. |
| VLBV 09 | Core. Receipts identify the tested candidate, contract, oracle, relevant environment, observations, and limitations. | AT 09 swaps the binary or configuration; a current-candidate pass is rejected until identity is reconciled. |
| VLBV 10 | Core. Failures, blocked claims, unexercised obligations, retries, and unknown effects remain visible. | AT 10 supplies only a final green retry; the missing earlier attempts and denominator prevent an unqualified reliability claim. |
| VLBV 11 | Core. Repairs and criterion amendments require appropriate authority and preserve prior versions and outcomes. | AT 11 weakens an oracle after failure; the system requires a reviewed amendment and new applicable evidence. |
| VLBV 12 | Core. Attempt limits stop new work without granting success or abandoning unresolved effects. | AT 12 exhausts an allowance with a remote job still unknown; the record preserves the obligation and safe next action. |
| VLBV 13 | Core. Approvals bind to the actual action and resource; verification cannot authorize unrelated effects. | AT 13 requests an unapproved publication or send; dependent execution remains blocked. |
| VLBV 14 | Core. Required restoration, cleanup, or authorized retention is recorded before unconditional closure. | AT 14 leaves a changed setting or billable fixture unresolved; the closure report exposes it and withholds the corresponding complete verdict. |
| VLBV 15 | Core. Evidence applicability is re-evaluated after a relevant change. | AT 15 changes an oracle, provider, or persistence component; affected receipts become stale or unknown, not silently current. |
| VLBV 16 | Core. The closure report answers what works for whom, under which conditions, with what limits, and what remains. | AT 16 asks an uninvolved reviewer to recover those answers from the report without reading the conversation. |
| VLBV 17 | Capability profile. Asynchronous claims distinguish transport, lifecycle, durable outcome, and unresolved effects. | AT 17 supplies a success event with no persisted result, or a heartbeat-only stream; neither earns the outcome claim. |
| VLBV 18 | Recovery profile. Resume preserves scope, candidate identity, permissions, counters, owned resources, and prior effects. | AT 18 interrupts after dispatch; recovery reconciles the action before any potentially duplicating retry. |
| VLBV 19 | Portability profile. A second named environment preserves the same claim and verdict semantics through a verified capability mapping. | AT 19 transfers a contract and performs the declared phase-end verification; unsupported capabilities stay explicit. |
| VLBV 20 | Integration profile. Existing phase systems retain canonical ownership, native vocabularies, and actual transition rules. | AT 20 offers a manual PASS while the canonical phase remains incomplete; no automatic completion event or incompatible schema write occurs. |
| VLBV 21 | Stochastic profile. Sampling, grading, retries, and stopping rules are declared before results are interpreted. | AT 21 hides failures or stops opportunistically; the report rejects the resulting reliability interpretation. |
| VLBV 22 | Core. Private evidence is minimized, controlled, and sanitized before public reporting. | AT 22 includes a secret or patient identifier in a candidate artifact; publication is blocked pending removal and review. |
