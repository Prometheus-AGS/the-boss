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

### Requirement: Exact persisted model settings are visible and revisioned

The Boss SHALL show selected configured route, served alias, canonical price and trusted endpoint/profile/settings revision separately. It SHALL persist and round-trip pricing/settings losslessly and require an explicit expected-revision rebind for changed effective settings. It SHALL show default reasoning off and actionable pre-dispatch unsupported explicit reasoning refusal. Settings-only validation SHALL be labelled no guaranteed fit; unknown limits/capability SHALL remain unknown with provenance. Renderer SHALL NOT supply arbitrary request JSON/allowlists or receive credentials.

#### Scenario: An operator changes effective settings

Given a bound model with captured settings, when settings are saved and explicitly rebound, then the returned binding revision/effective settings are shown after restart and historical attempts retain their original settings.

#### Scenario: Explicit reasoning is unsupported

When the exact endpoint refuses a requested reasoning control, then the operator sees a translated stable refusal and supported remediation rather than a silently dropped control or successful empty result.

### Requirement: Ownership recovery remains privileged and inspectable

The Boss SHALL project authoritative execution claim/conflict/draining/release state and expose reclaim only through fixed authenticated administration. It SHALL require expected epoch, reason and protected fencing evidence reference; UAR SHALL enforce privileged operator authorization and verified old-process/child exclusion. UI visibility SHALL NOT substitute for server permission. Unauthorized/stale/insufficient-evidence refusals and running uncertainty SHALL be actionable and localized; no timeout-based takeover SHALL be implied.

#### Scenario: Authorized reclaim and forbidden replacement are distinct

Given an interrupted executor, when a privileged operator submits current epoch and verified evidence, then the audit/queued-transfer/running-uncertainty result is displayed; unauthenticated, unauthorized, stale or insufficient-evidence requests are refused without claiming recovery success.

### Requirement: Migration diagnostics and terminal results remain truthful

The Boss SHALL display stable field-specific unsupported-context/history/memory/grant and child/subteam diagnostics with explicit revision/remediation, preserve supported selected artifacts/exact skills and existing required-RAG refusal, and never silently rewrite definitions. Safe terminal categories/protected references SHALL map to translated actions rather than arbitrary provider prose as i18n keys. Known successful output SHALL remain visible during unknown accounting and recovery; unknown effects SHALL block unsafe replay. All new feedback SHALL ship in all 13 existing renderer locales.

#### Scenario: A resource selection is unimplemented

When UAR refuses a nonempty required legacy selection at its exact definition or private binding pointer, then Boss shows that field and permitted explicit rebind/deferred-support remediation, without claiming the resource was used or exposing private grants.

### Requirement: Cooperating-pair state is a typed UAR projection

After Gate A and completed B, The Boss SHALL present authorized roster/message/wait/blocked/continuation state through fixed DTO/IPC, distinguishing accepted/delivered/consumed from task completion. UAR SHALL enforce directed edge/mode/current-scope authorization before disclosure/send/delegation/result selection. The Boss SHALL show one fresh continuation identity after confirmed yield/cleanup and all-target readiness without introducing another executor or persisted task-state copy. All B controls/status/help SHALL be localized and accessible.

#### Scenario: A forbidden same-team edge reveals no message

Given a valid member identity without the current required directed edge or with a revoked edge, when disclosure/send/delegation is requested, then no forbidden inbox content or accepted action is shown; stable denial is displayed. Queue-only authority SHALL NOT activate work or imply reverse reply permission.

#### Scenario: The coordinator resumes once

Given team/global capacity one, when a coordinator safely yields for multiple targets, then the UI shows waiting until all have known terminal outcomes and displays one new continuation or blocked reason. Failed/cancelled outcomes remain explicit; cycle/reassignment/revocation/crash does not imply success or revive old authority.
