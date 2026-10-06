## Purpose

Expose scoped durable workflow progress and exact internal draft decisions to operators through the existing Teams surface.

## ADDED Requirements

### Requirement: Scoped workflow administration
Boss SHALL list installed workflow definitions with support diagnostics and durable runs for the selected workspace, and SHALL start only a supported pinned classify-then-draft definition using explicit team members and per-step reservations.

#### Scenario: Supported start
- **WHEN** an operator selects an installed supported workflow, team and bounded feedback
- **THEN** Boss submits typed scoped input and displays the durable run returned by UAR

#### Scenario: Unsupported definition
- **WHEN** a workflow requires unsupported semantics
- **THEN** it remains inspectable with diagnostics and cannot be started

### Requirement: Exact internal draft decision
Boss SHALL present the exact artifact of the durable wait and send the wait ID, artifact ID and digest, expected revision and command ID with accept, reject or cancel. Acceptance SHALL be described as an internal draft only, granting no external write or implementation authority.

#### Scenario: Decision succeeds
- **WHEN** the operator accepts the displayed draft
- **THEN** Boss displays UAR's durable receipt and resulting disposition

#### Scenario: Stale decision
- **WHEN** UAR refuses a stale revision or mismatched wait
- **THEN** Boss retains user input, displays the error and offers authoritative refresh without claiming acceptance

### Requirement: Recovery and truthful accounting
Boss SHALL reload durable runs after restart, expose cancellation and recovery without manufacturing a replacement attempt, and display unresolved accounting separately from business disposition.

#### Scenario: Restored operator wait
- **WHEN** Boss reloads a run waiting for a decision
- **THEN** the pinned definition, exact draft and stable wait identity reappear from UAR

#### Scenario: Unknown accounting
- **WHEN** a successful draft retains an unsettled reservation
- **THEN** Boss displays accounting unresolved and reservation held even if the draft is accepted

### Requirement: Accessible localized controls
Workflow controls SHALL use localized text, accessible labels, visible keyboard focus, semantic status and error messages, and readable constrained-width content.

#### Scenario: Keyboard decision
- **WHEN** an operator navigates the workflow using the keyboard
- **THEN** every selector, input, refresh and decision control has a named reachable action
