# Design

## Context

UAR main 3e6af7c4 is merged; its primary checkout also contains unrelated uncommitted work. Native run38534534540 uses isolated exact-source CI checkouts. Only Apple Silicon and Windows x64 are release targets.

## Goals / Non-Goals

Deliver the updated packaged runtime and preserve selected model, BossFang delegation and memory behavior. Other platforms, broader portfolio qualification, architecture changes and new approvals are outside this change.

## Decisions

Reuse the existing native artifact/cache packaging workflow; retain actual source/hash provenance and immutable public records. Root owns version, local application build/operation, installer workflow and website. Native worker owns payload manifests and publication. Serialize local build and metadata publication. Finish production inputs before the local pnpm build:mac:arm64 and normal UI operation. Operate fresh prompt/follow-up/cancellation with the selected configured target and check saved settings and existing shared-memory readiness; retain applicable historical memory evidence rather than launching another approval cycle. Mac signing occurs in release CI. The operator explicitly deferred notarization for this release; the workflow defaults to notarization for future releases and records the actual signing status.

## Risks / Trade-offs

Native Windows installed operation remains pending unless actually observed. A local operated build and public signed artifact retain distinct identities. No source changes may consume the other session's dirty UAR work. New MCP pre-approval remains opt-in; no protected tool grant is changed for this release.
