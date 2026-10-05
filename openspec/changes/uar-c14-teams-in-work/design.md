# Delivery design

Reuse the existing UAR team kernel and trusted main-process boundary. UAR owns durable team state and scheduling; Work renders catalog bindings, member/task activity and supported commands. Create presets through validated package registration and workspace-scoped binding, preserving immutable definitions and credential-free portable documents. Existing authority supplies approvals. The Work UI never receives launch credentials or executes tools.

## Ownership
- teams_runtime / boss-runtime: main UAR adapters, team IPC/preload and shared DTOs.
- teams_work_ui / boss-renderer: Work UI, navigation and renderer translations.
- teams_operation: portable completed-delivery operation runner and real packaged UI procedure in initiative scripts/c14-operation.
- Lead: OpenSpec, canonical KBD, cadence scope and build/publication writer.

## Boundary
Complete all production wiring before pnpm build:mac:arm64, launch and operate the newly delivered function through normal packaged execution. No intermediate test suites, compiler or review loops. The existing C09 qualified profile must be used without experimental environment promotion. Any missing normal-profile capability is an implementation gap, not evidence granted by this plan.

## Observed canonical-extension repair

The packaged Work preset operation returned HTTP 422 after the pricing repair.
The coding preset and installed binding flattened the host extension's fields,
while the published collaboration schema requires `{ required, value }`.
Produce that canonical envelope for both documents and have UAR consume its
payload without weakening schema or workspace/tool authority. Existing malformed
definitions are not silently relabelled or migrated. Repeat the affected packaged
operation after rebuilding the corrected complete delivery; this source repair
does not itself establish runtime acceptance.

## Observed direct-task contract repair

The corrected packaged preset still returned `collaboration_invalid` from
`POST /api/v1/collaboration/packages:preflight`. Its bounded coordinator team
intentionally declares no workflows, but the draft.2 schema required at least
one. Consume the canonical schema repair at UAR `d8896d743cd945d40f918ff8ca397909f6c1fe22`:
coordinator-within-binding permits an empty immutable workflow allow-list;
operator mode retains its nonempty requirement. Workflow execution still
requires an exact allow-list member. Mirror the same strict contract into
the shipped authoring skill; do not invent a workflow or widen tool authority.
Rebuild and operate the actual preset; source acceptance is not runtime evidence.

The shipped mini authoring contract is pinned to `62dc8243f34008e3e73dab48c910e418af7aef12`
(full-pack mirror `34beecdfbda23748cdb4d423e2401aa270ebce3f`).
Both consume the identical strict draft.2 task-acceptance schema and retain
the draft.1 predecessor. This pin updates source payloads; native operation
remains the acceptance authority.

## Observed coding package capability closure repair

Actual packaged Work operation `c14-a9c12098-ff4e-488d-9934-937f36b7ba7a`
still reports HTTP 422 during coding-preset-through-work with native UAR
`d8896d743cd945d40f918ff8ca397909f6c1fe22` and Boss `309af328f075646061d38a30e3ee6df4218a8c7a`.
Its preserved evidence reports the ordinary qualified profile and no pricing
unavailable error. Source identifies a separate producer defect: each coding
AgentDefinition and TeamDefinition requires `team_execution_host_workspace_v1`,
but the package manifest declares only `collaboration_definition_packages_v2`.
UAR `validation/graph.rs` requires every definition-required capability to have
a required manifest declaration and rejects the incomplete closure during package
preflight. Add the existing host capability to `capabilityDeclarations` with
`required: true`; preserve all definition, tool, binding and runtime admission
requirements. No UAR validator change or capability grant is introduced.

This repair is source-only. No worker tests, compiler, builds or review run;
commit and push hooks are suppressed under the lead's approved delivery boundary.
The lead owns the exact candidate freeze, packaged build and failed-operation
rerun. A repaired manifest does not prove later binding or execution succeeds.

## Observed request provenance and member lifecycle repair

The lead reports an actual packaged team created successfully, followed by
`TEAM_SCOPE_DENIED` before any attempt. Native team member slots are initialized
as `inactive`; native task claims and execution admission exclude `revoked` and
`stopped` membership, without requiring membership status `running`. Boss task
submission instead searches for a coordinator with status `running`, and host
invocation verification separately imposes the same unsupported membership
requirement. Match native membership eligibility in both places. Keep the host's
separate running execution attempt, member revision, binding revision, selected
generation, run identity, principal, owner, workspace and role/tool checks.
Membership eligibility itself confers no execution or effect authority.

An observed lost HTTP failure provenance also exposes a separate request-helper
defect: privileged team requests parse JSON before checking HTTP status and
replace every non-`TEAM_*` native error with `TEAM_SCOPE_DENIED`. Handle failed
body parsing without replacing its HTTP failure; preserve method/path/status and
the native structured error code using the existing scoped request error format.
Parse successful JSON normally. This retains genuine team codes for the existing
localized renderer diagnostic mapper. Bare or non-team HTTP 429 must remain an
HTTP 429, without changing quota, adding retries or disguising authorization.

Only the three runtime adapters/services and this factual source plan change.
No worker tests, compiler, builds or review run. The lead owns packaging and the
actual operation rerun; source diagnosis is not completed runtime acceptance.

## Observed native control admission ownership repair

Packaged operation `c14-c82ed87f-b1ca-4c1d-983d-687cde550348` with
Boss `06ab37daa3f289f76a350dbf6728b56c68a28318` and UAR
`0402514acec7b67dbb3c0fa690c8dae0c9ce4253` launched and inferred, but the
coordinator's native roster/delegation requests received host HTTP 422.
The native producer misnames the version-1 governance revision wire field;
the run-wide admission port also routes UAR coordination through the filesystem
host. Align the producer with the established host contract and route explicitly
owned runtime-control handlers through UAR's existing governed admission lifecycle.
Do not classify all built-in tools as runtime controls or widen host filesystem
permissions. Persist ownership for recovery; model input cannot choose it.

Authoritative pending approvals carry `admissionOwner` as `uar-runtime` or
`paired-host`; historical missing ownership defaults to `paired-host`. Boss reads
this value through the trusted main-process UAR request, retaining the current
workspace, team, running-attempt, generation and exact approval/event/cursor checks.
Only paired-host approval acknowledges the host bridge before submitting the
existing UAR decision. Runtime-control approval uses the same UAR decision route
without a nonexistent filesystem-host approval. Neither path auto-approves.

Root owns the two Boss approval adapters. The runtime worker owns native admission,
wire metadata and pending ownership. The operation worker owns exact fixture
approval checks. Finish the complete seam before rebuilding the affected native
payload and Mac application and repeating the failed Work operation. Prior signed
build/launch receipts remain evidence for their actual source, not this repair.

## Observed run-event inspection gap

The complete packaged operation reached an approval the fixture could not safely
classify; a subsequent operation stopped after a roster cursor conflict. Exact
tool inputs were not retained before the isolated sidecar stopped. Native public
SSE already contains those inputs, but subscribing has disconnect cancellation
semantics and its bounded process-local history disappears on shutdown.

UAR provides an owner-scoped, read-only snapshot of that existing history at
`GET /api/uar/runs/{id}/events?after=0`. It adds no subscription, persistence
authority, cursor normalization or execution permission. Retention gaps are
explicit. The Boss exposes only a typed workspace/team/attempt selector through
protected main-process IPC, resolves its run from the authoritative execution
summary, and checks response identity and sequence. Renderer input cannot select
an arbitrary run, URL or credential. The operation driver retains only safe
tool argument classifications, hashes and correlated error codes before exit;
it does not relax approval checks or retain full prompts/transcripts.

Root owns the Boss adapter and pin; runtime owns the native snapshot; operation
owns the scoped driver evidence. Complete all three before the native/Mac build
and failed Work operation rerun. Actual roster input remains unknown; there is
no evidence authorizing a cursor repair yet.

## Observed team-client MCP session ownership repair

Actual packaged operation c14-d52f2b36-99d2-4d2c-b386-60fa6a3e82d8 at Boss cb171a43e055f5777562c4854ff63d0ba3911081/UAR4a28298225f137d713b2db8fbd5e8f78757e19d7 successfully initialized the coordinator filesystem connection, approved delegation and yielded. Worker and continuation then recorded required filesystem ConnectionFailed; neither reported the prior cache-shutdown failure. The installed SDK1.29.0 source rejects a second initialize on an already-initialized stateful transport. The HTTP400 is source-derived, not independently retained native HTTP evidence.

The Boss team bridge must keep a separate stateful SDK server/transport per client session, mapped by exact MCP-Session-Id beneath its existing authenticated mounted route. UarTeamHostService supplies fresh FileSystemServer instances from the captured canonical workspace. Keep the existing bridge token, loopback/host/origin checks, shared authoritative admission port and exact member/run/binding/workspace effect checks. Client deletion closes only its owned session; team/generation teardown closes all sessions. Ordinary single-client bridges retain their existing instance path. UAR4a attempt-owned resources and normal cleanup remain correct. No stateless workaround, new scheduler, approval bypass or mutable workspace reread.

Implementation order: record this repair; implement only UarHostMcpBridge.ts and UarTeamHostService.ts; complete source wiring and scoped formatting; then rebuild the real Mac application and repeat only the failed combined operation. No intermediate suites, compiler or review loops. No new UI strings, persisted fields or migrations are required by this protocol-lifetime repair. Parent canonical task ownership remains unchanged.
