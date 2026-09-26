---
description: Implementation plan for boss-link in The Boss desktop (Electron) — prerequisites, process model, controller and executor roles, files, owners and acceptance
---

# Desktop Implementation (`the-boss`)

Team: `desktop:.agent-team/boss-core`. Suggested owners: `boss-desktop` (utility process, packaging, keychain),
`boss-runtime` (executor handlers, event production), `boss-data` (outbox, projection, tombstones),
`boss-renderer` + `boss-ux` (Remote devices panel, pairing screens), `boss-security` (gate), `boss-verifier`
(acceptance). Cross-repo contract owner: `boss-mobile-p2p` in the mobile team.

## Prerequisites

1. **Port the remote-access server.** `the-boss` `main` has no remote-access server
   (`desktop:src/main/services/` has no `remoteAccess/`; its only device-to-device transport is the legacy
   `lanTransfer`; pairing is the older HTTP flow in
   `desktop:src/main/features/apiGateway/`). The server the mobile app speaks to exists on upstream branch
   `zhangjiadi225/lan-agent-remote-design` (`src/main/services/remoteAccess/*`, `packages/remote-protocol`,
   `packages/remote-transport`, migration `0025_remote-access.sql`). Bring it in through the upstream process
   (`desktop:docs/contrib/upstream-merges.md`) on a `merge/upstream-*` branch:
   - Renumber the migration (`the-boss` already has `0025_organic_ultron.sql`).
   - Verify its agent handlers against the runtime The Boss actually ships, including the UAR runtime on
     `feat/uar-*`.
   - Estimate this separately; it is larger than the boss-link host adapter itself.
2. **Retire `lanTransfer`.** `desktop:src/main/services/lanTransfer/*` is unauthenticated, and its mobile
   receiver was reverted in the mobile repository (commit `796b7078`), so the "offline until the mobile side
   ships" UI in `desktop:src/renderer/services/BackupService.ts` has nothing to wait for. Remove both.
3. **Consume boss-link.** Add the `boss-link` repository (OD-1) as a pinned dependency and build
   `boss-link-napi` for darwin-arm64, darwin-x64, win32-x64 and linux-x64 in the integration-binary pipeline
   (`desktop:build/integration-sources.json`).

## Components

| Piece | Location (proposed; align with `desktop:docs/references/architecture/naming-conventions.md`) | Notes |
| --- | --- | --- |
| Native addon package | `desktop:packages/boss-link-node/` | Prebuilt `.node` files + generated `@boss-link/protocol` types; loaded only inside the utility process |
| Utility process entry | `desktop:src/main/services/bossLink/worker/entry.ts` | Owns one core handle; bridges bytes ↔ MessagePort |
| Lifecycle service | `desktop:src/main/services/bossLink/BossLinkService.ts` | Spawns and supervises the utility process (restart with backoff), routes `CoreEvent`s |
| Executor | `desktop:src/main/services/bossLink/executor.ts` | Maps verified RPCs to the remote-access handlers (`agent.*`, `configuration.*`) and new `jobs.*`, `files.fetch`, `skills.*`, `control.*`; enforces `SESSION_BUSY`, `execution_id` cancel, digest-bound approvals, pause-on-expiry |
| Event producer | Same module | Hands agent events to the core, keeps them until acknowledged |
| Controller client | `desktop:src/main/services/bossLink/controller.ts` | Lets this desktop drive sessions and jobs on other executors (desktop → desktop) using the same methods the phone uses |
| Outbox | `desktop:src/main/data/sync/*` + migration adding `sync_outbox` and `sync_field_state` | Written inside `DbService.withWriteTx` for every synced table; cascading deletes expanded into per-entity delete rows |
| Projector | `desktop:src/main/data/sync/projector.ts` | Applies `ProjectionBatch` in one transaction; HLC comparison against `sync_field_state`; quarantine of dangling references |
| Remote devices UI | Extend `desktop:src/renderer/pages/settings/DeviceConnectionsSettings/*` (or replace it; decide in P1) and add a "Remote devices" panel | Device list and presence, pairing QR + code confirmation, grants, revoke, mailbox designation, kill switch, open a remote session |
| Always-on setting | Settings: "Keep The Boss running as this account's always-on node" | Tray-only mode; makes the device `mailbox_capable` |

All new user-visible strings go through i18n with every locale translated (`desktop:AGENTS.md` i18n rules).

## Keys And Packaging

- Keys live in the OS keychain through the core's native bindings (macOS Keychain, Windows Credential
  Manager / DPAPI, Linux Secret Service). If only plaintext storage is available (`safeStorage` backend
  `basic_text`), the device cannot be admin and shows a warning.
- The presence key is an OS-gated key: a Secure Enclave key with `userPresence` on macOS, a Windows Hello
  `KeyCredentialManager` key on Windows. Electron `promptTouchID` or any other boolean prompt is not a step-up.
  Linux desktops have no presence key; step-up approvals must come from another device.
- The recovery phrase is shown and entered only in the isolated secure window described in
  [Protocol Specification](./protocol-spec.md) §1.
- `asarUnpack` the `.node` files; sign and notarize them with the app (hardened runtime).
- `panic = "abort"` in the addon is acceptable because the utility process contains it; every export still
  wraps `catch_unwind` so a `Fatal` event is emitted before exit.
- `exec.shell` grants and remote shell execution are off by default and need an explicit local-policy toggle.

## Acceptance (desktop side)

- Pair a phone off-LAN (phone on cellular, desktop behind home NAT): matching codes on both screens, grants
  shown on the desktop, roster replicated.
- From the phone on cellular: list agents, create a session homed on the desktop, stream tokens, approve a
  high-risk tool with biometric step-up, cancel a specific execution, trigger the kill switch; the desktop
  refuses further remote commands until unlocked locally.
- From desktop #2: open and drive a session homed on desktop #1.
- Kill the utility process during a stream: it restarts; the subscription resumes from its last `seq`; no
  event or outbox row is lost.
- Revoke the phone: connections close within one second; its running executions are cancelled; its pending
  approvals resolve as denied; its legacy v1 pairing is gone.
- Three devices (phone, desktop, desktop #2) edit different fields of one agent while partitioned, reconnect
  through the always-on node: all converge to the same field values (conformance test for relayed changes).
- Restore a backup: new incarnation; differences summarized to the user; no silent overwrite.
