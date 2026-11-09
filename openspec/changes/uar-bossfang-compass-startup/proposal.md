# Proposal

## Why

The installed managed UAR fails on macOS because its ingestion directory defaults to a read-only root path; an unrelated process can also occupy its preferred port. BossFang must follow the operator's authenticated runtime choice, and bundled tooling needs current source and artifact identities.

## What Changes

- Supply a writable, operator-configurable managed ingestion directory and actionable startup diagnostics.
- Discover a UAR on port 1906, offer an informed persistent choice, verify any selected external instance, and retain managed port fallback and existing session bindings.
- Start or connect BossFang only after the selected UAR is verified, respecting its start-on-launch preference.
- Carry forward the verified Compass 0.4.2 and UAR 1.4.0-rc.3 payloads from The Boss 2.2.45.

## Capabilities

### New Capabilities

- `uar-startup-selection`: Startup discovery, ingestion directory and choice for managed or external UAR.

### Modified Capabilities

- `uar-service-instance-placement`: Apply startup selection while preserving authenticated placement and session bindings.
- `managed-bossfang`: Gate startup on the selected verified UAR.

## Impact

UAR settings and IPC, managed supervisor and external inventory, BossFang lifecycle, localization, and integration payload manifests. No external UAR process or existing session data is moved or controlled.
