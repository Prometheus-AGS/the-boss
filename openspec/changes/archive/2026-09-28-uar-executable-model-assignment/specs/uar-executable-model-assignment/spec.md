## Purpose

Lets a UAR agent created or managed in The Boss select a model that its bound runtime can execute, while making the effective source and repair actions visible.

## ADDED Requirements

### Requirement: Explicit executable model assignment for Boss-owned UAR agents
The Boss SHALL offer gateway, UAR provider, and compatible Boss API-key model sources for a Boss-owned UAR agent. It SHALL persist the selected source and model separately from the ordinary Boss model field and SHALL NOT silently infer a new agent's UAR source from an OAuth-only Boss model.

#### Scenario: Create with a liter-llm served alias
- **WHEN** a user creates a UAR agent and selects an operational liter-llm served alias
- **THEN** the agent stores that gateway alias as its UAR inference assignment and uses it for UAR runs.

#### Scenario: Repair an existing UAR agent
- **WHEN** a user edits a Boss-owned UAR agent whose inherited model cannot run through UAR
- **THEN** the user can select and save another executable source and model without recreating the agent.

### Requirement: Selection reflects actual source availability
The Boss SHALL identify enabled models and credential/connection state from the selected source, SHALL prevent selection of an OAuth-only Boss model as a raw UAR API-key route, and SHALL provide an actionable unavailable state without disclosing secrets.

#### Scenario: Gateway is unavailable
- **WHEN** the configured liter-llm gateway cannot list served models or lacks its credential
- **THEN** the selector reports that state and does not present unverified aliases as operational choices.

#### Scenario: Working legacy API-key agent
- **WHEN** an existing UAR agent has no explicit assignment and its active Boss model satisfies the UAR API-key credential contract
- **THEN** the agent remains executable without a silent storage migration.

### Requirement: Runtime and presentation use one effective model
For a Boss-owned UAR run, the saved or compatible legacy assignment SHALL determine the exact source/model sent to UAR. The Boss SHALL display that effective identity in the conversation and SHALL report a precise error when it cannot establish an executable route.

#### Scenario: OAuth-only inherited model
- **WHEN** an existing UAR agent inherits an OpenAI Codex OAuth model without an explicit UAR assignment
- **THEN** the user receives a model-configuration action before dispatch instead of a request for a nonexistent Codex API key.

#### Scenario: Gateway model response
- **WHEN** a UAR agent bound to a liter-llm alias completes a response
- **THEN** the displayed effective model, persisted assignment, and model in the UAR run agree.

### Requirement: Ownership and instance binding remain authoritative
Catalog-owned UAR agents SHALL use their catalog model policy rather than a Boss-side assignment. A direct UAR provider/model choice SHALL be evaluated against the UAR instance bound to the session, including when that instance is not the current default.

#### Scenario: Catalog-owned agent edit
- **WHEN** a user edits a catalog-owned UAR agent in The Boss
- **THEN** the interface directs the user to its UAR catalog policy and does not offer a Boss-side control that would not affect inference.

#### Scenario: Session bound to another UAR instance
- **WHEN** a resumed session is bound to a nondefault UAR instance
- **THEN** direct UAR model availability is checked against that bound instance before its next run.
