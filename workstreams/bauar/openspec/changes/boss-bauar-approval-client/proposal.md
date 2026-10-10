# Proposal: Exact UAR approval client identity

## Why

The Boss UAR controller can still send a run-only approval when an event lacks approvalId. Its pending lifecycle projection also drops that identity. The approved strict cutover requires owned clients to retain the exact originating approval identity before UAR enforces it.

## What Changes

- **BREAKING**: reject unsupported approval events missing a nonempty approvalId before presenting or recording a decision; never synthesize authority from the tool-call or run ID.
- Require every controller decision to submit the originating approval_id, including rejection when no user response is available.
- Retain the raw approval identity in the owner-scoped pending lifecycle projection without conflating it with admission or invocation IDs.
- Preserve existing host claim-before-effect, cancellation and unknown-outcome behavior. Author real-boundary scenarios with production changes; defer execution to the parent's complete production boundary.
- Correct the inherited inventory: administration allowlist entries describe capabilities; no generic approval forwarding implementation was found. Do not add an administrative sender.

## Capabilities

### New Capabilities

- `uar-exact-approval-client`: Required UAR approval identity from originating event through host decision and pending lifecycle inspection, with explicit strict-cutover compatibility.

### Modified Capabilities

None in this newly isolated child root. Existing product source contracts remain authoritative; this delta narrows parent bauar-02-execution-authorization.

## Impact

Proposed production paths are UarToolApprovalController.ts and uarApprovalLifecycle.ts under src/main/ai/runtime/uar, plus src/shared/types/prometheusIntegration.ts for the directly consumed inspection type. Existing runtime-neutral request/response types already require an approvalId and remain unchanged. The Boss host bridge/admission remain preservation surfaces. Exact claims, parent task mapping, read-only references and scenario path are enumerated in design.md.

Product root: /Users/gqadonis/.claude/worktrees/bauar-boss. Accepted baseline supplied by driver: e2ae2ce21245030293c0bea96ed02ae853b820a7. Child UUID: 1778473f-37c3-4dff-af17-e967c84499e2. No dependencies, services, configured application servers, credential stores, UI redesign or parent shipping gates change.
