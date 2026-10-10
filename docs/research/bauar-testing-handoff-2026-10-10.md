# BAUAR testing handoff — 2026-10-10

The operator stopped further tests and dependency diagnosis and requested source
publication. Testing continues in the operator's other session. This handoff
does not certify completed desktop acceptance, signing, or release readiness.

## Publication and merge boundary

The complete source is retained on
`codex/bauar-release-integration-2026-10-09`. The acceptance implementation
checkpoint is `c2990da0497c500268a73b9a904e685fe04434ef`; prior BAUAR intake
and local payload checkpoints are `bda3715df5` and `7a5bdb4b7c`.

On 2026-10-10 the operator explicitly authorized resolving all conflicts in PR #70
and merging it into main, while keeping tests deferred. The bounded merge starts
from PR head `4da8eae9d29843a100e8a1d7f5f3ed20c9081e66` and main
`38d9be7524a2719a0aa060943aaf4ce61af3282a`. It has fifteen conflict paths:
two payload/source manifests, nine runtime/admission/shared-contract paths, and
four preboot/path/command-path files (including the preboot README).

Resolution preserves main authority-provider/principal identity, instance routing,
session placement, catalog ownership, claim revalidation and released payload
provenance while adapting BAUAR admission, approvals, projections and supporting
scenarios to those contracts. Desktop resolution retains current private-profile
startup and command installation behavior. Required caller changes are part of
this merge; unrelated features and dependency upgrades are outside its scope.

The four published UAR payloads and local source manifest retain source
`308aea46ff26e7f61340281bb51f67ebe5351569` from main. UAR PR #368 merged
at `fe77af32d38cc1ffcd0fdf5c34336943825e000d`; that newer source is not
represented as the source of existing binaries. The receiving testing session
must choose/build its actual candidate and bind fresh artifact/source evidence.
No new build, installer, dependency download, test, formatter, runtime gate or
release certification runs for this merge. Static source/caller inspection and
Git conflict/publication checks do not establish runtime acceptance.

The Compass graph returned no match for UarHostToolAdmission with incomplete
coverage; graph freshness metadata was absent. Bounded source inspection supplies
caller/interface evidence. A fresh-context native gpt-6-astra/high verifier
completed a bounded static review with no merge-specific critical finding and
recorded the protocol-v1 artifact dependency below as a release warning. This
is a same-family fallback, not cross-model or runtime certification. Automated
sycophancy screening was unavailable; the report was manually screened.
Runtime quality gates remain deferred; no protected-branch checks are bypassed.

## Delivered behavior

The BAUAR intake supplies scoped host tool admission, exact approval identities,
projected MCP credentials, and UAR connection/approval lifecycle handling. The
application owns MCP credential configuration; a user's agent JWT is not the
remote MCP server credential.

`THE_BOSS_PROFILE_ROOT` now selects existing private filesystem roots before
configuration and logging initialize. Invalid selections emit a fixed, nonsecret
stderr message and exit with status 2. Omitting the variable preserves existing
profile selection. This is filesystem isolation, not a macOS Keychain sandbox.

The packaged acceptance gate uses the actual loaded ASAR main directory and
bundled server-full sidecar for its package claim. Instrumented storage and
post-ack cases remain separate supporting fixtures. Diagnostic evidence excludes
raw secrets, logs, screenshots, traces, and videos.

## Required sidecar version before acceptance

Static inspection found a concrete dependency: published UAR source
`308aea46ff26e7f61340281bb51f67ebe5351569` advertises admission protocol 1
and has no native-consumption endpoint or executionKind contract. This source
merge preserves BAUAR admission protocol 2, exact approvals and the native/host
execution distinction. Those v1 bundles cannot exercise the merged v2
admission path. Unsupported admission must refuse rather than downgrade.
Both source versions advertise administration schema 5 and the same admission
capabilities without an admission-version discriminator. Existing capability
checks cannot detect this difference before catalog synchronization; a v1 server
rejects the protocol-v2 host admission at run admission. No pre-write fail-fast
capability or successful packaged execution is claimed.

Before runtime acceptance or shipping this integration, the receiving session
must build/select real server-full protocol-v2 artifacts from UAR
`fe77af32d38cc1ffcd0fdf5c34336943825e000d` or a compatible newer source.
Then update actual platform artifact URLs, source revisions, sizes and SHA256
evidence together using the existing packaging workflow; update the local
source selection accordingly. Do not point the existing binaries at the new
source revision or claim that a rebuild already happened. Until then, source
merge is complete but packaged BAUAR runtime acceptance is blocked by the
version dependency. Binary publication and release certification are not part
of this conflict-resolution task.

## Results actually obtained

- Node 24.11.1 and pnpm 12.3.4 completed `pnpm run build` and
  `pnpm exec electron-builder --mac --arm64 --dir --publish never` through the
  existing locked/pinned packaging hooks. The unsigned macOS ARM64 directory
  package completed at 2026-10-10T01:41:04Z; source was based on Boss checkpoint
  `7a5bdb4b7c02e9f13875fc7f837815c03fe3dacd` with the acceptance changes.
- Actual ASAR SHA256 was
  `db8c54fd55384b0024bb1a0fd9ccdb746e7484f2ea0fa33bbb1072923c08801f`.
  The bundled UAR SHA256 was
  `9f91874091f8241d97209fd21b8c0c5b79ae6cdeb82ee0e873a5ea4540a8adea`,
  bound to UAR source `84ca0ffff5da8fafc1e2e7f5585efc07a396b14e`.
- Desktop acceptance did not pass. Five invalid-profile controls completed, but
  D01 stalled before sidecar creation while native Keychain access was observed
  during async safeStorage initialization. A consent dialog, permission error,
  or product deadlock was not confirmed. The owned attempt was stopped and its
  processes cleaned up. Subsequent desktop scenarios remain unverified.
- A later retry stopped before launching Electron: the recorded Playwright
  1.62.1 CLI and the candidate's entire `node_modules` directory were absent
  after environment cleanup. No dependency restoration or further test followed
  the operator's stop instruction. No cleanup-related absence proves a source
  defect. The previously successful package is historical evidence, not proof
  that the newly merged main tree has been built.

## Resume testing in the other session

Restore the existing locked dependencies and required local test artifacts using
the repository's pinned tools; do not upgrade dependencies. Package and bind a
fresh candidate from the merged source rather than reusing old digest claims.
Run `tests/e2e/gates/bauarPackagedAcceptance.test.ts` through its real gate
configuration with newly bound private roots and supporting fixture references.
The phase coordinator supplied those references; this document contains no
secrets or machine-private configuration.

If a legitimate The Boss Keychain request appears, handle it locally. A private
profile does not isolate native Keychain. Do not substitute plaintext encryption
or claim success from a timeout, bypass, or diagnostic observation. Complete D01
through D04 and the remaining phase checks before asserting acceptance. Default
profile compatibility, signing/notarization, installed execution, Windows, and
remote multi-user certification remain outside the observed package result.

The retained phase evidence includes `boss-package-02.json` (SHA256
`bad64b7f8a29ea58f4d9adf259a4f4a3673ff0a20d1ef23f525df03b409172e6`)
and `desktop-startup-environment-diagnosis-01.json` (SHA256
`a3c84688af8e725aefcbcea5e2e8df83b17d70e52bb152d84733613a3fa84178`).
Private profiles, binaries, logs, and local evidence are deliberately excluded
from source publication. No new tests, builds, formatter or runtime
certification gate ran for this merge at the operator's direction. The bounded
static review does not certify completed execution or packaged acceptance.
