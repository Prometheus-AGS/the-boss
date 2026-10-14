# C09.2: Team ownership and mailbox administration

## Why

The installed Teams page can plan tasks, but cannot assign a member or inspect communication. UAR now needs one trusted, workspace-scoped administration path for claims and inbox receipts.

## What changes

- Extend the fixed main-process UAR adapter and typed IPC with claim, reassign, reviewer and inbox operations.
- Display task state, owner, ownership epoch and reviewer; send addressed `queue-only` or `trigger-turn` messages and show accepted/delivered/processed status.
- Translate all controls, results and errors in every shipped locale. Package the matching UAR sidecar.

## Boundary

The Boss never owns task state or accepts a renderer-selected URL. A trigger-turn action records intent only until C09.3 runtime admission. This increment has no Start Agent control.
