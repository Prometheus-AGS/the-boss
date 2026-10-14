# UAR team planning in The Boss

## Why

UAR has immutable TeamDefinition documents but no durable team instance or task board visible in The Boss. A customer cannot create or inspect a team plan through the installed application.

## What changes

Expose UAR's C09.1 planning API through The Boss's trusted main-process adapter and typed IPC. Add a Teams page within UAR settings to select an installed immutable definition, create a workspace-scoped team instance, add tasks with dependencies and input/output contracts, and inspect the saved board after restart. Package the exact local UAR source in the Mac ARM64 application.

This increment is planning only. Claiming, delegation, agent turns, budgets and aggregate authority remain C09.2–C09.3 work. The Boss never becomes the board's persistence authority.

## Owners and boundary

UAR worktree `/Users/gqadonis/Projects/prometheus/worktrees/agent-fabric-c09-uar` owns the API and durable state under its linked product change. The Boss runtime owner owns `src/main/ai/runtime/uar`, `src/shared/types`, `src/shared/ipc/schemas/prometheus.ts`, `src/main/ipc/handlers/prometheus.ts`, and `build/local-uar-source.json`. The Boss renderer owner owns `UarAdministrationWorkspace.tsx`, a new `UarTeamsPanel.tsx`, settings search, and every locale catalog. Build and functional operation happen once after production wiring.

## Outcome

An installed Mac application can create a team plan from an exact installed definition, add two dependent tasks, restart UAR and the app, and read the same isolated workspace board. The build receipt identifies the packaged UAR revision and application artifact.
