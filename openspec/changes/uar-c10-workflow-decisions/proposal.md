## Why

The approved C10.1 contract needs an operator-visible path from bounded feedback to a durable internal draft decision. Boss must expose UAR's pinned workflow state without becoming a second executor or external issue writer.

## What Changes

- Add typed workflow list, start, inspect, decision, cancel and recovery IPC over the existing authenticated UAR sidecar.
- Add accessible workflow controls inside Teams, retaining exact draft and wait identities and displaying accounting uncertainty separately.
- Localize every new product string and include the feature through the existing main/renderer packaging graph.

## Capabilities

### New Capabilities
- `uar-workflow-decisions`: scoped UAR workflow administration and explicit internal draft decisions in Teams.

### Modified Capabilities

None.

## Impact

New shared workflow schemas, UAR adapter, typed IPC registration, Teams workflow components and locale strings. UAR owns durable execution and receipts. No dependency changes, database migration, new service, external connector write or independent scheduler. Existing C09 behavior is preserved.
