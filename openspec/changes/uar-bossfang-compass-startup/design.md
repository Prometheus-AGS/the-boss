# Design

## Context

The existing instance inventory persists identities, protected credential references and selection; managed UAR already reports an effective port. BossFang has its own startup preference and instance binding. See the proposal for the observed startup failure.

## Goals / Non-Goals

Use the existing supervisor and inventory, preserve session bindings, and avoid credentials or work before compatibility verification. Do not start or stop an external process, migrate existing sessions, or publish a release.

## Decisions

The managed sidecar receives a user-selected directory under existing managed settings, defaulting to application data. Directory preparation is performed by the host before launch. The selected runtime is resolved asynchronously so a pending choice does not block the app lifecycle. BossFang receives that same verified binding before its own launch. Existing credential storage and validation remain authoritative; an unauthenticated response alone does not establish compatibility.

Integration source and payload manifests must describe the exact built bytes. A source revision change without matching artifacts is not a packaged release. UAR 1.4.0-rc.1 is tagged at 59abbfffea343fb4570a99afb1c4b55b94287076 but its release has no binary assets at planning time.

## Risks / Trade-offs

- Existing UAR discovery may identify an old incompatible server → present the incompatibility and require explicit selection or managed fallback.
- Binary and source metadata can drift → preserve existing payload until actual platform artifacts and checksums are available.
- A selected directory may be unwritable → fail visibly without deleting user data.

## Operator-requested main refresh — 2026-10-29

The operator subsequently requested a fresh UAR main build and a local main checkout for connected verification. The Boss now pins exact main commit `8c95b85abe807752d18350cc2edb9462a98c6928`, which still declares version `1.4.0-rc.1`. This is a main snapshot after the release tag, not the tag artifact. The requested local checkout remains on main with existing edits preserved; payload builds use the clean pinned build cache. Only darwin-arm64 is being rebuilt here; other platform payload availability and verification remain separate.

## Startup follow-up on The Boss 2.2.45

The release supersedes the earlier payload pins above with UAR 1.4.0-rc.3 and Compass 0.4.2. The Boss probes port 1906 without credentials. A protected listener that withholds its discovery documents can be registered manually with the runtime identity and protected credentials. Selection verifies the declared endpoints and runtime capabilities, then checks the separate administration key through a read-only route.

For an external runtime that advertises host assertion, The Boss checks its own assertion on the read-only capabilities route. The exact `principal_mismatch` refusal means the launch credential already carries a bound owner. Subsequent requests use that credential's owner. Other refusals stop admission. A managed runtime continues to use The Boss's host assertion. BossFang uses the resolved endpoint generation and credential for new work. Previously admitted runs retain their original binding and authority.
