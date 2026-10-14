# Proposal

## Why
C15.3 requires a cross-harness handoff to preserve canonical task identity, selected source and evidence hashes, Karpathy references and scoped memory provenance. Current packets retain Git HEAD/dirty state and unstructured reference strings only.

## What Changes
- Extend the existing handoff-create, inspect and handoff-accept flow with versioned, credential-free provenance.
- Capture explicitly selected file identities and existing scoped memory records without copying source content, memory content or native authority.
- Preserve legacy packets, atomic acceptance, immutable prior history and stale-task refusal.
- Ship identical shared source/compiled modules and instructions in full and mini, then package the mini revision in The Boss.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- agent-team-management: structured lossless handoff provenance and destination inspection.

## Impact
Creator handoff/types/validation/CLI and its canonical read seam; handoff instructions and generated Node modules; The Boss bundled skill pin and actual packaged CLI operation. No new scheduler, permissions, runtime endpoint or dependency. This bounded delivery contributes only the handoff part of C15.3; reviewed plugin-lock/host-grant coverage and whole-task completion remain open.
