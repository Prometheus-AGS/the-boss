## Context

See proposal.md for motivation. The current product has one application-owned `UarSidecarService`, a durable generic runtime resume-token column, a dedicated `/settings/uar` administration workspace, typed Prometheus IPC, and requested/applied/effective port reporting. External SurrealDB is supported, but UAR execution always resolves through the packaged singleton. C04 must add replaceable placement without duplicating lifecycle authority or the settings surface. The accepted C02 host authority remains the effect boundary.

## Goals / Non-Goals

**Goals:**

- Add one persisted, revisioned runtime-instance inventory and one default for new UAR sessions.
- Preserve exact instance and native-session identity across reconnection and restart.
- Verify identity and compatibility before releasing provider credentials or work.
- Extend existing UAR status, administration, IPC, and search surfaces.

**Non-Goals:**

- Live-session migration, remote process lifecycle management, or distributed service discovery.
- Moving provider credentials into portable instance definitions.
- Replacing the generic agent-session runtime state machine or the C02 host authority.

## Decisions

### Store placement with the existing UAR integration feature

Extend the revisioned UAR integration document with instance definitions and the selected default. The built-in managed instance is represented in the same inventory and derives its effective runtime endpoint from the sidecar readiness result. This keeps stale-write protection and requested-versus-applied semantics in one authority. A parallel preference or UI-local store was rejected because it could disagree with runtime dispatch.

### Keep one supervisor with ownership-specific handles

`UarSidecarService` remains the only lifecycle supervisor. It returns a verified endpoint handle for either the managed child or an external connection. Managed handles retain process ownership and preferred-port behavior. External handles contain no child process and lifecycle operations refuse them. Every operation uses that exact handle for its complete request sequence. A second external connection service was rejected because it would split endpoint generation, authentication, and shutdown authority.

### Verify a public instance descriptor before run preparation

Capability negotiation returns a stable instance descriptor containing identity, profile, version, workspace locality, ownership, nullable endpoint roles, opaque references, placement support, and capabilities. The supervisor authenticates and compares that descriptor with the persisted binding before returning a handle. Runtime connection startup resolves this handle before model assignment or provider credential resolution. Trusting configured identity or checking after run creation was rejected because either permits credential disclosure to the wrong endpoint.

### Encode placement in the existing opaque resume token

Use a versioned opaque token containing instance id, native UAR session id, and the optional binding id/revision returned by run admission. Legacy UAR tokens are interpreted as managed-instance bindings for compatibility. The generic runtime service continues to persist and hydrate the token; UAR alone owns its structure. This avoids a database migration and keeps other runtime drivers unchanged.

Run admission sends the selected expectations in `service_placement` and accepts only a matching `effective_service_binding`. This keeps The Boss configuration, the verified service descriptor, and UAR's durable binding in explicit agreement.

### Separate placement from migration

New sessions resolve the current default once. Reattachment resolves only the token's instance and native identity. A changed default affects only unbound sessions. Migration is represented as an explicit unsupported result rather than a fallback. Reusing the current default after a failure was rejected because it can duplicate external effects and lose runtime history.

### Extend the existing administration workspace

Add an instance-management panel and effective-binding diagnostics to `/settings/uar`; reuse the existing Prometheus IPC boundary, responsive internal navigation, status components, and localization scheme. The inventory exposes secret presence and references only. Creating a second UAR settings route was rejected because it would fragment runtime authority and navigation.

## Risks / Trade-offs

- **Legacy managed runtime lacks a stable descriptor** → the coordinated UAR C04 change must expose the descriptor before this consumer is released; incompatibility remains visible rather than bypassed.
- **External instance disappears while sessions are bound** → preserve the binding and refuse reattachment with recovery guidance; never spawn a managed fallback.
- **Managed effective port differs from its configured role endpoint** → project the readiness endpoint as effective state while preserving 1906 as the requested preference.
- **Runtime and administration authorities have different trust scopes** → store separate runtime-bearer and administration-key values per stable instance id in OS-protected integration secret storage, expose only opaque references and presence, and migrate the prior single secret only to the runtime bearer.
- **Resume tokens become structured** → use a version marker and accept the prior UAR session-id token only as a managed binding.

## Migration Plan

Existing installations receive a built-in `managed-local` inventory entry selected by default. Existing UAR resume tokens bind to that managed instance. Inventory mutations use expected revision and protected per-instance credential staging. Rollback preserves the existing storage and port fields; structured resume tokens remain opaque strings to older hosts but cannot be safely reattached there, so release rollback requires starting a new UAR turn rather than migrating a live run.
