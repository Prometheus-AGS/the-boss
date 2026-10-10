# BAUAR testing handoff — 2026-10-10

The operator stopped further tests and dependency diagnosis and requested source
publication. Testing continues in the operator's other session. This handoff
does not certify completed desktop acceptance, signing, or release readiness.

## Publication and merge boundary

The complete source is retained on
`codex/bauar-release-integration-2026-10-09`. The acceptance implementation
checkpoint is `c2990da0497c500268a73b9a904e685fe04434ef`; prior BAUAR intake
and local payload checkpoints are `bda3715df5` and `7a5bdb4b7c`.

Fetched `origin/main` was `38d9be7524`. A fresh topic attempted to replay only
BAUAR commits, excluding earlier unrelated command-path commits. The intake
conflicted in ten files: the integration payload manifest, exact admission gate,
UAR AG-UI adapter, host MCP bridge, host tool admission, runtime connection,
sidecar service, approval controller, tool-name mapping, and shared integration
types. Current main has newer authority-provider/principal contracts, session
placement and instance routing, claim revalidation, and released payloads.
These conflicts require a deliberate forward port; accepting old code would
discard newer behavior. The replay was aborted normally, without resetting or
rewriting either branch. Publication preserves the full original source branch,
including its two earlier command-path commits, for the other session. Main
integration is not complete; no force push, architecture replacement, or new
forward-port implementation was attempted.

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
from source publication. No new tests, formatter, review, or certification gate
were run for this publication at the operator's direction.
