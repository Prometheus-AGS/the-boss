# workspace-service-inventory Specification

## Purpose
Load usable integration settings independently of missing directories retained in the workspace catalog, without changing execution authority or deleting historical work.

## Requirements

### Requirement: Missing workspace isolation
The integration service SHALL omit a registered workspace whose directory cannot be resolved because it no longer exists from initialization and integration snapshots. It SHALL retain its persistent workspace record and SHALL NOT create a replacement directory or weaken execution path validation.

#### Scenario: Deleted unrelated workspace
- **WHEN** one registered directory is missing while another workspace is available
- **THEN** integration initialization and snapshots succeed for the available workspace
- **AND** the missing workspace receives no integration projection or managed server registration

#### Scenario: Directory disappears after projection
- **WHEN** a previously projected workspace directory is removed
- **THEN** the next snapshot excludes its stale projection while other settings remain available

#### Scenario: Execution uses a missing directory
- **WHEN** a run attempts to use a missing workspace
- **THEN** existing strict path validation refuses it without substituting another directory or identity
