# UAR lifecycle overview

## Purpose

Present selected-instance, workspace-scoped UAR lifecycle snapshots and supported operational posture through the trusted administration boundary, preserving non-atomic capture and unavailable information.

## ADDED Requirements

### Requirement: Workspace-scoped execution overview
The Boss SHALL present UAR definitions, bindings, instances, activations, runs, teams, tasks, workflows, and observers for the selected workspace using their existing trusted administration contracts. It SHALL link to the applicable detail and action views and SHALL not assert atomic consistency across separately fetched snapshots.

#### Scenario: Inspect the selected workspace
- **WHEN** an operator selects a configured UAR instance and registered workspace
- **THEN** the overview displays scoped records, source capture times and links to their owning detail panels without claiming an atomic snapshot

### Requirement: Supported operational posture
The overview SHALL expose task dependencies and assignments, binding activation support, available budget use, and observer cursor/backlog/gap information. It SHALL mark missing or non-comparable measures unknown instead of deriving unsupported remaining budget, elapsed lag, or failure causes.

#### Scenario: Inspect available posture
- **WHEN** the runtime returns task dependencies, binding posture, budget counters and observer progress
- **THEN** the overview displays those supported values and marks unavailable or non-comparable measures unknown

### Requirement: Accessible administration
The overview SHALL remain navigable by keyboard, usable on narrow screens, and translated across every existing locale.

#### Scenario: Navigate the translated overview
- **WHEN** an operator navigates the overview with a keyboard or narrow window in a shipped locale
- **THEN** controls remain reachable, readable and translated using the existing administration components
