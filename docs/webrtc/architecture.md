---
description: System architecture of the shared Rust core for cross-device sync and control, with the Rust versus TypeScript split, control matrix and process layout on desktop and mobile
---

# Architecture

## System Shape

```text
            ┌──────────── one person's devices ────────────┐
  Phone ─┐                                               ┌─ Desktop (admin; primary mailbox; executor)
  Tablet ├── iroh QUIC (direct, or via own iroh-relay) ──┤─ Desktop #2 (executor)
         └───────────────────────────────────────────────┴─ Headless The Boss (optional executor / mailbox)

  Push gateway (stateless, content-free): primary mailbox → "notify device X" → APNs / FCM → user-visible notification
```

Every device runs the same Rust core, **boss-link**. It owns keys, the roster, transport, the security
checks on every command, the sync engine, the mailbox, and event sequencing. The host application (Electron
main process, or React Native JS) owns the UI, its own SQLite database, and execution (agent runtime, tools,
providers, jobs).

## Who Can Control Whom (v1)

| Controller → Target | Desktop / headless (executor) | Phone |
| --- | --- | --- |
| **Phone** | Yes: sessions (agent turns), approvals, jobs, kill switch | No (phones are not executors in v1) |
| **Desktop** | Yes: same controls, from the desktop "Remote devices" panel | No |
| **Headless** | Automation only (API), no UI | No |

Every device syncs data with every other device. Execution targets in v1 are always-on-capable devices,
because iOS and Android suspend apps in the background and cannot hold connections or run long turns
([Research Report](./research-report.md)). Phones become targets only when they can host sessions
(embedded universal-agent-runtime) **and** a session can move its home when the phone sleeps
(`sessions.transfer_home`, P4). This is decision OD-4 in [Roadmap And Verification](./roadmap-and-verification.md).

## Responsibilities

| Concern | Rust core (boss-link) | Host application (TypeScript) |
| --- | --- | --- |
| Keys | Generates and uses all keys through native keystore bindings; private keys never reach JS | Shows OS prompts that the keystore itself triggers |
| Roster, pairing | Verifies and appends entries; SPAKE2; SAS derivation | Pairing screens; user confirmation on both devices |
| Connections | iroh endpoint, relays, discovery, reconnect, `pause`/`resume` | Reports app foreground/background and network changes |
| Commands | Envelope signing and all receiver checks (signature, roster, time, replay, grant, policy, step-up, home epoch), journal, quarantine | Executes the approved RPC (existing remote-access handlers) and returns the result |
| Events | Assigns `seq`, persists, fans out, replays | Agent runtime produces events; UI renders them |
| Sync | Change log, cursors, merge, quarantine, blob index in `sync.db` | Writes `sync_outbox` rows in its own transactions; applies projection batches through its data layer |
| Mailbox, push | Stores sealed mail, requests pushes | Registers push token; shows notifications |
| Logs | `tracing` → `CoreEvent::Log` with secrets redacted | Forwards to the app logger |

The split rule: **Rust decides whether something may happen, delivers it exactly once and keeps sync
correct; TypeScript decides what it means and does it.** This is a deliberate reading of "mostly Rust":
protocol, security and sync logic are Rust on both platforms, while execution and database writes stay in the
existing TypeScript runtimes and data layers so there is one writer per database and no second agent runtime.
It is recorded as OD-0c for operator confirmation.

## Rust Workspace

One workspace consumed by both applications: a new repository `Prometheus-AGS/boss-link` (OD-1), mounted
in the mobile repository at `mobile:native/boss-link` (git submodule, matching the mobile team's repository
map) and consumed by the desktop build as a pinned git dependency.

| Crate | Contents |
| --- | --- |
| `boss-link-proto` | Protobuf definitions (`proto/boss/link/v1/*.proto`): envelopes, host bus, canonical entities, preference allowlist; generates Rust types and the TypeScript package `@boss-link/protocol` |
| `boss-link-keys` | Native keystore bindings (Apple Security framework, Android Keystore via JNI, desktop OS keychain) and the key hierarchy |
| `boss-link-identity` | Roster chain, certificates, grants, pairing (SPAKE2), step-up verification |
| `boss-link-net` | Transport seam and the iroh implementation (ALPN router, relays, discovery, limits) |
| `boss-link-sync` | Change log, HLC, cursors, merge rules, projection batching, quarantine, blob index |
| `boss-link-control` | Envelope checks, journal, event log and fan-out, mailbox, push client |
| `boss-link-core` | The actor that owns the tokio runtime and wires the crates; its only public API is the byte bus |
| `boss-link-ffi` | C ABI (`cbindgen`) with `catch_unwind` on every export — mobile |
| `boss-link-napi` | napi-rs v3 addon exposing the same bus — desktop |
| `boss-link-conformance` | Recorded envelope and sync transcripts that both apps' host adapters must pass in CI |

On mobile, `boss-link-core` + `boss-link-ffi` link into the app's single native Rust unit alongside embedded
universal-agent-runtime (one static library, one tokio runtime), following the mobile team's
`boss-mobile-rust-ffi` rule. `mobile:native/` and `mobile:modules/uar-runtime/` do not exist yet; they are
created by the UAR embedding work and are prerequisites for the mobile side.

## The FFI Bus

```text
boss_link_start(config_bytes) -> handle          // data dir, device name, relay urls, feature flags
boss_link_send(handle, host_command_bytes)       // HostCommand (protobuf)
boss_link_set_event_sink(handle, callback, ctx)  // CoreEvent (protobuf); idempotent, replaces previous sink
boss_link_pause(handle) / boss_link_resume(handle)
boss_link_stop(handle)
boss_link_free(buffer)
```

- `HostCommand` / `CoreEvent` are protobuf `oneof` messages with a `correlation_id`. Main variants:
  `HostCommand`: `Rpc`, `RpcResult`, `EmitEvents`, `OutboxRows`, `ProjectionAck`, `PairStart`, `PairConfirm`,
  `ApproveProposal`, `SetPolicy`, `SetPushToken`, `RestoreCompleted`, `ControlUnlock`.
  `CoreEvent`: `ExecuteRpc`, `RpcResponse`, `SessionEvent`, `EventsAck{session_id, up_to_seq}`,
  `ProjectionBatch`, `OutboxDrainRequest`, `OutboxAck{up_to_id}`, `ProposalPending`, `PairingState`,
  `RosterChanged`, `PresenceChanged`, `Notification`, `SecureInputRequest`, `Log`, `Fatal`.
- The core never blocks the caller; each host marshals events onto its JS thread (napi threadsafe function
  with a bounded queue; Nitro async callback with native-owned ArrayBuffers).

## Process Layout

### Desktop (Electron)

```text
main process (TypeScript) ── MessagePort ── utilityProcess "boss-link" ── napi-rs addon ── boss-link-core
     │                                                  └─ iroh endpoint, sync.db, mailbox, keys (OS keychain)
     ├─ remote-access handlers + agent runtime / UAR execute verified RPCs
     └─ DbService writes app data + sync_outbox in one transaction; applies projection batches
renderer ── IPC ── main (the UI never talks to the core directly)
```

The core runs in a `utilityProcess` so a native crash restarts the service, not the app. Nothing crosses the
MessagePort before it is durable on the sending side (outbox rows, unacknowledged events), so a restart
loses nothing.

### Mobile (Expo / React Native)

```text
React Native JS ── Nitro HybridObject "BossLink" (C++) ── C ABI ── boss-link-core (in the app's native Rust unit)
     │                                                             └─ keys via Secure Enclave / Keystore
     ├─ remote-agent client UI (controller)
     └─ data layer writes app data + sync_outbox; applies projection batches
AppState active → resume ; background → pause (flush, close endpoint, end background task)
```

## Device Roles

| Role | Held by (v1) | Duties |
| --- | --- | --- |
| `admin` | Exactly one device (normally the first desktop) | Pairing, grants, revocation, mailbox designation, push registration |
| `executor` | Desktops and headless nodes | Session homes; run turns, tools and jobs for remote controllers |
| `controller` | Every device | Drive sessions and jobs on executors within its grants |
| `mailbox_capable` | Always-on desktops / headless | Primary or standby mailbox when designated |

## Legacy LAN Protocol

The Noise-over-WebSocket protocol (legacy remote-protocol v1) stays available for LAN connections to
desktops that are not enrolled in boss-link. For a peer that is in the boss-link roster, the mobile app MUST
use boss-link and MUST NOT fall back to legacy v1. Enrolling a desktop in boss-link disables its legacy v1
listener, and it cannot be re-enabled while the desktop is enrolled; revoking a device in boss-link also revokes its legacy v1 pairing. Legacy v1 is retired
after both apps ship boss-link P3.
