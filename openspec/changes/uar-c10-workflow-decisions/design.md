## Context

See proposal.md. The approved initiative C10 first-delivery contract selects UAR as workflow owner. The Boss baseline contains authenticated scoped team adapters, a generic typed preload, shared IPC schemas, and Teams settings components. Runtime state and receipts remain durable in UAR. No versions.toml or local CLAUDE override exists in this worktree; package.json pins Node >=24.12 and pnpm 12.6.0.

## Goals / Non-Goals

Goals: exact typed workflow administration through existing IPC; accessible localized operation inside Teams; unchanged ordinary C09 execution.

Non-goals: external issue writes, message delivery, workflow editing, independent model execution, new persistence, new services or dependency changes.

## Decisions

- Reuse /api/v1/collaboration/workflow-definitions and workflow-runs with the existing workspace header and sidecar generation. Main resolves the workspace and validates response scope; renderer never receives credentials or a raw router.
- Derive cross-process types from shared closed input and response schemas. The versioned runtime capability is prometheus.workflow-execution/1.0.0. Operational availability and release qualification are distinct claims.
- A dedicated workflow section within Teams uses existing @cherrystudio/ui controls and semantic tokens. It lists runs independently of the currently selected team, allowing restored waits to be found. Start selects exact matching installed definition and team binding, members by declared role and explicit reservations.
- UAR owns authoritative state. Component state holds form values and snapshots only. Decisions submit the exact displayed wait/artifact/revision; command IDs are retained for retry of the identical operation.
- Read-only run details expose pinned identity, original task/attempt references, current wait/receipt and accounting. Unknown execution stays reconciling; recovery does not imply replay.
- Generic typed preload and existing main/renderer imports include packaging registration; no separate bridge or daemon is added.

## Risks / Trade-offs

- Runtime routes require matching UAR checkpoint → freeze DTOs with the UAR owner before binding; retain unsupported state against old runtimes.
- Receipt mismatch or workspace escape is an actual trust boundary → validate schemas and workspace/team/run identities in main.
- UI source cannot prove accessibility or durability → completed boundary uses the actual packaged Boss with live UAR, keyboard and restart evidence. No unit or mock gate is completion proof.
- English placeholders are insufficient → translate every new key in all shipped renderer locales.

## Migration Plan

Additive source rollout with the matching UAR provider checkpoint. Older runtimes show unavailable support. Rollback removes consumer controls without rewriting durable runs or receipts.
