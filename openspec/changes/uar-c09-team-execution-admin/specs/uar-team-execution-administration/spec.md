## ADDED Requirements

### Requirement: The Boss admits authoritative team runs
The Boss SHALL expose fixed typed workspace-scoped team task admission using command identity, current team/task revisions, assigned member, explicit token/cost/time reservation and selected artifact IDs. It SHALL show current UAR execution capability and SHALL distinguish assignment from execution authority.

#### Scenario: Run an assigned task
- **WHEN** the operator starts a ready assigned task with a valid reservation
- **THEN** UAR returns a durable attempt and the settings page shows its real status and output

#### Scenario: Admission is denied
- **WHEN** UAR rejects an admission for stale authority, budget or concurrency
- **THEN** the entered reservation and context selection remain visible and feedback directs the operator to refresh and inspect the current state before retrying

### Requirement: Execution and accounting remain distinct
The Boss SHALL show authoritative effective team budgets, reservations, actual usage and uncertain accounting. It SHALL display executionOutcome separately when a successful or failed execution has uncertain usage, without claiming lost output or settled zero cost.

#### Scenario: Output exists with unpriced usage
- **WHEN** UAR returns a successful outcome with output and unresolved usage
- **THEN** the result remains visible and the page shows the held reservation and accounting uncertainty

### Requirement: The Boss supports scoped execution controls
The Boss SHALL expose revisioned reason-bearing cancellation, recovery and member revocation through fixed IPC routes. It SHALL inspect authoritative state after changes and poll active team execution. Revocation SHALL visibly explain that future admission is prohibited and active cancellation is requested.

#### Scenario: Cancel or recover a team run
- **WHEN** an operator supplies a reason and requests cancellation or recovery
- **THEN** the runtime-returned state is displayed, and unknown effects are not presented as safely repeated work

### Requirement: Context artifacts are selected explicitly
The Boss SHALL show only owner/workspace/team-scoped returned artifacts and SHALL include only selected artifact IDs in admission.

#### Scenario: Select previous output as context
- **WHEN** an operator selects a team artifact for the next task
- **THEN** the admission contains that selected ID and no unselected artifact ID

### Requirement: Starter-team execution models are selected from current catalogs
The Boss SHALL let the operator select a current UAR model or liter-llm alias before installing a starter binding. It SHALL keep planning-only bindings available and install model-specific bindings without overwriting existing ones. Gateway credentials SHALL stay within protected main-process/UAR storage. Canonical pricing identity SHALL come only from an enabled exact configured gateway alias and provider connection; The Boss SHALL never infer it from an alias name or treat unavailable pricing as free.

#### Scenario: Install a gateway-bound starter
- **WHEN** an operator chooses a live gateway alias and installs the starter team
- **THEN** main validates the choice, installs its private credential-backed model route and selects the returned binding before team creation

### Requirement: Execution controls are localized and accessible
The Boss SHALL translate all new visible strings in all 13 supported renderer locales and use shared semantic components, visible focus, associated labels, non-color status and readable narrow-window content.

#### Scenario: Use translated controls
- **WHEN** the operator switches locale and navigates execution controls by keyboard
- **THEN** action labels, reasons, statuses and feedback remain translated and associated with their controls
