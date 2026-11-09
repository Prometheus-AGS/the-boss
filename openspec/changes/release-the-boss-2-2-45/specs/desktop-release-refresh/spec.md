## ADDED Requirements

### Requirement: Desktop release dependency provenance
The Boss release SHALL bind its UAR sidecar, mini pack and managed Docker images to immutable revisions or digests.

#### Scenario: Fresh managed service installation
- **WHEN** an operator installs the managed services from the 2.2.45 application
- **THEN** the generated Docker configuration uses the packaged SurrealDB 4.0.0 and Surreal Memory Server 1.11.0 digests
- **AND** existing datastores are subject to the database's explicit upgrade procedure.

#### Scenario: Release publication
- **WHEN** the Mac ARM64 local gate and the three target installer jobs succeed
- **THEN** the release and landing site publish the corresponding Mac ARM64, Mac x64 and Windows x64 installer records.
