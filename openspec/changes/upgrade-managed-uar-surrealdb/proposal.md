## Why

The RC4 sidecar embeds SurrealDB 4.0. Existing 3.x SurrealKV profiles require an explicit offline conversion before the managed runtime can start.

## What Changes

- Upgrade a checksum-verified copy of an existing managed database and retain the original.
- Start the managed sidecar after the offline upgrade succeeds. Preserve the selected-runtime dependency for BossFang.
- Verify the upgrade with an existing profile and a normal relaunch.

## Capabilities

### Modified Capabilities

- `uar-local-delivery` covers upgrade of existing managed SurrealKV databases.
