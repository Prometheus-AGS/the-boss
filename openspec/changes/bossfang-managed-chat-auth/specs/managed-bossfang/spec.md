## ADDED Requirements

### Requirement: Managed agent transport
The managed BossFang process SHALL discover a usable Claude executable and authenticate its configured daemon MCP connection without requiring manual path or API-key edits.

#### Scenario: Desktop launch
- **WHEN** the desktop parent has a minimal PATH
- **THEN** the packaged Claude executable is available as a fallback while explicit overrides remain authoritative.

### Requirement: Authenticated dashboard streaming
The dashboard SHALL authenticate WebSocket streaming with its valid native session and retain origin and agent-access checks.

#### Scenario: Valid session
- **WHEN** an authenticated operator opens an agent
- **THEN** the streaming connection opens without a persistent reconnect warning.
