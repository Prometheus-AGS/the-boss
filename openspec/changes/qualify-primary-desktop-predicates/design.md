# Design

## Context

See [proposal](proposal.md) for purpose and [all 66 rows](predicate-matrix.md) for exact original task references. Snapshot source is Boss main `35bb424e997748c56393d8d8a074e84db9c4da3d`. The release being qualified is **2.2.38**, built from `2a508b433db5dea80073b46fee34b8c549043056`, with UAR `ac0970437096a1b935809bb90f48bfdd6d6421bd` and mini `52a84e7d19f3ffdae0b58bd1732a853abd06e748`.

The main phase is closed at KBD revision 709; the enclosing run was administratively retired. Cadence is retired with 17 archived successful deliveries. This proposal neither activates them nor adds a delivery. Code completion remains 61/61 tasks and 20/20 changes. Portfolio qualification remains 43/61 terminal items: 42 qualified and one historical skipped duplicate. The 66 local Boss rows are a different inventory.

2.2.38 has a published Mac ARM64 DMG, Windows x64 installer and matching live website links. The installed Mac affected scoped UAR prompt and whole-app reconnection were operated; the receipt explicitly does not claim a broad tool/negative matrix. Current native Windows operation and candidate-specific acceptance are pending. Acceptance of both 2.2.32 platforms remains valid historical acceptance, not acceptance of 2.2.38.

## Goals / Non-Goals

**Goals:** identify necessary primary-platform outcomes, qualify only missing clauses and preserve independent evidence/progress dimensions. Customer priorities are usable teams, configured inference, scoped shared memory, BossFang/shared UAR, feedback controls, usable skills/MCP and graceful service failures. This plan supplements retained core evidence; it does not reopen passing feature stories.

**Non-Goals:** production changes, another release, app builds, broad lint/unit suites, redownloaded checksum verification, repeated passing inference/memory/publication, Intel Mac, Windows ARM64, Linux, unused connectors, federation, privileged executor takeover or all-six-specialist qualification. Existing source and artifact review is not a new runtime pass. Pending qualification remains pending rather than being renamed completed.

## Decisions

### 1. Reconcile clause by clause before operating anything

For each row, record the original clause, retained receipt, source/dependency/operation contract, platform and result. Classify applicability as retained, invalidated, absent or unknown. An older receipt can establish an unchanged contract at its original candidate; it cannot certify another artifact's bytes or native platform. Source alone can establish inclusion/wiring, not runtime behavior. Preserve historical failures and staged versus public boundaries.

The primary row counts are **22 evidence/artifact**, **24 amendment**, **19 potentially missing operation**, **one deferred gate**. These identify the primary first action on each row, not all actions on its clauses. Evidence and amendment rows may retain contingent outcomes needing an operation. Consequently neither 19 nor 66 is a number of executions or newly unfinished features. The complete original row inventory is mapped now; the candidate-specific applicability register and atomic outcome queue are execution deliverables, not already-qualified findings.

Baseline source references and their read-only hashes are in [baseline-sources.json](baseline-sources.json). They include the original task markers, revision-bound phase progress, revision-709 retirement receipt, administrative closeout counters and Cadence relocation/index. The counting rule is 42 qualified + one historical skipped duplicate = 43 terminal; the skip is not a pass.

Use retained inputs/receipts and already-installed payload inventory first. Do not rebuild, reinstall, redispatch CI or republish to fill provenance fields. Public and local Mac DMG checksums differ and remain separately recorded. Do not redownload passing GitHub assets merely for recency.

Before Mac operation, identify the installed payload's originating DMG/hash from retained receipts. Bind public-candidate claims to the public artifact or a verifiable source/payload/content relationship already recorded between public and local artifacts; same version number alone is insufficient. If that relationship is unavailable without forbidden repeat work, operate the identified local payload and leave public-Mac acceptance pending. Human acceptance records all declared customer priorities through retained/new evidence references, not a new repeated run of each feature.

### 2. Approve architecture/procedure dispositions explicitly

These are recommendations, not applied spec changes or silent waivers:

| Historical prescription | Recommended primary-desktop contract | What remains protected / pending |
|---|---|---|
| 22 mini skills | Frozen versioned inventory: 101 mini + 7 Compass | Preserve historical 22-count receipts; user-file ownership and actual startup installation remain required. |
| Prometheus OpenSpec fork submodule | Locked upstream Fission-AI npm 1.14.0 JS closure, with actual shim/consumer provenance | Do not claim the fork is packaged. If its fork-specific functionality is required, retain it as separate pending work. |
| TOOLS tar stripping / five-platform binary releases | Existing integration manifest/importer and genuine two-platform binary provenance | Preserve checksum boundary and bundled executable selection; other platform clauses deferred. |
| Fixed Docker ports and Docker-only discovery | Selected configured managed/external services | Preserve external ownership, actionable unavailable endpoints and startup without dependencies. |
| Persistent Docker consent preference | Explicit owned Start/Restart action; no implicit startup lifecycle action | Stored preference is absent. Approval must explicitly replace that prescription, otherwise it remains an implementation gap. Do not operate or stop real externally owned services. |
| Four static presets, seeder and all-inactive defaults | Settings-visible workspace-managed MCP records, activation through explicit configuration | Static entries/seeder are absent. Preserve user-owned records, scoped workspace access and filesystem write approval; optional unbundled sycophancy server deferred. |
| Progressive partial doctor results | Require visible running/terminal/cancel/failure/repair states for core readiness; record incremental result streaming as pending improvement | Current stdout buffering cannot meet incremental partial-result streaming. Do not describe a running indicator as streaming results or mark this original clause passed. |
| Unit-first / per-task lint / new build commands | Existing source-bound evidence plus missing real packaged operations | Preserve failure/refusal intent. Keep historical failed lint; do not manufacture a passing command receipt. |
| Windows “repeat 4.3” dangling reference | Explicit skill startup/mirror criteria from 001 task 5.3 on Windows x64 | The correction must be recorded, not guessed during checkbox advancement. |

These dispositions may satisfy documented equivalents after approval, but exclusion/deferment is never a runtime pass. If original whole-task criteria remain unsatisfied, retain the original task unchecked with linked partial coverage. Record any approved requirement amendment in its owner and preserve original text/history; do not change main product specs as a side effect of this planning proposal.

### 3. Use seven deduplicated operation families, filtered by missing evidence

The table is an upper bound on scenario families, not permission to run every listed clause blindly. Remove a clause from the queue when an applicable retained receipt covers it. A multi-platform family is one planned scope with separately recorded native executions, not one cross-platform pass.

| Family / owner | Original references | Only missing primary-desktop outcome | Platform treatment |
|---|---|---|---|
| **Q1 skills installation**, desktop/skills | 001 2.1, 3.0, 4.1, 5.3–5.4 | Isolated fresh/upgrade skill registration, Claude mirror, writable full pack and real doctor/OpenSpec entrypoint; unchanged launch and collision/user-file preservation where unproven | Mac ARM64 and native Windows x64; use existing packages, do not overwrite a real full pack |
| **Q2 dependency/settings feedback**, desktop/runtime | 003 6.2/6.4; 004 2.1, 4.2–4.3 | App starts with unavailable dependencies; appropriate absent/down/error/running/cancel/terminal/repair or refusal states. Selected configured Windows service endpoints work; no WSL source dependency | Isolated configurations, not shutting down the user's Docker or memory. Already-passed full-pack refusal and managed-service lifecycle are excluded |
| **Q3 advertised MCP**, desktop/runtime | 002 3.2/4.3; 005 4.2/4.4 | Available workspace Compass/filesystem/shared-memory records expose correct tools and scoped connections; Windows executable startup. Read-only filesystem default remains enforced | Map retained Mac tool receipts first; operate only missing clauses. Native Windows .exe launch remains distinct from package inclusion |
| **Q4 missing executable**, desktop | 002 3.1; 005 4.3 | Owned record with a deliberately missing fixture path shows actionable failure while the app remains usable | Do not remove/rename installed binaries. Combine with Q3's platform session; no separate binary build |
| **Q5 current team controls**, runtime/security + desktop | C09 ordinal 5/6, A4–A6, B4–B5 | Only invalidated admission/control/UI clauses: bounded worker/reviewer continuation, exact scoped approval if genuinely needed, cancel/reopen, current foreign-workspace/directed-authority refusal | Retain all 14 staged cases and two public cases separately. No complete Gate A/B rerun, privileged reclaim or exhaustive crash/cycle matrix |
| **Q6 internal workflow controls**, runtime + desktop | C10 2.1–2.2/3.2 | Missing stale/revoked decision refusal, cancel original run, retained cancellation/accounting after runtime restart; keyboard controls in the same flow | Prior classify/draft/wait/idempotent decision remain applicable unless invalidated. No issue POST, no duplicate #63 or repeated passing external recovery |
| **Q7 protected skill preflight**, runtime/security | C15 1.2/1.4 | Forged/missing private coverage refusal, only if the existing privileged host context can supply the authenticated driver | Existing launcher lacks optional trustedRequest seam. Inspect existing protected entrypoints first; if unavailable, explicitly pending. Never add arbitrary renderer native-request authority or claim full coverage |

Q5 and Q6 start only if their specific current contract is missing/invalidated, not because the old row is unchecked. A new exact native authorization challenge may require its genuine human decision; do not create needless new approval cycles for unchanged passing reads. Do not bypass runtime policy or repeatedly replace expired challenges just to obtain a receipt.

Q1's existing packaged command path is `miniCommands.ts` → generated `boss-mini` / `openspec` shims → the writable pack's Node entrypoint (`scripts/doctor.mjs` or `node_modules/@fission-ai/openspec/bin/openspec.js`). Resolve the existing shims/environment from the owned isolated app profile. Source identifies this path but does not prove successful operation. If the installed profile lacks an accessible supported shim/entrypoint, keep that clause pending as a demonstrated packaging/entrypoint issue; do not invent a new public IPC route or install a replacement CLI.

Shared-memory, inference and BossFang operations already passed within their documented scope are not automatically added to Q3/Q5. Reuse their retained evidence; if a relevant source change invalidated a specific clause, name that change and clause before admission to the queue. A tool list does not prove cross-runtime memory persistence.

### 4. Review retained artifacts once

One independent packet covers practical-preset task 4 and the retained C09 independent-review clause. Include frozen source, real operation receipts, all twelve preset artifacts/hashes and the exact claims. Original root assessment is not independent review. If original artifacts are absent, recover their authenticated archive read-only or record the gap; a report that says artifacts existed is not a substitute for reviewing their content.

Obtain at most one correction/confirmation cycle. Review does not demand a build or another preset inference run. Six-specialist task 5 stays outside this primary desktop closure; narrower product/design/reviewer evidence does not prove all six specialists.

### 5. Sequence work for minimum duplicated effort

1. Lead completes applicability register and records approved dispositions. Do not activate old KBD/Cadence.
2. Independent reviewer inspects the retained artifact packet while desktop/runtime owners prepare only missing clauses using read-only source inspection.
3. One Mac operator uses an isolated 2.2.38 profile for the remaining Q1–Q6 clauses, sharing dependency setups and disposable workspace. Q7 remains separate to preserve its trust boundary.
4. One native Windows x64 operator uses the existing 2.2.38 installer for Windows-specific residual paths in the same consolidated session; record startup/.exe, service/settings and retained controls at their actual boundary. Do not infer Windows operation from Mac or Windows build.
5. Record operator acceptance of exact 2.2.38 candidate separately. 2.2.32 acceptance remains untouched.
6. Lead reconciles linked clause coverage and archives only fully satisfied changes. Partial rows and portfolio criteria remain open with reasons. Commit/push evidence-only results when execution is authorized; no CI build dispatch or website update is needed for unchanged artifacts.

Use boss-core lead, desktop/skills and runtime/security; at most three independent workers and one UI operator. Reviewers operate only on a completed packet. No new build writer/publisher is needed. Missing Windows access does not block documentary or Mac work, but Windows acceptance stays pending.

### 6. Defect escape hatch preserves truthful results

A demonstrated operation failure stops only that predicate and records candidate, inputs and failure. No blanket gate restart. If source repair is necessary, request/record a separately bounded corrective scope and build a new version only after complete production wiring; repeat only affected operations. This plan schedules **zero builds**. It cannot guarantee every missing clause passes without source changes.

## Risks / Trade-offs

- Old evidence may not match current admission or dependency contracts → explicit source-bound applicability; unknown does not mean pass.
- A procedural amendment can conceal a missing feature → record OpenSpec fork, Docker consent, preset architecture and doctor-streaming differences explicitly; operator approval required, excluded criteria remain visible.
- Customer scope can be confused with portfolio completion → keep 61/61 code, 43/61 portfolio and customer clause matrix separate. Do not promise portfolio 61/61 under this bounded scope.
- Repeated builds were previously used to chase unrelated gates → no new build task; preserve immutable publication and source receipts, no automatic CI dispatch.
- Fault scenarios could damage real services or user data → disposable profile/workspaces, owned fixture paths and unreachable diagnostic endpoints only. No takeover, deletion or token disclosure.
- Protected private coverage driver is unavailable → keep qualification pending; no new privileged product interface purely for evidence.

## Migration Plan

There is no application migration. New records live in this change's `evidence/` directory as uniquely named append-only JSON/Markdown files. Approved amendments quote the original requirement and identify its original file/hash; do not overwrite that text or its receipts. Owning changes receive a linked reconciliation sidecar only after approval. Task/status changes are separately recorded approved ledger transitions; no checkbox changes arise merely from creating these records. Archival uses `openspec archive <original-change> --skip-specs --yes` only after its retained criteria and any required acceptance are actually satisfied; archival relocates the change, so it is distinct from preserving immutable file contents. Never edit generated KBD projections to achieve this. The closed KBD phase is not reactivated. Rollback is withdrawal of proposed dispositions; original evidence remains available. Any separately approved production correction requires its own release provenance.
