## Context

Source baseline: The Boss be00ee09e1c6e32f6a57f58d22c10c42aca67520. Issue #39 identifies competing truncate/read/write windows and startup cleanup. Source confirms both writers and per-userData registration. Current restored shell files are user data, not reconstruction inputs.

## Decisions

1. Put commands and registration under the existing per-user CHERRY_HOME infrastructure via centralized registry keys. Explicit isolated developer homes remain isolated. Serializing the whole installer also protects its shared runner/configuration writes.
2. All shell edits use one realpath-aware cross-process writer. Read while locked, verify bytes and metadata before commit, write a sibling temporary file, preserve mode, fsync and rename. Preserve an original protected backup before changing an existing file. Locks never evict a live or unknown owner; a dead-owner lock requires explicit recovery rather than unsafe competing reclaimers.
3. Managed blocks are exact complete marker lines. Well-formed duplicates can converge to one block; nested, unmatched or recognizable torn markers refuse modification. Unmanaged bytes are unchanged. Unchanged output performs no file replacement.
4. The block only checks the commands directory and adds it to PATH. It never executes cleanup or depends on a versioned Electron executable. Legacy cleanup helpers recognized by their generated source are atomically replaced with inert content before migration, under the shared installer lock. Never execute them.
5. Global registration and legacy metadata are read only as application-owned records. Explicit removal uses the same safe writer and clears only application-owned registrations. Windows user PATH logic retains existing semantics.

## Ownership and delivery

boss-desktop owns shellRcFile.ts and its helper modules. Lead owns commandPath.ts, pathRegistry.ts, migration wiring and artifacts. No concurrent build or intermediate test suite. Build and operate the completed repair once using the actual Mac ARM64 packaging command and a disposable-home real filesystem operation with concurrent registration, removal, symlink, mode, duplicate and damaged-block cases. Windows native operation remains pending unless executed there.

The security boundary is writing user-owned shell startup files and protected backups; never log their contents. There is no claim of protection against arbitrary noncooperating programs modifying the same file after the final conflict check. Historical lost data requires the user's own backups.
