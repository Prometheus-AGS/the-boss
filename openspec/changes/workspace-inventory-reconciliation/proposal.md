# Proposal

## Why

A deleted temporary qualification workspace makes Services initialization reject with ENOENT, preventing valid integration settings from loading. The operator requests a permanent repair, correction of five broken documentation links, and reconciliation of completed OpenSpec work.

## What Changes

- Skip missing registered directories during integration initialization and snapshots, preserving their database records and strict execution admission.
- Remove the obsolete disposable workspace registration using the existing application workflow after inspecting its references.
- Correct the five relative Markdown links.
- Archive completed changes with their evidence; keep incomplete criteria and historical code/qualification counters separate.

## Capabilities

### New Capabilities

- `workspace-service-inventory`: Missing saved workspace directories do not disable unrelated integrations.

### Modified Capabilities

None.

## Impact

PrometheusIntegrationService inventory reads, existing workspace configuration, documentation and OpenSpec archives. No new API, dependency, migration, permission or public release.
