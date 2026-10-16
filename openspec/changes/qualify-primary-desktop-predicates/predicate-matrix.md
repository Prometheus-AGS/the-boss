# All 66 remaining Boss predicate rows

Planning snapshot: 2026-10-14. Original task text and line references are preserved in [predicate-map.json](predicate-map.json). No old checkbox, qualification marker or generated KBD file changed.

A row may contain several clauses; these are **primary next-action categories, not atomic requirement counts or certification credits**. Source/customer behavior matters on both selected platforms unless noted; explicit Windows rows require Windows x64 only, not another Mac operation. Deferred halves of mixed rows remain unqualified.

| Primary next action | Rows | Meaning |
|---|---:|---|
| E: evidence/artifact reconciliation | 22 | Primary action: existing source/operation/build reconciliation or missing independent review. Some clauses may require a contingent operation. |
| S: explicit historical plan amendment | 24 | Obsolete procedure or different architecture. Customer intent stays; missing substantive clauses may still require an operation. |
| O: potentially missing current operation | 19 | Select only unproved/invalidated clauses after evidence mapping; overlapping rows share one operation. |
| D: deferred optional gate | 1 | All-six-specialist qualification; remains pending. |
| **Total original rows** | **66** | Does not replace 61 original portfolio tasks or 20 changes. |

Rows E/S can contain a contingent operation. These totals do not say that only nineteen rows contain operational clauses. Complete candidate-specific receipt applicability is pending the planned evidence pass. Explicit Windows-only rows: 001 5.4, 002 4.3, 003 6.4, 004 4.3 and 005 4.4.

## Per-change mapping

### prometheus-001-skills-bundling — 15 remaining rows

Original checklist: [tasks](../prometheus-001-skills-bundling/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 1.1 | E | Mini submodule and closed-set location | Record existing gitlink and package consumer; no clone. | P |
| 1.2 | E | Released source pin | Record mini 52a84e7d, version 1.12.1 from frozen manifests. | P, R |
| 1.3 | S | OpenSpec fork submodule | Current app consumes locked upstream Fission-AI npm 1.14.0, not the Prometheus fork. Recommend accepting this distribution explicitly; fork requirement otherwise remains pending. | O |
| 1.4 | S | OpenSpec consumer paths | Document the real shim → packaged JS consumer. Do not claim fork consumption. | O |
| 2.1 | S | Skill synchronization contract | Retire unit-first prescription only. Keep copy/exclusion/currentness outcomes; inspect retained source and receipts before any missing real-path operation. | S |
| 2.2 | E | Synchronization and CI wiring | Equivalent implementation is sync-prometheus-skills.ts and skills:sync:prometheus scripts; reconcile names. | S |
| 2.3 | E | Materialized skill inventory | Use existing 101 mini + 7 Compass inventory; historical 22 remains historical. Do not resync unchanged payload. | P, S |
| 3.0 | S | Complete writable pack and doctor entrypoint | Retire test-first instruction; installed files exist. Only absent writable-root doctor execution evidence joins Q1. | P, D |
| 3.1b | E | Whole-pack startup installation | Record existing runtime-copy source and actual payload; startup behavior beyond physical inclusion is Q1. | P |
| 4.1 | S | Namespace collision protection | Retire test-first prescription, preserve refusal of a conflicting namespace. If no applicable receipt, operate it once in Q1. | S |
| 4.2 | E | Prometheus namespace | Source already supplies namespace; Cherry keeps its default. | S |
| 5.1 | S | Historical unit-suite command | Replace procedure with source/evidence inspection and missing production operations; no unit suite. | S |
| 5.2 | S | Historical lint command | No source edits planned; do not rerun broad write-capable lint to refresh a checkbox. Preserve historical outcomes. | R |
| 5.3 | O | Installed skills and Claude mirror | Q1: fresh/upgrade profile registration, mirror, unchanged-launch behavior and user-owned preservation only where unproven. | S, P |
| 5.4 | O | Native Windows skill installation | Q1 on Windows x64. Fix dangling original reference 4.3 through an approved amendment to 5.3; no Windows ARM64. | S, R |

### prometheus-002-binary-shipping — 9 remaining rows

Original checklist: [tasks](../prometheus-002-binary-shipping/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 1.1 | S | Release provenance for all five targets | Selected two-platform payload evidence already exists. Amend archive-layout requirement; keep other platform clauses deferred. No asset-list polling. | B, R |
| 2.1 | S | Compass importer | Current integration manifest/importer uses pinned raw binaries, not TOOLS tar stripping. Reconcile equivalent hash/consumer boundary. | B |
| 2.2 | S | Filesystem importer | Same manifest reconciliation, preserving genuine source and hashes. | B |
| 2.3 | S | Download and verify three architectures | Reuse existing Mac ARM64/Windows x64 artifacts; do not redownload. Windows ARM64 remains deferred. | B, R |
| 3.1 | S | Bundled resolution and missing binary | Retire test-first instruction. Bundled path/default are source evidence; missing-binary usable failure is Q4 if unproven. | B, M |
| 3.2 | E | Stdio and read-only defaults | Record actual workspace registration and filesystem allowWrite:false; live connection is Q3. | M |
| 4.1 | S | Unit and lint procedure | No repeated suite or lint for frozen source. | R |
| 4.2 | E | Packaged native binaries | Reuse physical installed/published-package inventory; no build:unpack. | B, R |
| 4.3 | O | Native Windows executable startup | Q3 Windows x64 .exe/startup. Windows ARM64 half remains deferred. | B, M, R |

### prometheus-003-settings-and-doctor — 2 remaining rows

Original checklist: [tasks](../prometheus-003-settings-and-doctor/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 6.2 | O | Settings and doctor states | Q2 only unproved degraded/running/cancel/failure/repair states. Already-passed full-pack refusal is excluded. Doctor currently buffers stdout: do not assert progressive partial-result streaming. | D, G |
| 6.4 | O | Native Windows settings states | Q2 Windows x64, combined with other native operations; no second session solely for this row. | D, R |

### prometheus-004-docker-services — 8 remaining rows

Original checklist: [tasks](../prometheus-004-docker-services/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 1.1 | E | Shipped service scripts | Files physically present; obsolete stop-until-mini-lands instruction needs no operation. | P |
| 2.1 | S | Degraded dependency failure contract | Retire test-first instruction; missing-script/spawn-failure/absent/down feedback still matters. Only unproved approved clauses enter Q2. | V, G |
| 2.2 | E | Production services status entrypoint | Current service runner uses the installed Node entrypoint and configured endpoints. | V |
| 3.1 | S | Stored Docker consent | Stored preference is absent. Recommend explicit owned Start/Restart as consent; requires approval, not a passed implementation claim. | V |
| 3.2 | S | Consent-gated lifecycle controls | Current controls are explicit and no startup managed-service action was observed. Preserve no unapproved lifecycle/no external takeover; amend stored-consent requirement explicitly. | V |
| 4.1 | S | Unit and lint procedure | No repeated unit/lint gate on unchanged source. | R |
| 4.2 | O | Absent/down/startup service feedback | Q2 only missing absent/down/all-services-unavailable startup outcomes. Retain existing managed lifecycle/external-preservation evidence; no repeat of passing Gate B. | V, G |
| 4.3 | O | Native Windows service connections | Q2 Windows x64 selected loopback endpoints; source audit no WSL. Fixed ports are superseded by configured endpoints. | V, R |

### prometheus-005-mcp-server-presets — 10 remaining rows

Original checklist: [tasks](../prometheus-005-mcp-server-presets/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 1.1 | E | Available native payloads | Compass/filesystem present. Optional unbundled and unadvertised sycophancy server explicitly deferred, not passed. | B |
| 2.1 | S | Fixed builtin name union | Prometheus names are not in original union: recommend current settings-visible workspace-managed records as the contract. | M |
| 2.2 | S | Static preset registry | Original PRESET entries absent; equivalent managed-workspace architecture requires explicit amendment. | M |
| 2.3 | S | Transport/write/activation defaults | Retire test-first. Preserve stdio and write approval. Current configured records may be active; all-inactive is not implemented and must be amended explicitly. | M |
| 3.1 | S | Seeder and user-field preservation | Current workspace upsert is not the original hashed seeder. Approve ownership-separated managed records; preserve user-owned records, no false seeder credit. | M |
| 3.2 | S | Preset descriptions and locales | Four fixed preset descriptions do not exist; current workspace/settings labels do. Amend prescribed surface, retain usable localized explanations. | M |
| 4.1 | S | Unit and lint procedure | No repeated targeted suites or lint. | R |
| 4.2 | O | Advertised server discovery/connect/tool lists | Q3 available Compass/filesystem/shared-memory records only, where missing. Optional sycophancy preset remains deferred. | M, G |
| 4.3 | O | Missing binary failure | Q4 jointly covers binary-shipping 3.1. Use an owned missing-path fixture, never remove installed user binaries. | B, M |
| 4.4 | O | Native Windows stdio resolution | Q3 Windows x64 two available .exe servers; third unbundled server deferred. | B, M, R |

### uar-c09-team-execution-admin — 10 remaining rows

Original checklist: [tasks](../uar-c09-team-execution-admin/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| ordinal-5 | E | Packaged team operation receipts | Map Gate A, 14 staged Gate B cases and two public cases separately. Changed admission seams alone may join Q5. | A, TTB, BP |
| ordinal-6 | O | Installed team UX and old build gate | Build clause reuses R38; only unresolved current UI/control applicability joins Q5. No rebuild. | A, BP, R |
| ordinal-7 | E | Independent increment review | One artifact/source review packet with practical preset task 4; no operation merely because review was missing. | A, TTB, BP |
| A1–A3 | E | Runtime contract consumption | Existing model/profile/ownership adapters; privileged takeover qualification deferred. | A |
| A4 | O | Exact settings/rebind and privileged reclaim | Source reconciliation first. Only current unproved read/save/rebind joins Q5; privileged replacement matrix deferred. | A |
| A5 | O | Effective settings and accessible errors | Source/locales evidence first; unresolved current effective values/refusal/keyboard controls join Q5. No theme/locale sweep. | A |
| A6 | O | Pins, Gate A and ownership outcomes | Build/pins are evidence-only. Changed current authority/control cases join Q5 only if old evidence inapplicable; exhaustive reclaim deferred. | A, R |
| B1–B3 | E | Communication and continuation contracts | Implemented contracts and retained actual operations; no new scheduler/source rewrite. | TB, BP |
| B4 | E | Roster/messages/waits/context visibility | Retain actual visibility/source evidence; only an invalidated clause joins Q5. Delivery is not task completion. | BP, T |
| B5 | O | Team controls and extended fault matrix | Retain 14 staged cases and public subset. Q5 current cancellation/isolation/authority gaps only; exhaustive cycles/reassignment/crash matrix deferred. | TB, BP |

### uar-c10-workflow-decisions — 6 remaining rows

Original checklist: [tasks](../uar-c10-workflow-decisions/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 1.1 | E | Workflow DTO and scoped adapter | Compare source/wire shapes against retained actual operation. No new API. | W |
| 1.2 | E | Typed IPC in the package | Actual prior operation traversed IPC; reconcile source applicability. | W |
| 2.1 | O | Internal workflow decision/cancellation/recovery | Retain classify/draft/exact decision. Q6 only uncovered stale/revoked decision, cancel and retained recovery; GitHub #63 not a substitute. | W |
| 2.2 | O | Accessible workflow controls | Locales/source evidence first. Keyboard reachability in Q6 if unproven; old lint/theme sweep superseded, not fabricated as passed. | W |
| 3.1 | S | Historical lint/build instruction | Reuse completed R38 build; retain historical failed lint. No build or lint to refresh age. | R, W |
| 3.2 | O | Restored wait, control and truthful accounting | Retained wait/decision/accounting evidence; remaining controls jointly covered by Q6, no second workflow run for this row. | W |

### c15-reviewed-skill-coverage — 4 remaining rows

Original checklist: [tasks](../c15-reviewed-skill-coverage/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 1.1 | E | Complete closures and distribution | Retained required core/full-mini source/distribution evidence. No fresh installation solely for freshness. | S15 |
| 1.2 | O | Private trusted binding coverage | Q7 only forged/missing private coverage preflight if existing trusted host context exposes it. Driver seam is absent; never add renderer authority to qualify. Otherwise explicitly pending. | S15 |
| 1.3 | E | Host scope and selector statuses | Retain actual catalog/tamper/tool-scope refusals and source; include changed visibility only if evidence invalidated. | S15 |
| 1.4 | E | Pins/build/operate/publication | Release clauses reuse existing receipts. Full private preflight remains separately pending; no rebuild/publication. | S15, R |

### c16-practical-team-presets — 1 remaining rows

Original checklist: [tasks](../c16-practical-team-presets/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 4 | E | Missing independent artifact review | Five presets and twelve real artifacts already operated/assessed. Obtain distinct reviewer assessment of retained artifacts once; do not rerun inference/build. | P16 |

### c16-specialist-team-authoring — 1 remaining rows

Original checklist: [tasks](../c16-specialist-team-authoring/tasks.md).

| Task | Primary | What matters on Mac ARM64 / Windows x64 | Finish without repetition | Evidence/source keys |
|---|---|---|---|---|
| 5 | D | Full six-specialist qualification | Optional wider specialist matrix; accepted product/design/reviewer evidence does not prove all six. Keep complete gate pending outside primary desktop closure. | T |

## Evidence and source key

Boss source references below identify inspected implementations; source presence alone does not certify operation. Historical positive receipts require clause-level applicability review. Paths beginning with the initiative root resolve to the consolidated LibreFang checkout, not deleted worktrees.

| Key | Source / receipt | What it establishes and limits |
|---|---|---|
| P | Boss scripts/package-prometheus.js, src/main/utils/prometheusPack.ts, electron-builder.yml; current installed inventory | Whole payload inclusion; 101 mini + 7 Compass skills. Not fresh-profile behavior. |
| S | Boss scripts/sync-prometheus-skills.ts, src/main/utils/builtinSkills.ts, src/main/ai/skills/SkillService.ts | Current namespace, sync and registry contracts. Not all collision/fault outcomes. |
| O | Boss src/main/services/prometheus/miniCommands.ts; pinned mini package/package-lock | OpenSpec shim and upstream npm 1.14.0 dependency closure; not original Prometheus fork. |
| B | Boss build/integration-artifacts.json, scripts/integration-binaries.js, scripts/before-pack.js, src/main/utils/binaryResolver.ts | Native payload provenance and importer. Not native Windows process operation. |
| M | Boss src/main/services/prometheus/workspaceMcp.ts, src/shared/types/prometheusIntegration.ts | Workspace-managed MCP records, transports and defaults; not four static presets. |
| D | Boss src/main/services/prometheus/prometheusDoctor.ts, PrometheusSkillPushService.ts, pushSkills.ts, ownedSkillCopy.ts | Doctor/push behavior; current stdout buffering does not prove progressive partial results. |
| V | Boss src/main/services/prometheus/managedServices.ts, PrometheusIntegrationService.ts, integrationConfig.ts; ServicesSettings.tsx | Explicit lifecycle/configuration and ownership. Stored Docker consent absent. |
| R | [2.2.38 operation](../../../build/release-operation-2.2.38/operation.json), [publication](../../../build/release-operation-2.2.38/publication.json), [local artifact](../../../build/release-operation-2.2.38/local-artifact.json) | Frozen release build, Mac affected prompt/restart and two-platform publication. No broad tools/fault or native Windows operation. |
| G | mini .kbd-orchestrator/phases/the-boss-shipping-and-settings/children/uar-working-agent/children/integration-administration/evidence/task-3.5-gate-b.md and gate-b.json | Sept25 real managed Docker lifecycle, external preservation, workspace/log/cancellation cases; not every current Docker/SDK state. |
| A | Initiative openspec/changes/archive/2026-10-14-afc-c09-bounded-teams-and-shared-task-board/c09-3-evidence.md | Original staged Gate A at Boss b83e128b / UAR 49765c56. |
| TB | Same initiative archive, c09-4-gate-b-receipt.json | Fourteen actual staged Gate B cases. Distinct from binary source key B. |
| BP | Same initiative archive, c09-4-public-qualified-receipt.json | Two public-profile cases, Boss 102d7df7 / UAR afeb528b. |
| W | Initiative c10-substrate-operation-receipt-20261005.md | Classify/draft/isolation/restart wait/idempotent exact decision; controls explicitly incomplete. |
| S15 | Initiative receipts/customer-required-reviewed-skill-core-2.2.27-20261010.json | Required core and refusals passed; coverageComplete:false. |
| P16 | Initiative receipts/c16-practical-team-presets-20261008.json | Five presets/twelve artifacts; root assessment, distinct independent review still missing. |
| T | Initiative receipts/integrated-reusable-team-core-passed-20261011.json | Product/designer/reviewer, immutable revision and reopening; not all-six-specialist gate. |

Initiative root: /Users/gqadonis/Projects/references/librefang/docs/plans/agent-fabric-convergence.

The [design](design.md) defines Q1–Q7, amendment choices and the conditions under which an operation leaves the queue.
