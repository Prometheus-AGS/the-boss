## ADDED Requirements

### Requirement: Minimum useful team guidance
The editor SHALL provide an outcome-first authoring sequence, explanations for
all eight presets, explicit role/resource choices and a single-agent Work action.
The team minimum SHALL remain unchanged.

#### Scenario: Sequential work needs one agent
- **WHEN** the operator chooses the single-agent alternative
- **THEN** ordinary Work opens without team mode or implicit team creation.

### Requirement: Inspectable planning information
The editor SHALL show imported creator alternatives, discovery and role resource
proposals as readable information without silently applying or granting them.

#### Scenario: A creator proposal is imported
- **WHEN** a supported actual creator guide is imported
- **THEN** alternatives and discovery appear before mapping, and only explicitly
  mapped role responsibility/instructions are applied with resources retained.

### Requirement: Honest model and regulated-work guidance
The editor SHALL distinguish reviewed classes, known source prices, unknown
values, budget limits and measured usage. It SHALL make no unmeasured savings or
regulated certification claim.

#### Scenario: Configured alias has no price or tier
- **WHEN** the supported model-selection result has null pricing and strength
- **THEN** the display reports unknown values and preserves source/freshness data
  through an immutable save, deployment and reopening.
