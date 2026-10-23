# Proposal

## Why

The public 2.2.40 installers predate the latest Cherry Studio changes, the current mini skill pack, and UAR 1.2.3. The next customer release needs all three sources together while retaining The Boss integrations and making Windows x64, Mac ARM64, and Mac x64 downloads available on the landing site.

## What Changes

- Merge Cherry Studio `upstream/main` into The Boss's committed integration branch, retaining Boss branding, UAR lifecycle integration, packaged skills, and release workflows.
- Pin mini `main` at `1066ad4008f68bf0cc912573bf6496540ea93c27` and UAR v1.2.3 at `c4a656251b643bd83c8f1407286480dbfac76708`.
- Produce immutable UAR sidecar records and a refreshed integration payload for Windows x64, Mac ARM64, and Mac x64.
- Version and publish The Boss 2.2.41 installers for those three platforms, then verify the landing receiver and live downloads against release metadata.

## Capabilities

### New Capabilities

- `customer-release-distribution`: A customer release binds one reviewed Boss source and its native dependency payloads to platform-specific installers and public download records.

### Modified Capabilities

None.

## Impact

The Boss upstream merge, mini gitlink and packaged skills, UAR source and sidecar pins, integration and release manifests, native release workflows, GitHub releases, and the landing receiver. No new public application API or data migration is intended.
