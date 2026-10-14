# Design

## Context

Both initialization and snapshot enumeration call workspaceIdentity through loadWorkspaceState. A missing directory rejects the entire service initialization, which is retained as a rejected promise. The restored empty temporary directory was a workaround in 2.2.37, not a durable repair.

## Goals / Non-Goals

Keep valid service settings operational when an unrelated registered directory disappears. Preserve referenced workspaces, sessions, filesystem isolation and execution path validation. Do not recreate missing folders, invent fallback identities, automatically purge records, or reopen the closed convergence phase.

## Decisions

Catch only the observed ENOENT at inventory loading. Exclude that workspace from integration projections and discard its stale in-memory projection. Keep other errors visible and leave workspaceIdentity strict for execution. A missing directory does not confer access to its parent or change a run's identity.

Use the existing workspace deletion impact preview for the known disposable configuration. Preserve historical qualification evidence independently of local configuration cleanup.

Use supported OpenSpec archive commands for completed changes. Keep legacy incomplete checklists explicit in a reconciliation register rather than checking off unearned operations. Historical 61/61 code tasks, 20/20 changes and 43/61 terminal qualification records remain unchanged.

## Risks / Trade-offs

- Missing registered workspaces remain in the general workspace catalog until explicitly removed; they cannot authorize execution.
- Archived receipts retain their original candidate and source provenance. Archive placement is administrative and does not grant Windows acceptance or broader qualification.

## Migration Plan

No database migration. Restore the prior service file to roll back the code repair; restore configuration from the existing preservation archive if needed. Validate the completed repair at the real application boundary with a missing registered directory, then run the documentation gate once.
