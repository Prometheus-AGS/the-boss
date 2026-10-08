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
- **WHEN** an operator imports a reviewed result whose selected wire alias is advertised by the configured liter-llm gateway and whose non-null provider/catalog-model identity matches its enabled target
- **THEN** import shows a pending recommendation without changing the selected model, and Use recommendation selects that exact model through the existing picker/binding path.

#### Scenario: Retain a manual choice
- **WHEN** an operator uses the existing model dropdown after importing a recommendation
- **THEN** the authored revision records a manual choice and retains the reviewed recommendation for inspection; deployment uses the exact manual selection without reevaluating policy.

#### Scenario: Preserve policy identity across deployment and reopen
- **WHEN** the operator saves, deploys and runs an accepted recommendation and later reopens the editor
- **THEN** the private record retains the original JSON/source digest and policy/result digest, the real attempt receipts identify the exact wire alias and pricing provider/model, and prior authored revisions and run identities remain immutable with credentials outside portable definitions.

#### Scenario: Retain a configured custom alias with unknown catalog metadata
- **WHEN** the existing selector selects an unmapped served alias under declared constraints that permit unknown metadata
- **THEN** import retains its nullable catalog identity, unknown capabilities/prices and original policy/rationale without filling them; a separate private receipt freezes its exact enabled configured provider/model target, and reviewed deployment rejects a changed target while preserving existing pricing/accounting checks.

#### Scenario: Authenticate the main-issued target receipt
- **WHEN** the existing model-review import captures an enabled alias target
- **THEN** main persists an immutable credential-free receipt and returns its issuance UUID; save authenticates the complete receipt against that private record, and reviewed deployment resolves its target from that record.

#### Scenario: Refuse a rewritten issued target
- **WHEN** renderer input changes an issued receipt's target, selection, source or result while retaining its issuance UUID
- **THEN** save refuses the issuance mismatch before creating a revision, even if the configured alias has since changed to the submitted target.

#### Scenario: Preserve legacy inspection and manual choice
- **WHEN** an older receipt has no main issuance UUID
- **THEN** it remains readable and usable with explicit manual selection; reviewed save or deployment derives only a complete non-null raw provider/catalog-model identity, and otherwise requires reimport without rewriting the older revision or claiming unknown policy compliance.

### Requirement: Apply existing reviewed role guidance explicitly
The existing reusable-team editor SHALL import the supported creator guide result, retain its exact source and complete planning metadata, and let the operator apply explicitly selected proposals to existing editable members. Guide metadata SHALL confer no native dependency graph, skill installation, tool grant or model policy compliance.

#### Scenario: Inspect guidance before applying
- **WHEN** the operator imports a creator guide result
- **THEN** the editor shows its ready/incomplete state, role proposals and original result with source/result digests; all mappings start unselected and import leaves configured members unchanged.

#### Scenario: Apply selected Coding role mappings
- **WHEN** the operator explicitly selects implementer → worker and reviewer → reviewer from a ready guide for the existing Coding preset
- **THEN** application copies only selected responsibility/instructions, records the selected mapping and manual model choice, and retains the coordinator, member order and exact configured resources/model without save or deployment.

#### Scenario: Retain unknown model policy evidence
- **WHEN** the operator configures an unclassified served model manually for a guided role whose requested policy declares medium or hard
- **THEN** the requested policy remains inspectable planning metadata, unknown strength/capability/price metadata stays unknown, and the editor does not claim policy compliance; existing pricing, accounting and governance checks still apply.

#### Scenario: Preserve guidance through immutable revision and reopen
- **WHEN** the operator explicitly saves a guided team and later revises or reopens it
- **THEN** the private record retains the original guide source/result digests and selected role mappings, the compiler records their source identity without carrying the raw guide in portable definitions, and earlier revisions keep their original identities.
