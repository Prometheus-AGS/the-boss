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

### Requirement: Authoritative UAR targets
Discovery, chat and delegated admission SHALL agree on installed-agent and configured-model identity. Agent selection SHALL retain the authorized immutable definition binding; model selection SHALL execute the default agent. An explicit model override SHALL be policy-admitted and recorded in the effective binding without mutating the definition.
#### Scenario: Agent and model selection
- **WHEN** a user chooses an installed agent, a verified model, or an agent with an explicit verified override
- **THEN** the catalog and execution resolve the same target, effective model, instance and authorized workspace

### Requirement: UAR owns delegated dashboard execution
Explicit UAR targets SHALL use existing full-run admission and control, bypassing the native BossFang agent loop. Legacy inference-only configurations SHALL retain their behavior until explicit conversion. Active runs SHALL retain their original authority when configuration changes.
#### Scenario: Conversation and cancellation
- **WHEN** a user streams a prompt, follows up, cancels or reopens an explicitly delegated conversation
- **THEN** BossFang presents the correlated UAR result and lifecycle without replaying effects or running a second tool loop

### Requirement: Installed restart proof
Release evidence SHALL distinguish build, launch, prompt completion and shared-memory persistence.
#### Scenario: Whole application restart
- **WHEN** The Boss is quit and relaunched after an authorized workspace memory is stored
- **THEN** a fresh authorized UAR conversation retrieves the original value using its lookup key alone, while another workspace cannot retrieve it
