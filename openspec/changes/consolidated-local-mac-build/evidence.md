# Local consolidated Mac build — 2026-10-11

- The Boss: version 2.2.33; packaging started from c09a1f595d. The normal mini packaging step generated the launch-selector update committed as 83d44fe9ac; no application code changed after packaging.
- UAR: main d4e819d1c0dfe9d12274299d52f1bd6c9c7cd95a. Zod 3.25.76 and A2UI typing repair; frontend typecheck and production bundle passed.
- Native sidecar: native Apple Silicon host, cargo build --release --locked --bin uar-sidecar --features server-full succeeded in 21m 02s. Native host output copied into the existing target-layout packaging path; no cross-architecture conversion. Dynamic dependencies are system libraries. The standard packager generated 12 files, archive SHA-256 f7bae7a13262b968eb316fe9bbe1dfd60c9e2e682070290637fb1460077e7fcf.
- Mini: 4956d2adc3a746b676d7574572886756b7916eba. Runtime/source provenance for other published native tools remains unchanged; they were not relabeled as newly compiled.
- First actual application build passed all production typechecks, then stopped at the missing 2.2.33 release-history entry. Added matching bilingual release notes; the second pnpm build:mac:arm64 invocation exited 0.
- Built-in validation verified DMG checksums, mounted contents, code signatures and the bundled UAR-enabled local image. Output: “Validated darwin-arm64 installer and uar-enabled-local application image”.
- Signed with the configured Developer ID identity. Local notarization and notarization validation were skipped; this is not a notarized public release.
- Launched dist/mac-arm64/The Boss.app with THE_BOSS_PROFILE_ROOT pointing to an isolated recovery-directory profile. Native UI observation showed the packaged file URL, Welcome to The Boss, and Set up LLM Providers. Quit through the application UI; process exited 0. No real user data was changed. This establishes launch, not full functional recertification.

## Artifact

- Path: /Users/gqadonis/Projects/prometheus/the-boss/dist/The-Boss-2.2.33-mac-arm64.dmg
- Bytes: 1883310971
- SHA-256: 5af36d19ac10496ad09134e868368f8bd4a609edda2f9994362bd82269c0d86c
- Logs: /Users/gqadonis/Projects/prometheus/phase-closeout-preservation-20261011/uar-local-sidecar-build.log and the-boss-local-2.2.33-build-attempt2.log.
- Companion ZIP also produced. No website or public release artifact changed.

## Cleanup

All 16 connected repositories were observed on main only with one primary checkout each. LibreFang has no open PRs. Generated active Cadence state was removed from active checkouts and preserved privately at /Users/gqadonis/Projects/prometheus/phase-closeout-preservation-20261011/archive/cadence-retirement-2026-10-11T14-48-35-355Z. Reusable skill implementation and historical specification/qualification evidence remain. No qualification counters were reset or advanced.

No unit or broad qualification suite ran. No new security behavior was introduced.

## Public customer release — 2.2.33

The operator subsequently authorized public Mac ARM64 notarization, Windows x64 packaging, GitHub Releases, and the live download site. This public release is separate from the local-profile DMG above.

- Mac installer source: 059279392e61458148d9519955497510be22503f. Native UAR payload reused the completed d4e819d1 build with its original archive checksum. GitHub build 38152425591 succeeded; metadata publisher 38154385026 succeeded.
- Windows installer source: 14bc4c2d1fcd65316dbb2aa3f961d4180080567f. Native Windows server-full build 38152295103 succeeded from d4e819d1c0dfe9d12274299d52f1bd6c9c7cd95a. Its archive is 130101057 bytes, SHA-256 7f010b859b81fe805b3c3a8aabf3874604737b62049239260c55f820916873bc. Windows installer build 38159439689 and publisher 38161332355 succeeded.
- The first Windows preparation attempt stopped before building because the edited release notes omitted the required Feature profile marker. Restoring the existing marker resolved it; only failed jobs were rerun. No native rebuild or application repair was required.
- Mac public DMG: 717407042 bytes, SHA-256 83153d30c36af24aaac061695ee2819a67d43faefda9172d5dcba598ab94c4b6. Developer ID signed and Apple notarized. Downloaded bytes matched; hdiutil verified and mounted the image; codesign --verify --deep --strict succeeded; stapler validate succeeded; spctl accepted it as Notarized Developer ID.
- Local notarized copy: /Users/gqadonis/Projects/prometheus/the-boss/dist/public-2.2.33/The-Boss-2.2.33-mac-arm64.dmg. The prior local-profile DMG was retained.
- Windows setup: 529860832 bytes, SHA-256 3a25683bbdc70d3cfd965df93bb1d4ad58faae6ac58675f7d26f4be390b8acf4. Unsigned. The publisher downloaded and verified the public installer size and checksum. Installed Windows operation is not claimed by this packaging receipt.
- Public release: https://github.com/Prometheus-AGS/the-boss/releases/tag/v2.2.33. Both immutable platform manifests preserve their actual source commits. RELEASES.md and release-manifest.json are committed on main (publication commit 470380d068).
- Mac Intel, Windows ARM64 and Linux were excluded from this build request. No Cadence state, extra worktree, or feature branch was created.
- Landing source: Know-Me-Tools/boss-landing-spot main d7d0f73816d6e4e0cb11b5700b8b048c4e7a7583 contains both 2.2.33 installers. Workflow 38161368397 verified the Windows public bytes and built the site; Lovable synchronized this source revision. The Mac link was already published in production. The final Windows website publication remains pending the operator unlocking the Mac for the authenticated publishing action; synchronized source alone is not a production deployment receipt.
