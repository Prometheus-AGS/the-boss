# Delivery design

Reuse the existing UAR team kernel and trusted main-process boundary. UAR owns durable team state and scheduling; Work renders catalog bindings, member/task activity and supported commands. Create presets through validated package registration and workspace-scoped binding, preserving immutable definitions and credential-free portable documents. Existing authority supplies approvals. The Work UI never receives launch credentials or executes tools.

## Ownership
- teams_runtime / boss-runtime: main UAR adapters, team IPC/preload and shared DTOs.
- teams_work_ui / boss-renderer: Work UI, navigation and renderer translations.
- teams_operation: portable completed-delivery operation runner and real packaged UI procedure in initiative scripts/c14-operation.
- Lead: OpenSpec, canonical KBD, cadence scope and build/publication writer.

## Boundary
Complete all production wiring before pnpm build:mac:arm64, launch and operate the newly delivered function through normal packaged execution. No intermediate test suites, compiler or review loops. The existing C09 qualified profile must be used without experimental environment promotion. Any missing normal-profile capability is an implementation gap, not evidence granted by this plan.
