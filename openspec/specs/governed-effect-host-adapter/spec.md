# governed-effect-host-adapter Specification

## Purpose
TBD - created by archiving change afc-c02-governed-effect-host-adapter. Update Purpose after archive.

## Requirements

### Requirement: Host admission binds exact authority

The Boss SHALL validate the additive UAR authority envelope and SHALL bind preparation, resolution, claim, and managed MCP dispatch to the exact `authorityRevision` and canonical payload digest.

#### Scenario: Payload changes after approval

- **WHEN** a managed MCP call carries arguments or an authority revision different from its prepared admission
- **THEN** The Boss invalidates the admission and does not forward the effect

### Requirement: Claim revalidation is asynchronous and fail closed

The private `/uar/admission/v1/claim` operation SHALL revalidate the selected provider immediately before UAR claim and SHALL return the unchanged bound receipt only on permit.

#### Scenario: Selected provider is unavailable

- **WHEN** claim revalidation cannot obtain a valid provider decision
- **THEN** The Boss returns a non-success response and the effect remains unclaimed

### Requirement: Host authority facts come from trusted state

The Boss SHALL derive verified principal, workspace, host policy, and approval facts from its active session and protected configuration. It SHALL NOT use UAR-supplied identity fields as verified authority.

#### Scenario: UAR sends another agent principal

- **WHEN** an invocation owner or agent principal differs from the owner and agent The Boss bound to the active bridge
- **THEN** preparation is rejected before an authority provider is called

### Requirement: Provider selection preserves ownership

The Boss SHALL provide local and Flint Gate authority adapters through the same evaluate, decide, and revalidate contract while UAR remains the effect executor and lifecycle owner.

#### Scenario: Local authority remains selected

- **WHEN** no external authority provider is configured
- **THEN** current auto, ask, deny, and human-approval behavior remains available through the local provider

#### Scenario: Gate requires an unverifiable fact

- **WHEN** the Gate request requires a lease, budget, grant, policy, or identity fact that The Boss cannot verify from trusted state
- **THEN** The Boss refuses the governed request rather than inventing or forwarding unverified proof

### Requirement: External authority credentials remain protected

The Flint Gate endpoint SHALL be configured without embedded credentials and its credential SHALL remain in OS-protected main-process storage. Ordinary configuration snapshots, lifecycle evidence, receipts, and logs SHALL NOT expose the credential.

#### Scenario: Renderer reads integration settings

- **WHEN** The Boss returns the integration snapshot
- **THEN** it contains provider selection, endpoint, and credential presence but not the credential value
