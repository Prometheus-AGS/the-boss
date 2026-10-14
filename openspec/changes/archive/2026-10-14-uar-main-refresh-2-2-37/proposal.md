# Proposal

## Why

The operator requested shipping current merged UAR main after the source pointer advanced. Published 2.2.36 payloads remain at b4244aea; selecting a source alone does not update installed software.

## What Changes

- Build and package UAR 3e6af7c4 for Mac ARM64 and Windows x64 using immutable records.
- Release The Boss 2.2.37 with those actual payloads, complete a local Mac build and packaged operation, sign/notarize the public Mac installer, publish both installers and update the website.
- Preserve original releases, runtime configuration, other-session work and independent qualification markers.

## Capabilities

No host contract redesign or new host capability. This dependency and release operation opts out of delta specs. The UAR upstream MCP pre-approval capability remains governed by its own configuration contract; this release does not enable broader grants.

## Impact

Source/artifact manifests, package version, bilingual release notes, operation evidence, GitHub release metadata and landing website.
