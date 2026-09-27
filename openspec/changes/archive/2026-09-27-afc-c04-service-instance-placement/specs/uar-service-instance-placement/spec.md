## Purpose

Define how The Boss selects, verifies, supervises, and preserves bindings to replaceable managed or external Universal Agent Runtime instances.

## ADDED Requirements

### Requirement: Versioned runtime instance inventory
The Boss MUST persist a revisioned inventory of UAR instances with stable instance identity, managed or external ownership, runtime, administration, model, and nullable console endpoint roles, execution profile, workspace locality, required capabilities, and separate protected runtime-bearer and administration-key references. Exactly one enabled instance MUST be selected as the default for new sessions.

#### Scenario: Select between compatible instances
- **WHEN** an operator registers two compatible UAR instances and selects one as the default
- **THEN** the inventory revision increases and subsequent new UAR sessions bind to the selected instance.

#### Scenario: Reject stale inventory mutation
- **WHEN** an inventory mutation names a revision older than the current persisted revision
- **THEN** The Boss refuses the mutation without changing the inventory.

### Requirement: Ownership-safe supervision
The Boss MUST use one UAR supervisor authority for both managed and external instances. It MUST start, restart, and stop only application-managed instances and MUST never spawn, restart, or stop an externally owned instance.

#### Scenario: External client closes
- **WHEN** The Boss disconnects from or removes an external UAR instance
- **THEN** the external process continues running and only The Boss-owned connection state is released.

#### Scenario: Managed preferred port is occupied
- **WHEN** the managed UAR starts with preferred port 1906 occupied
- **THEN** the managed runtime selects the next available port, The Boss records the effective endpoint, and ownership remains application-managed.

### Requirement: Compatibility before credentials or work
Before The Boss sends provider credentials, run input, or workspace context, it MUST authenticate the instance and verify the returned stable identity, ownership, supported execution profile, runtime version, endpoint roles, workspace locality, and every required capability against the persisted binding. The runtime bearer and administration key MUST remain distinct and only be sent to their respective request scopes. An incompatible or unavailable selected instance MUST be refused with a specific diagnostic and MUST NOT silently fall back to another instance.

#### Scenario: Wrong runtime identity
- **WHEN** a configured endpoint responds with a different stable instance identity
- **THEN** The Boss marks the binding incompatible and sends no provider credential or run input.

#### Scenario: Required capability is missing
- **WHEN** the selected instance lacks a capability required by its binding
- **THEN** new work is refused with the missing capabilities listed and no alternate runtime is selected.

### Requirement: Durable placement and exact reattachment
The Boss MUST persist the selected instance identity, native UAR session identity, source run identity, and any effective binding id/revision in an opaque versioned resume token. Ordinary run admission MUST use `new`. Reattachment MUST use the UAR resume endpoint with the persisted source run identity and `reattach`, and MUST NOT resend host history. The Boss MUST send the configured placement expectations and verify the returned effective service binding before persisting it. A new session MUST use the current selected default. A resumed session MUST reattach only to its persisted instance and native identity. Changing the default MUST NOT move existing sessions, and runtime migration MUST be an explicit operation that reports unsupported until implemented.

#### Scenario: Default changes after a session starts
- **WHEN** an operator changes the default UAR instance after a session has persisted its binding
- **THEN** the existing session reattaches to its original instance while a new session uses the new default.

#### Scenario: Bound instance is unavailable
- **WHEN** a resumed session's bound instance cannot be verified
- **THEN** The Boss refuses reattachment, preserves the binding for recovery, and does not create a replacement run on the managed instance.

#### Scenario: Migration requested
- **WHEN** an operator requests migration of a bound UAR session to another instance
- **THEN** The Boss reports that live-session migration is unsupported and leaves the binding unchanged.

### Requirement: Observable effective binding
The existing UAR administration workspace MUST expose inventory management, default selection, ownership, endpoint roles, compatibility state, effective session bindings, recovery guidance, and instance diagnostics without creating another settings route. Diagnostics MUST distinguish configured, reachable, authenticated, compatible, and operational states without exposing credentials.

#### Scenario: Inspect effective binding
- **WHEN** an operator opens UAR administration for a configured external instance
- **THEN** The Boss displays its ownership, endpoint roles, expected and observed identity/profile/version/capabilities, compatibility result, and any sessions bound to it.

#### Scenario: Credential remains protected
- **WHEN** inventory and diagnostics are read through renderer IPC
- **THEN** responses expose only runtime and administration credential references and presence states, never either credential value.
