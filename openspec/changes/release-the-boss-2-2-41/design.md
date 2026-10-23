# Design

## Context

See `proposal.md`. The public Boss release is 2.2.40. An isolated committed Boss branch already merged Cherry Studio through `41c240712e` and pinned mini `1066ad4008`; the newly fetched upstream `main` is `909214f68d`. UAR v1.2.3 is the annotated release tag resolving to `c4a656251b`; it publishes an immutable container image and acceptance records, but no Boss native sidecar archives. The existing UAR sidecar workflow supports Windows x64, Mac ARM64, and Mac x64 tags. The landing domain currently resolves and serves the site.

## Goals / Non-Goals

**Goals:** Preserve the committed Boss integration while merging the remaining upstream delta; use one frozen source revision per dependency; deliver a complete three-platform 2.2.41 release with traceable native payloads and landing records.

**Non-Goals:** Change UAR's public wire contract, modify UAR 1.2.3 source, alter application persistence, or certify installed-device behavior from build success alone.

## Decisions

1. **Use an isolated Boss worktree based on the committed October 22 integration branch.** This retains its reviewed custom-code merge and mini update while leaving the user's dirty primary checkout and another chat's worktree intact. Merge the remaining `41c240712e..909214f68d` upstream delta there, then review Boss-specific files against the pre-merge baseline before integrating to `main`. Starting again from 2.2.40 would duplicate the completed large merge and increase conflict risk.
2. **Pin UAR by the released commit, not by a moving branch.** `build/integration-sources.json` and the local UAR source descriptor must agree on `c4a656251b643bd83c8f1407286480dbfac76708` and version 1.2.3. Publish native sidecar records from that exact commit for all three selected platforms. The UAR repository's verification lock requires a fresh exact operator instruction before commands that trigger its sidecar builds; source inspection and Boss changes can proceed meanwhile.
3. **Use the existing immutable payload and serialized installer workflows.** Import only sidecar records whose source, version, platform, archive, and checksum match the pins. Regenerate the integration payload for the frozen mini/UAR source set, then set Boss version and customer targets to 2.2.41 and the three requested platforms. The UAR-enabled release profile stays selected for every installer. A non-UAR Mac x64 installer would not satisfy this release contract.
4. **Keep publication atomic at the release boundary.** The workflow may stage native assets privately, but it makes the release public only after all selected builds and byte/hash checks pass. The landing receiver then updates each platform; verify both its generated records and the live page. Releasing another version is the rollback path for a published binary; historical release records remain immutable.

## Risks / Trade-offs

- **Upstream conflict changes custom behavior** → Review branding, UAR lifecycle, approval/auth boundaries, packaged skills, and release workflow changes against the pre-merge Boss source; resolve only observed conflicts.
- **Mac x64 UAR sidecar has a distinct embedding feature set** → Use the sidecar workflow's declared `server-full,tract-embeddings` lane and require its native packaging record before installer publication.
- **UAR verification lock or missing distribution credentials blocks native sidecars** → Keep the Boss release unpublished until the exact UAR build-trigger instruction and native records exist; do not relabel the UAR container image as a desktop sidecar.
- **Landing synchronization or DNS fails** → Retain GitHub release evidence and leave live-site acceptance open until all three links and checksums are observed publicly.

## Migration Plan

Freeze fetched revisions; merge and review upstream in isolation; pin and package the three UAR sidecars; regenerate immutable integration payloads; run the completed Boss source gate and three native installer builds; publish the serialized release; verify the landing receiver and public links. The previous 2.2.40 release remains available throughout.
