## ADDED Requirements

### Requirement: Upgrade existing managed SurrealKV data

The Boss SHALL upgrade its embedded SurrealDB 3.x store before starting a SurrealDB 4.0 managed sidecar. The application SHALL exclude concurrent native writers, verify a staged copy, convert and reopen it offline, and retain the original database at cutover.

#### Scenario: Start an existing managed profile

- **WHEN** a managed RC4 sidecar starts for a profile with a SurrealKV 3.x database
- **THEN** the application opens the converted copy with the same native session identities and retains the original database for rollback.

#### Scenario: Upgrade is interrupted

- **WHEN** upgrade is interrupted before the verified copy takes the live database path
- **THEN** the next start restores the original path if needed and can retry the upgrade.

#### Scenario: Start with an external or remote database

- **WHEN** the selected UAR is external or the managed runtime uses remote persistence
- **THEN** the application leaves the local legacy database unchanged.
