# C14 BossFang MiniApp: Mac ARM64 operation

The Boss source `a09ba923b8` packaged BossFang native source
`e60d5a7321ada0c4f544eb21ca87067c68153e53` and UAR source
`1db1afb48b606e5a92057386dda4f8d19cbbf2c1`. The local
`pnpm build:mac:arm64` command completed and validated its signed app image and
mounted DMG. The build configuration disabled notarization.

Local DMG: `dist/The-Boss-2.2.11-mac-arm64.dmg`, 674,334,578 bytes,
SHA-256 `99f7d9b80581eddffda22ac95723c92c8ac779346bdd3a1395b424b497164da5`.

The packaged app was launched in a disposable profile. Through The Boss's
Launchpad, the BossFang MiniApp opened the embedded `/dashboard/`, completed
the native login, and saved the dashboard's `log_level` from `info` to `debug`.
The subsequent authenticated config read returned `debug`. The sidecar's
SurrealDB path remained inside the isolated application profile.

The local operation receipt is
`docs/plans/agent-fabric-convergence/.prometheus/cadence/artifacts/c14-operation-2026-10-04/boss-launch-11.json`
in the Agent Fabric Convergence worktree. This record is a local packaged-app
operation, not an installed Windows acceptance or a website publication.
Those outcomes remain separate gates.
