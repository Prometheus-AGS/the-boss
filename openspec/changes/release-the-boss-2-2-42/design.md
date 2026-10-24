# Design

## Context

See `proposal.md`. The Boss 2.2.41 source is committed at `53ab40651bfe223b0d5db724787dff091bf4fabe`. Cherry Studio `upstream/main` was fetched and frozen at `4558f53c963f7bd08412552e4c930ada9f0c09db`. UAR `origin/main` and the current annotated `v1.3.0` tag both resolve to `774469746fee4de99be41dc1cd231857067e4487`. The mini remote remains at the commit already pinned by Boss. The primary Boss and UAR checkouts contain unrelated work and are not release workspaces.

## Goals / Non-Goals

**Goals:** Merge upstream without losing Boss behavior; publish one UAR-enabled release for Windows x64, Mac ARM64, and Mac x64 from a frozen Boss commit; confirm each public download against its manifest.

**Non-Goals:** Modify UAR source, claim UAR's pending full product verification is complete, or infer installed-device acceptance from a successful package build.

## Decisions

1. **Use isolated Boss worktrees and an actual upstream merge.** The merge writer resolves upstream conflicts and reviews Boss-specific behavior against 2.2.41. A separate writer prepares UAR pins and release metadata; combine and review both sets before committing the final release source. This avoids overwriting the dirty primary checkout.
2. **Pin UAR by the fetched main commit.** The user selected the latest main source; it currently matches the v1.3.0 tag. All three native sidecar records, the integration source map, and the local source descriptor must identify this exact revision and version. Do not follow later remote movement mid-release.
3. **Keep the mini source fixed.** Remote `main` still matches the existing Boss mini pin. No mini checkout files or gitlink need to change unless a later source comparison disproves that identity.
4. **Use the existing payload and installer workflows.** Build the three UAR binaries from the frozen source, package immutable sidecar records, refresh the integration payload, then build the three installers with the UAR-enabled profile. The default Mac signing and notarization requirements remain in force. Publish only after the native jobs and manifest checks pass.
5. **State evidence limits.** The UAR v1.3.0 GitHub release reports failed Docker publication and pending product verification. A successful Boss release establishes these three desktop packages and the exercised installed-app paths. It does not retroactively qualify the UAR container or unexercised capabilities.

## Risks / Trade-offs

- **Upstream changes affect Boss-specific behavior** → Review branding, UAR IPC and approval boundaries, packaged skills, data migrations, and release workflows against the pre-merge source; repair observed incompatibilities before publication.
- **UAR 1.3.0 native compilation or sidecar operation fails** → Stop publication at the failed platform, retain the actual failure, and repair only a scoped observed defect at a newly frozen source.
- **Distribution or landing verification fails** → Keep the previous 2.2.41 release available and do not describe 2.2.42 as fully distributed until all three public records match.

## Migration Plan

Merge and review source, pin UAR 1.3.0, produce sidecar and integration payload records, complete Boss source checks, build and package the three installers, publish through the serialized release workflow, and verify the landing receiver and public downloads. The previous release remains the rollback path.
