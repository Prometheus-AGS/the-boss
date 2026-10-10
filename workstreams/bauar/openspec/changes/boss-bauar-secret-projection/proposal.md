# Proposal: Run-owned secret projection

## Why

The Boss currently redacts selected run HTTP errors, while tool outputs, adapter errors and MCP tracing follow earlier ordinary-output paths. Parent bauar-04 requires known run-held credentials to be removed before those paths reach logs, persisted events or model input.

## What Changes

- Capture a finite, explicit set of known transport-private values for one UAR run without adding a secret store or shared registry.
- Project those exact values out of host tool results, per-call errors/traces, UAR event content and model-bound host history before ordinary consumers see them.
- Preserve actual transport credentials, exact approval identities, effect claims, cancellation and opaque protocol control fields.
- Report only non-secret projection indication and scoped canary evidence. Encoded/transformed secrets, unrelated application credentials and universal DLP are outside this child.
- Keep application MCP configuration/custody unchanged. UAR runtime preset removal belongs to its separate owner and mcp.json claim.

## Capabilities

### New Capabilities

- `uar-run-secret-projection`: Exact known-value projection at The Boss UAR run's ordinary output boundaries.

### Modified Capabilities

None in this nested child root. This is the Boss slice of parent mcp-resource-authority, with UAR retaining its own model/event projection responsibility.

## Impact

The existing B-PROJECTION reservation covers UarRuntimeConnection.ts and UarHostMcpBridge.ts. Source discovery also requires exact extensions for UarAguiAdapter.ts, the approval controller error path, the MCP bridge builder/per-call runtime callback and main-process-only callback types. Design.md lists every proposed file; driver acceptance is required before production. New responsibilities live in small feature modules, with surgical wiring in existing oversized files.

Product root /Users/gqadonis/.claude/worktrees/bauar-boss; accepted base e2ae2ce21245030293c0bea96ed02ae853b820a7; child UUID 1778473f-37c3-4dff-af17-e967c84499e2. This documents parent backend 04/4 production and 04/9–10 deferred acceptance only. No application defaults, receivers, IdP, custody, dependency, service or UI change is introduced.
