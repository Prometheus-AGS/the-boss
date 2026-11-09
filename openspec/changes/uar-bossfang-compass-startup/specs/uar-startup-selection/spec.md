# Startup selection

## Purpose

Allow the operator to choose a compatible local runtime and a writable ingestion directory without blocking the desktop.

## ADDED Requirements

### Requirement: Managed ingestion location
The managed runtime SHALL use a writable application-data ingestion directory by default and allow the operator to configure another directory, applied on restart. Failures SHALL be actionable and SHALL preserve existing data.

#### Scenario: Unwritable configured directory
- **WHEN** the selected ingestion directory cannot be prepared for writing
- **THEN** managed startup fails with a diagnostic identifying the directory and remedy.

### Requirement: Existing runtime choice
The desktop SHALL identify an existing UAR on port 1906, offer the operator a persistent choice between it and the managed runtime, and verify external identity, credentials and compatibility before use. The desktop remains usable while a choice is pending.

#### Scenario: Other service occupies the port
- **WHEN** port 1906 is occupied by a service that is not UAR
- **THEN** the managed runtime uses the first available subsequent port.

#### Scenario: Existing runtime is incompatible
- **WHEN** the operator selects a discovered UAR that cannot pass compatibility or authentication checks
- **THEN** no work or provider credentials are sent and the reason is displayed.
