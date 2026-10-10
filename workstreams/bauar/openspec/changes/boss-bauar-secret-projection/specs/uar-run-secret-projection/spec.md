# UAR Run Secret Projection

## Purpose

Keep explicit credentials held for a Boss UAR run out of its ordinary content outputs while preserving authenticated transport and exact execution authority.

## ADDED Requirements

### Requirement: Finite run-owned projection
The host MUST keep an explicit run-lifetime set of known private values and remove their exact occurrences before ordinary output projection, without persisting the set or introducing credential custody.

#### Scenario: Selected transport values stay private
- **WHEN** a run uses a Boss-supplied provider credential, bridge bearer or explicit captured MCP header/environment value
- **THEN** its exact occurrence in covered ordinary content is replaced and the authenticated transport retains its original value

#### Scenario: Scope is reported honestly
- **WHEN** a credential is dynamically refreshed, held only by UAR, transformed or unrelated to the run
- **THEN** acceptance does not claim that the run-owned matcher discovers or protects it

### Requirement: Project before tool output consumers
The host MUST project covered tool result, error, progress and trace content before the per-call ordinary log/trace path and before the mounted MCP response reaches UAR model input.

#### Scenario: Tool echoes a captured credential
- **WHEN** a real mounted tool returns a captured canary in text or structured content
- **THEN** model-bound MCP output and covered call traces contain the replacement and no canary

#### Scenario: Tool throws a credential-bearing error
- **WHEN** the real call fails with a captured canary in its diagnostic
- **THEN** per-call log, trace and forwarded error omit the canary before any truncation

### Requirement: Project before ordinary runtime events
The host MUST project covered text, reasoning, tool output and diagnostic content before runtime events reach renderer or persistence, including consecutive deltas that split an exact known value.

#### Scenario: Credential crosses text deltas
- **WHEN** consecutive deltas in one content stream divide a captured canary
- **THEN** no emitted or persisted fragment reconstructs the canary and benign surrounding text remains ordered

#### Scenario: History contains a known credential
- **WHEN** existing session content containing a current run-known canary is loaded for model context
- **THEN** outbound history omits the canary without changing stored legacy rows or tool correlation

### Requirement: Projection preserves execution authority
The host MUST preserve protocol IDs, exact approval identity, cancellation, and claim-before-effect while projecting human-readable content; projection MUST NOT mutate executable arguments or synthesize authority.

#### Scenario: Projected tool response follows one exact claim
- **WHEN** an admitted tool returns content requiring projection
- **THEN** the effect is dispatched only after its exact claim and correlation remains intact

#### Scenario: Application ownership remains intact
- **WHEN** run projection is enabled
- **THEN** configured application MCP servers, credentials and custody settings remain unchanged
