## Why

The Boss issue #39 reports loss of shell startup contents when concurrent app profiles and shell-triggered cleanup perform unlocked truncating writes. The affected implementation remains in this delivery branch. Repair it before another packaged launch; do not infer that previously lost contents can be recovered from application code.

## What Changes

- Use a shared per-user command directory and registration record, independent of Electron userData profiles.
- Serialize installation and all shell-file changes; preserve user bytes, permissions and symlinks with atomic writes and protected original backups.
- Remove shell-triggered registration cleanup. Only explicit uninstall removes managed blocks.
- Parse complete marker lines, consolidate well-formed duplicates, refuse ambiguous damage, and skip unchanged files.
- Retire recognized legacy application-owned cleanup helpers and migrate existing per-profile registration metadata safely.

## Capabilities

### New Capabilities
- `managed-command-shell-safety`: non-destructive shared PATH registration.

## Impact

Electron main-process Prometheus command installation, centralized path definitions and existing CLI uninstall. No new service, UI or dependency. The current Cadence iteration and C15 inference failure remain open; this repair does not count as team completion.
