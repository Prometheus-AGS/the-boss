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
