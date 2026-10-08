# Reusable UAR teams

## ADDED Requirements

### Requirement: Guided reusable authoring
The Boss SHALL let an operator create and revise a named coding or product/design team using role guidance, shared and member instructions, and explicit model, skill, tool and knowledge choices without editing raw definition JSON.

#### Scenario: Configure a mixed team
- **WHEN** an operator chooses a template, edits roles and instructions, and selects available role models and scoped resources
- **THEN** The Boss shows the exact reviewed choices and can save a versioned reusable authoring record.

#### Scenario: Forward artifacts to subsequent roles
- **WHEN** the coordinator delegates with selected artifacts from earlier roles in the template's declared order
- **THEN** the compiled definition explicitly permits those producer-to-consumer paths with queue-only edges, preserving coordinator-only activation and existing workspace, tool and approval restrictions.

### Requirement: Immutable deployment
The Boss SHALL compile each revision into an immutable package and install only a private workspace binding for model, credential, storage and host authority choices.

#### Scenario: Revise after running
- **WHEN** a team is revised and deployed after an earlier instance started
- **THEN** new Work runs can choose the new package and binding while the earlier instance keeps its exact definition and package digests.

### Requirement: Operable Work entrypoint
A deployed team SHALL appear in Work through the ordinary UAR team snapshot and launch path.

#### Scenario: Packaged operation
- **WHEN** the packaged application creates, deploys, runs, revises and reopens a team
- **THEN** the procedure records the real package/binding/run identities and their source digests, without mock-only completion or inferred acceptance.

### Requirement: Apply an existing reviewed model recommendation
The existing reusable-team editor SHALL import the supported agent-team-creator models-select result without duplicating role guidance or model selection. It SHALL retain the original result/source digest, effective policy, rationale and metadata, and SHALL distinguish an imported recommendation, explicit acceptance and manual model choice.

#### Scenario: Accept the exact configured recommendation
- **WHEN** an operator imports a reviewed result whose selected wire alias is advertised by the configured liter-llm gateway and whose provider/catalog-model identity matches its enabled target
- **THEN** import shows a pending recommendation without changing the selected model, and Use recommendation selects that exact model through the existing picker/binding path.

#### Scenario: Retain a manual choice
- **WHEN** an operator uses the existing model dropdown after importing a recommendation
- **THEN** the authored revision records a manual choice and retains the reviewed recommendation for inspection; deployment uses the exact manual selection without reevaluating policy.

#### Scenario: Preserve policy identity across deployment and reopen
- **WHEN** the operator saves, deploys and runs an accepted recommendation and later reopens the editor
- **THEN** the private record retains the original JSON/source digest and policy/result digest, the real attempt receipts identify the exact wire alias and pricing provider/model, and prior authored revisions and run identities remain immutable with credentials outside portable definitions.
