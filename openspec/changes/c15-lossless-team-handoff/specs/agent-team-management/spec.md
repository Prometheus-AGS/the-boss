# Spec Delta

## ADDED Requirements

### Requirement: Structured handoff provenance
A handoff SHALL preserve optional versioned provenance for canonical task identity/revision/status, explicitly selected source and evidence file hashes, Karpathy references and selected scoped memory identities. Missing observations SHALL remain unknown. Capture SHALL not copy source or memory bodies, credentials or execution grants.

#### Scenario: Capture selected working context
- **WHEN** an operator creates a handoff with selected files and existing scoped memory references
- **THEN** the packet preserves their identities, hashes and available receipts alongside task revision, Git HEAD and dirty state without publishing memories or completing canonical work

#### Scenario: Canonical status unavailable
- **WHEN** a linked task lacks a usable explicitly configured canonical reader
- **THEN** its identity remains preserved and the observation is reported as unknown rather than manufactured

### Requirement: Inspect handoff provenance at the destination
Destination inspection SHALL distinguish captured identity from current observations and report selected references as matching, changed, missing or unobserved. Existing packets without structured provenance SHALL remain readable. Ownership SHALL still require explicit acceptance against the original task revision.

#### Scenario: Source changed after capture
- **WHEN** a selected source file changes before destination inspection
- **THEN** inspection identifies the changed reference without silently rewriting the packet or accepting ownership

#### Scenario: Legacy handoff
- **WHEN** a previously stored packet has only string references
- **THEN** the packet remains readable with structured provenance explicitly unavailable

#### Scenario: Task ownership conflict
- **WHEN** ownership or revision changed after capture
- **THEN** existing acceptance refusal remains effective and captured provenance cannot bypass it
