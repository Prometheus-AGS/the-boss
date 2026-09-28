# UAR local delivery

## ADDED Requirements

### Requirement: Packaged durable UAR

The exact Apple Silicon local build SHALL include a C06/C07-capable UAR helper under physical application resources and launch it without a developer path override. Its local-only payload record SHALL bind source, architecture and bytes; public release preflight SHALL reject this record.

#### Scenario: Local Mac build launches its own helper

- **WHEN** the newly built application opens with UAR overrides cleared
- **THEN** it launches the packaged helper and reports its effective port and capabilities.

### Requirement: Workspace-scoped administration

The Boss SHALL expose supported durable-instance and local-observer actions from its existing UAR settings through trusted main-process IPC. Main SHALL bind every request to a validated workspace and current authenticated owner, and SHALL preserve distinct state in two workspaces.

#### Scenario: Two workspaces administer distinct agents

- **WHEN** an operator creates and controls instances and observers in two workspaces
- **THEN** each workspace sees only its own instances, subscriptions and recovery state, including after an application restart.

### Requirement: Complete operational feedback

The settings UI SHALL show supported actions, progress, success, failures and recovery information in every shipped locale. Unsupported actions SHALL be clearly unavailable.

#### Scenario: Observer recovery is needed

- **WHEN** an observer reports backlog, dead letters or a gap
- **THEN** the operator can inspect its status and use the supported recovery action with visible outcome.
