# Design

## Context and ownership

This is the Boss implementation of the approved C09.3 runtime increment. The main process resolves workspace selectors through the existing store, binds requests to the selected sidecar generation, and calls fixed owner/workspace-scoped REST paths. Results are parsed and checked against the returned team's owner, workspace and team identity before reaching renderer IPC.

## Interaction

Retain the incumbent Teams planning board and mailbox. Add execution as its own settings group. Assignment is explicitly not an executable grant. Ready assigned tasks show editable token/cost/time reservations initialized from the authoritative execution summary's effective remaining budget. Only selected artifacts from this team enter context. Display runtime-returned attempt status, executionOutcome separately from uncertain accounting, reservations, actual usage and output. Three-second refresh uses the existing polling pattern; failed commands retain their entered values and actionable refresh guidance.

Cancellation, recovery and revocation require an operator reason. Revocation explains its permanent membership effect; cancellation and recovery show accepted command state and the next authoritative snapshot. Native shared components, visible focus, associated labels, semantic feedback and translation-safe wrapping preserve DESIGN.md and the Operate surface mode. The project prometheus-ui-ux and portable Impeccable context were loaded; builder inspection is not independent acceptance.

## Model setup

The starter team can retain a planning binding or select an exact live UAR provider/model or gateway alias. Main rechecks the catalog and generation. A gateway choice resolves only an enabled exact configured alias and provider connection, passes its canonical provider/model as pricing_identity to UAR, and creates a distinct alias-scoped UAR provider using the existing protected liter credential and a separate v3 model-keyed starter binding. Credentials never enter renderer output or logs. No existing planning or user-configured provider/binding is overwritten. The private provider identity includes endpoint, alias and exact canonical pricing identity; absent mappings and explicitly unpriced catalog identities produce translated price-unavailable guidance, never zero-cost inference. The fixed member's declared local-default alias maps to the selected exact provider/model with a protected credential reference.

## Verification boundary

Implementation finishes before any tests, lint, build or review. The lead owns one packaged production-flow gate, the macOS ARM64 build and the actual installed-app checks. Passing TypeScript, catalog checks or generated files alone is not execution evidence. Runtime isolation, stale-command fencing, completed replies, usage uncertainty, cancellation, restart recovery and revocation must be observed at that boundary.

## Instruction precedence

The older OpenSpec config suggests Signed-off-by and broad/per-file test loops. Current project A-9/A-15 and the explicit task instructions supersede those examples. The openspec-propose skill's generic planning-only stop does not override this session's explicit authorized implementation. No publication, human certification or independent review is claimed here.
