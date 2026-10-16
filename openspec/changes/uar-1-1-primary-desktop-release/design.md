# Design

## Context

Approved source update: UAR v1.1.0 d815ef72; current main91a091d6 adds only documentation/evidence. Stable release container receipts support unchanged protocol behavior but cannot qualify native Mac/Windows binaries. At assessment the mini pin52a84e7d matched remote main. The completed release selects mini 0c6b6e4c2a7ee849f55570f6d5ec2bb7d4961f7a after the observed launcher corrections, recorded without rewriting that earlier baseline. No unrelated upgrades are included.

## Decisions

- Keep The Boss's native /api/uar/runs flow and scoped host bridge. The separate AG-UI interrupt API was already present at the baseline; adopting it is not an update prerequisite. No speculative adapter rewrite.
- Build only UAR's complete server-full native payloads, retaining all policies, local embeddings and dependent libraries. Use exact source exports/caches without creating new branches/worktrees or disturbing another session's checkout. One writer per build directory.
- Retain existing configured providers/models, shared memory and authenticated identity. Optional new restricted MCP destination policies and protected skill roles apply only when configured; do not silently grant or remove authority.
- Reuse passing 2.2.38 and older operation evidence only for unchanged source/dependency/operation clauses. Preserve its original candidate, actual platform and limitations. Only current runtime/payload effects and genuinely missing primary-desktop outcomes enter the new candidate queue.
- Preserve the historical 66-row qualification inventory and the uncommitted prior planning proposal. No blanket checkbox completion or new delivery count. Store this release's source/evidence/applicability independently.
- Complete production wiring and required packaging sources before compilation or product verification. Native payload compilation and final installers form the release boundary, not per-edit checks. Fix only observed failures and repeat affected gates.
- Build local Mac once with pnpm build:mac:arm64 and operate its installed package. Publish the resulting identified artifact or clearly distinguish local/public artifacts. Build Windows once on its native runner; build/publication is not native installed acceptance.
- Publish selected ready installers without waiting for unavailable native Windows acceptance. Existing release/publication tools and landing receiver remain the mechanism. Linux, Intel Mac and Windows ARM64 are excluded. Notarization remains skipped; preserve signing and immutable versions.

## Ownership and completion

Lead: planning, Boss manifests/version, serialized publication/site, commits and evidence accounting. Runtime member: isolated UAR native inputs/build/package outputs, no Boss source edits. Desktop/skills member: retained-evidence applicability and minimal production operation procedure; observed source repairs require explicit disjoint assignment. Independent reviewer activates after complete wiring.

Code for this update is tracked separately from original 61/61 and 20/20. Qualification records source/applicability, Mac operation, Windows package and actual installed acceptance as separate states. An unavailable protected qualification driver or Windows environment stays pending; do not invent privileged renderer interfaces or operator approval. Only satisfied original requirements may later be archived.

## Risks

Persisted MCP hydration now refuses storage/decoding failure and respects an empty saved catalog: operate the configured retained-settings path. Native build may expose target-specific dependency failures: repair only a demonstrated build blocker with exact source provenance. No source repair or container evidence is relabeled as a native pass. Preserve original failures and do not rerun passing container acceptance.

## Completed-boundary adjustments

The private-profile operation demonstrated shell startup-file writes escaping into the real home directory; the existing private-path registry now supplies an isolated shell home. Full and mini launcher 1.2.9 forward that profile and read its session-data DevTools endpoint. These scoped fixes do not change the normal user profile, runtime owner or API. The full local Mac build was followed by one mini-only repackage of unchanged compiled application output; the superseded package and failures remain preserved. Native full-run inference succeeded through the normal BossFang UI. Qualification remains partial and is recorded separately from source completion and publication.
