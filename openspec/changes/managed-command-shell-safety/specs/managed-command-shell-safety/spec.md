## ADDED Requirements

### Requirement: Preserve user-owned shell files
The application SHALL change only complete managed command blocks, preserve unrelated bytes, existing permissions and symlinks, back up the original before modification, and serialize cooperating writers across processes. It SHALL atomically replace changed contents and refuse conflicting or ambiguous inputs.

#### Scenario: Concurrent application profiles
- **WHEN** multiple profiles register the command directory concurrently
- **THEN** user content remains intact and their blocks converge to one shared directory without repeated unchanged writes.

#### Scenario: Damaged markers
- **WHEN** a shell file contains unmatched, nested or recognizable torn managed markers
- **THEN** registration refuses that file without changing its bytes and reports the affected path.

### Requirement: Shell startup never edits startup files
The registered shell block SHALL only conditionally add the stable commands directory to PATH. Explicit uninstall SHALL use the same safe writer to remove only application-owned blocks.

#### Scenario: Application binary removed or upgraded
- **WHEN** a versioned executable disappears and a new shell starts
- **THEN** shell startup does not rewrite any startup file.

### Requirement: Shared registration has accurate status
Instances SHALL use a stable per-user registration and validate the expected complete block, rather than any occurrence of a marker. Legacy records SHALL be migrated without executing unsafe cleanup helpers.

#### Scenario: Explicit uninstall
- **WHEN** uninstall removes a registered block
- **THEN** all unrelated shell content and existing PATH entries remain unchanged.
