---
description: Implementation plan for boss-link in the-boss-mobile (Expo / React Native) — prerequisites, native module, lifecycle, controller role, files, owners and acceptance
---

# Mobile Implementation (`cherry-studio-app` / the-boss-mobile)

Team: `mobile:.agent-team/boss-mobile`. Owners: `boss-mobile-p2p` (boss-link crates and the cross-repo
contract), `boss-mobile-rust-ffi` (native link unit, Nitro module, builds), `boss-mobile-data` (outbox,
projection), `boss-mobile-runtime` (skill placement; phone-as-executor later), `boss-mobile-app` (device and
remote-session screens), `boss-mobile-release` (build pipeline), `boss-mobile-security` and
`boss-mobile-verifier` (gates).

## Prerequisites

- `mobile:native/` (single Cargo workspace and link unit), `mobile:modules/uar-runtime/` (Nitro module),
  `mobile:packages/uar-bridge/` and `mobile:scripts/rust/` do not exist yet. They are created by the embedded universal-agent-runtime work; boss-link joins them. If
  boss-link lands first, `boss-mobile-rust-ffi` creates both with boss-link as the first member.
- `boss-link` repository (OD-1) mounted at `mobile:native/boss-link` as a git submodule.

## Native Integration

| Piece | Location | Notes |
| --- | --- | --- |
| Rust crates | `mobile:native/boss-link` (submodule) | Member of the app's single static library; shares the one tokio runtime |
| Keystore bindings | inside `boss-link-keys` | Secure Enclave (P-256 presence key with biometry-current-set), Keychain for Ed25519/X25519 keys (`WhenUnlockedThisDeviceOnly`); Android Keystore / StrongBox via JNI. Keys never reach JS |
| C ABI | `boss-link-ffi` (`cbindgen` header) | `catch_unwind` on every export; never unwinds into C++ |
| Nitro module | `mobile:modules/uar-runtime/` — `BossLink` HybridObject (pure C++) | `start`, `send(ArrayBuffer)`, `setEventSink(callback)`, `pause`, `resume`, `stop`; events as native-owned ArrayBuffers via async callbacks |
| TS bridge | `mobile:packages/uar-bridge/src/boss-link/*` | Typed wrapper over generated `@boss-link/protocol` types |
| Builds | `mobile:scripts/rust/` | xcframework (arm64 device; arm64 + x86_64 simulator), `jniLibs` (arm64-v8a, x86_64) with 16 KB page alignment; link `-framework Network` on iOS |

## Services

| Service | Location (proposed) | Responsibility |
| --- | --- | --- |
| `BossLinkRuntime` | `mobile:src/backend/services/bossLink/` | Starts the core at bootstrap; maps AppState to `pause`/`resume`; registers the push token; forwards notifications |
| Connection routing | `mobile:src/backend/services/desktopConnections/*` | For roster peers use boss-link only (no legacy fallback); legacy v1 remains for desktops not enrolled in boss-link |
| Remote agent control | `mobile:src/backend/services/remoteAgent/*` | Same method semantics; transport moves to boss-link envelopes; the command journal moves into the core; `executions.cancel` carries `execution_id`; handles `SESSION_BUSY`, `NOT_HOME`, `QUARANTINED` |
| Outbox and projection | `mobile:src/backend/data/sync/*` + drizzle migration (`sync_outbox`, `sync_field_state`, `row_rev`, home fields) | Outbox rows in the same transaction as each synced write; projection batches in one transaction; quarantine for dangling references (for example `agent_session.agentId` is a RESTRICT foreign key) |
| Screens | `mobile:src/frontend/features/devices/*` | Scan QR, confirm code and fingerprint, device list with presence and path, grants view, kill switch; approval screen showing raw tool input |

All new copy is translated into every supported locale in the same change (`pnpm i18n:check`).

## Lifecycle

- **Foreground:** `resume` → rebind endpoint, reconnect to executors (direct or relay), drain mailbox, catch
  up sync, resubscribe open session streams from their last `seq`.
- **Background:** `pause` → flush `sync.db`, close subscriptions, close the endpoint, end the background task
  within the OS grace period. No background sockets.
- **Push:** a user-visible notification ("Approval needed on Studio Mac") opens the app; it connects, drains
  mail, and shows the pending interaction with the raw tool input. A high-risk approval requires the
  biometric prompt from the Secure Enclave / StrongBox presence key before the envelope is signed.
- **Locked phone:** keys are available only while unlocked, which matches the flow (approvals need the user
  anyway); nothing signs in the background.
- **Hot reload:** the core is a process singleton; `setEventSink` replaces the previous sink.

## Data Changes

- Sessions homed on other devices are persisted as read-only replicas (update
  `mobile:docs/references/remote-access/session-read-cache.md` when P3 ships).
- `sync.db` lives next to the main database and is excluded from backups; a restore sends `RestoreCompleted`.
- Desktop-only entities (stdio MCP servers, agents with local workspaces) project with
  `executable_here = false` and show which device runs them.

## Acceptance (mobile side)

- Pair with a desktop over cellular; both screens show the same code and fingerprint; the phone shows the
  desktop's name.
- Background the app mid-stream for 5 minutes; on return the session resumes from its last `seq` with no gaps
  or duplicates.
- App terminated, push arrives for a pending approval; opening it shows the exact tool input; approving with
  biometric succeeds; replaying the same envelope returns `DUPLICATE`; approving more than 3 minutes after the
  interaction was raised returns `EXPIRED` and the turn stays paused on the desktop.
- Edit an agent's name on the phone offline while desktop #2 edits its instructions; reconnect via the always-on
  node; all devices show both edits.
- Revoked phone: connections refused with `DEVICE_REVOKED`; local replicas remain, stop updating, and the UI
  says why.
