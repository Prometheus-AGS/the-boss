# Proposal

## Why

The public 2.2.41 installers predate Cherry Studio's current main branch and UAR 1.3.0. The next Boss release needs those sources together while retaining the fork's behavior and distributing verifiable installers.

## What Changes

- Merge Cherry Studio `upstream/main` at frozen commit `4558f53c963f7bd08412552e4c930ada9f0c09db` into the Boss release source.
- Pin UAR 1.3.0 to the fetched `origin/main` commit `774469746fee4de99be41dc1cd231857067e4487`, which is also the current `v1.3.0` tag target. Keep mini at its current latest `main` commit `1066ad4008f68bf0cc912573bf6496540ea93c27`.
- Produce UAR-enabled Windows x64, Mac ARM64, and Mac x64 installers through the existing native payload and serialized release workflows, then verify the public download records and landing page.

## Capabilities

### New Capabilities

None. This release uses the existing customer distribution contract.

### Modified Capabilities

None. The source revisions and release version change; the distribution behavior does not.

## Impact

Boss upstream integration, UAR source and native sidecar pins, release metadata, native payload artifacts, GitHub release records, and the public landing receiver. No new Boss public API or persistence migration is planned. UAR 1.3.0 is currently a prerelease source snapshot with product verification pending; Boss native packaging and operation provide integration evidence, not a claim that every UAR product gate passed.
