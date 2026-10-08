# Teams in Work

## ADDED Requirements

### Requirement: Work team execution
The application SHALL let an operator select a coding team and workspace, submit a natural-language task and operate it using the packaged normal UAR execution profile without manually seeded records or raw JSON.

#### Scenario: Coding change and handoff
- **WHEN** an operator selects a coding team and workspace and submits a bounded repository change
- **THEN** Work displays members, task status, output, artifacts and the authoritative approval state
- **AND** supported cancellation and durable reopening preserve understandable run identity

### Requirement: Complete delivery boundary
Production UI, translations, runtime wiring and packaged dependencies SHALL be completed before the build-and-operate boundary.

#### Scenario: Local usable delivery
- **WHEN** the implementation is complete
- **THEN** the owner builds Mac ARM64 and operates the newly delivered function through the packaged application
- **AND** no task or acceptance is inferred from dispatch, source inspection or an installer filename
