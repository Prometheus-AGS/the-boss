## ADDED Requirements

### Requirement: Selected runtime readiness
The Boss SHALL resolve and verify the selected UAR before starting or connecting BossFang, and SHALL bind BossFang to that same runtime. The existing start-on-launch preference remains authoritative.

#### Scenario: Runtime selection is pending
- **WHEN** UAR selection, authentication or initialization has not completed
- **THEN** BossFang does not start or connect and the desktop remains usable.

#### Scenario: A launch-bound external runtime supplies the owner
- **WHEN** the selected external UAR authenticates the stored credential and rejects The Boss's host principal with `principal_mismatch`
- **THEN** The Boss and BossFang use the verified credential's bound owner for the connection and requests.

#### Scenario: The operator switches runtimes during active work
- **WHEN** the operator selects another verified UAR while a BossFang run is active
- **THEN** new admissions use the new connection and the active run keeps its original runtime, workspace and authorization.
