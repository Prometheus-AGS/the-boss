## ADDED Requirements

### Requirement: Applied selected runtime
The managed dashboard SHALL restore connection intent and automatically connect its selected UAR using a persistent private personal workspace until a project is selected.
#### Scenario: Restart
- **WHEN** the application restarts with connection intent enabled
- **THEN** it restores the selected instance and reports actionable dependency failures without disabling the dashboard

### Requirement: Scoped shared memory
The host SHALL enforce trusted user/workspace/team/private scope on Surreal Memory calls and SHALL NOT substitute private storage when the selected service fails.
#### Scenario: Shared recall
- **WHEN** a native agent stores workspace memory and an authorized UAR agent recalls it after restart
- **THEN** the same service returns it while another workspace cannot retrieve it

### Requirement: Independent readiness
The application SHALL show dashboard, UAR execution, models and shared memory readiness independently, with live supported model choices.
#### Scenario: Unavailable model
- **WHEN** a persisted model is absent from the connected catalog
- **THEN** it is shown unavailable with valid replacements without silently switching inference routes
