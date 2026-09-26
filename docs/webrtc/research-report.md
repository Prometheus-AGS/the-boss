---
description: Research findings and evidence behind the cross-device transport, sync, control and FFI decisions
---

# Research Report

## Question

How should The Boss desktop (Electron) and the-boss-mobile (Expo / React Native) keep one person's data in
sync across every device they own, and let any instance control any other (run tasks, chat, approve tools),
from anywhere rather than only on the same network — with the logic in Rust and FFI carrying messages to
and from the TypeScript UI?

## Method

- Four isolated research threads (transport; CRDT sync; remote control, identity and authorization; Rust
  core and FFI) searched and scraped primary sources with Firecrawl on 2026-09-26. Threads could not see
  each other's findings. Every source is listed in [Sources](./sources.md).
- One read-only survey of the existing cross-device code in both repositories.
- The draft design was reviewed adversarially by reviewers who saw only the documents (see
  [Adversarial Review](./adversarial-review.md)).
- Claims marked **(unverified)** were not confirmed against a primary source and must be measured before
  they become commitments.

## What Already Exists

This design extends existing work; it does not replace it.

| Area | Mobile (`cherry-studio-app`) | Desktop (`the-boss`) |
| --- | --- | --- |
| Remote control protocol | `mobile:packages/remote-protocol`, `mobile:packages/remote-transport` (v0.1.0, mirrored from upstream via `desktop-sync-manifest.json`). JSON-RPC 2.0 over a WebSocket secured with Noise XX; methods `connection.*`, `pairing.*`, `configuration.*`, `agent.*` | The matching server exists only on upstream branch `zhangjiadi225/lan-agent-remote-design` (`src/main/services/remoteAccess/*`, migration `0025_remote-access.sql`); `the-boss` `main` still has the older HTTP pairing in `src/main/features/apiGateway/` |
| What works remotely | Phone lists desktop agents and workspaces, creates sessions, sends messages, cancels executions, answers approvals, streams events. Commands are idempotent by `commandId` (MMKV journal) | Receipts keyed by device + grant + command in `remote_command` (upstream branch) |
| Discovery and pairing | DNS-SD `_cherry-remote._tcp`, QR invitation v2 (2-minute lifetime), 6-digit confirmation, per-domain grants (`configuration`, `agent`), Ed25519 device identity in SecureStore `remote-device-identity` | Same on the upstream branch |
| Reach | LAN only; no relay, no NAT traversal | LAN only |
| Legacy | none | `desktop:src/main/services/lanTransfer/*`: unauthenticated one-way backup-zip push; the mobile receiver was reverted. Treat as dead |
| Data | Drizzle SQLite; chat is agent-session based (`agent`, `agent_session`, `agent_session_message`, `user_provider`, `user_model`, `mcp_server`, `preference`, `file_entry`, ...); UUIDv4/v7 ids; wall-clock timestamps | Drizzle SQLite; `topic` + `message` tree (`parentId`, single live root), `assistant`, `knowledge_*`, `note`, `agent*`, providers, preferences; mostly soft deletes; UUIDv4/v7 ids |
| Backup | Local full backup with replacement restore | Zip backups to WebDav / S3 / local with replacement restore |

Consequences for the design: the control vocabulary exists and is proven on Android; the gaps are reach
(off-LAN), multi-device identity, persistence of synced data (today the phone deliberately keeps remote
sessions in memory only), and data sync itself.

## Findings

### Transport

| Option | Evidence | Assessment |
| --- | --- | --- |
| **iroh 1.x** | 1.0 shipped 2026-06-15 with a stable wire protocol and API within v1; 1.1.0 on 2026-09-01. Endpoints addressed by Ed25519 key, ALPN-routed protocols, QUIC multipath (Wi-Fi ↔ cellular), QUIC NAT traversal, relay fallback, DNS/pkarr discovery, optional mDNS. n0 reports about 95% of traffic flowing directly (a traffic share, not a connection success rate). Official Swift/Kotlin/Node bindings; Rust supports iOS and Android. Self-hosted `iroh-relay` is stateless with built-in ACME; n0's public relays are rate-limited and not for production. | **Chosen.** One Rust stack on every platform, no signaling server, identity = key. Risks: companion crates (`iroh-blobs`, `iroh-gossip`, `iroh-docs`) are still 0.x; no published iOS battery / background / IPv6-only-cellular measurements (unverified); 0.98 fixed relay-stuck regressions, so pin and test versions. |
| WebRTC data channels (`webrtc`/`rtc`, `str0m`, libdatachannel) | `webrtc` 0.21 now layers on the sans-IO `rtc` core, still pre-1.0; `str0m` is sans-IO, server-oriented, has no TURN client and recommends `catch_unwind`. All need signaling + STUN + TURN (Cloudflare TURN: 1,000 GB/month free, then $0.05/GB). react-native-webrtc's New Architecture support was still in progress. | **Fallback** behind the transport trait if browser peers or audio/video become requirements. |
| rust-libp2p | Large-scale IPFS measurement (2026-04): DCUtR hole punching 70% ± 7.1%; maintainers call the rate lower than they would like; complex configuration. | Rejected: lower yield and higher complexity for devices owned by one person. |
| Embedded Tailscale (`libtailscale`) | C wrapper over Go `tsnet`; mature relays. | Rejected: Go runtime inside the apps and a separate account/control plane. |

Mobile platform limits (these shape the architecture more than the library choice):

- iOS suspends backgrounded apps; sockets die roughly 20–30 seconds after backgrounding.
- iOS silent pushes are throttled and never guaranteed; VoIP (PushKit) pushes must report a CallKit call or
  the app is killed — unusable for data wake-ups.
- Android high-priority FCM messages are downgraded unless they produce a user-visible notification;
  Android 15 limits `dataSync` foreground services to 6 hours per 24 hours and requires a user-initiated start.
- Therefore: **a phone can never be an always-reachable peer.** Traffic to a phone is queued on an always-on
  node and announced with a user-visible notification; the phone syncs while in the foreground.

### Sync

| Option | Evidence | Assessment |
| --- | --- | --- |
| **Loro** | Rust-native; format stable since 1.0; Map, List, MovableList, Text, Tree, Counter; version-vector export (`export(updates(&vv))`), snapshots and shallow snapshots (history GC). Pitfalls: a PeerID must never be shared by concurrent writers; concurrent child-container creation under one map key needs the mergeable APIs. Loro's own E2EE room type is experimental. | **Deferred to P4** for collaborative text; v1 entities rarely conflict at text level, and per-session PeerIDs and shallow-snapshot GC add cost (see [Adversarial Review](./adversarial-review.md)). |
| Automerge 3 + samod | Automerge 3 cut memory >10×; `samod` (Rust repo layer) self-describes as not for serious use yet. | Rejected for now; revisit when `samod` stabilizes. |
| Yjs / yrs | Mature state-vector sync; types aimed at text editing. | Fallback if rich-text editor interop matters. |
| Row-level LWW + HLC (Actual Budget pattern) | Actual syncs SQLite via per-cell LWW messages ordered by HLC; Evolu found set reconciliation cheaper than a merkle tree at scale. | **Chosen** for all v1 entities (per field), delivered by per-origin change cursors. |
| Append-only log | Linear and similar engines sync immutable ordered deltas. | Replaced by home-authoritative settled rows: message rows are mutable while a turn runs, and only the session home writes them. |
| Keyhive / Beelay (Ink & Switch) | Encrypted, access-controlled sync with continuous group key agreement; pre-alpha. | Not adopted; its epoch-key idea is reserved for hosted encrypted storage (P5). |

Prior-art failures to avoid: cr-sqlite is effectively unmaintained; Obsidian Sync's last-writer-wins plus
conflicted copies produces bad merges; a merkle-tree-only design did not scale for Evolu.

### Remote control, identity and authorization

- **Agent protocols.** Agent Client Protocol (ACP) has the closest method set for driving a remote agent
  session (`session/new|load|prompt|cancel`, `session/request_permission`, streamed `session/update`);
  its remote transport is still an RFD. AG-UI defines the event vocabulary for rendering (text chunks, tool
  call start/args/end/result, state snapshots/deltas) and models approvals as interrupts. A2A is task
  delegation between agents. The existing upstream `agent.*` methods already map one-to-one onto the ACP
  concepts (see [Protocol Specification](./protocol-spec.md)), so the design keeps them.
- **RPC.** `irpc` (n0) provides typed RPC and streaming over iroh with postcard encoding, but postcard is
  not self-describing; schema evolution across app versions is safer with Protocol Buffers. Cap'n Proto's
  Rust RPC implements only level 1. gRPC over QUIC is not native in tonic.
- **Identity prior art.** Matrix cross-signing (master → self-signing → devices), Keybase per-user-key
  rotation on device revocation, Tailscale Tailnet Lock (nodes accepted only if signed by a trusted key,
  verified locally), Signal linked devices (QR with ephemeral key; abused in 2025 by phishing QRs, so
  pairing screens must show exactly what is being authorized), `spake2` crate for PAKE pairing.
- **Authorization.** Biscuit tokens are public-key verifiable, attenuable offline, carry revocation ids and
  Datalog checks; UCAN is comparable; Cedar is a local policy engine. Command replay protection needs a
  nonce, an expiry window and deduplication.
- **Threats.** OWASP Agentic Top 10 (2026): tool misuse, identity/privilege abuse, insecure inter-agent
  communication, human-agent trust exploitation. Claude Code Remote Control prior art: execution stays
  local, short-lived credentials, approval dialogs expire after 5 minutes.

### Rust core and FFI

- **Electron.** napi-rs v3 addons: threadsafe functions for event push (bounded, non-blocking, weak so they
  do not hold the event loop), no automatic cancellation of Rust futures, panics in `AsyncTask` abort the
  process. Electron `utilityProcess` hosts native addons with MessagePorts and reports crashes, giving
  isolation from the main process. `.node` files must be unpacked from asar and signed for notarization.
- **React Native.** Nitro HybridObjects can be pure C++ and link a Rust static library through a C ABI
  (prior art `react-native-nitro-ark`); callbacks are async onto the JS thread; native-owned ArrayBuffers
  pass zero-copy. `uniffi-bindgen-react-native` is active (0.31.0-6, 2026-09-25) with async and callbacks,
  and a new Node target that is not yet Electron-ready. Craby is pre-1.0.
- **Lifecycle.** Keep one core per process, idempotent sink registration for hot reload, explicit
  `pause`/`resume` tied to app foreground state, `catch_unwind` on every exported function.

## Decisions

These are the decisions after [Adversarial Review](./adversarial-review.md); the review changed D3, D4 and D5
from the first draft.

| # | Decision | Chosen | Main reason | Revisit when |
| --- | --- | --- | --- | --- |
| D1 | Transport | iroh 1.x, own relays | One Rust stack, key identity, no signaling service | Browser peers or audio/video needed → WebRTC transport (P5) |
| D2 | Control vocabulary | Existing `agent.*` / `configuration.*` JSON-RPC + boss-link additions, in signed envelopes | Implemented and verified on Android; upstream-compatible | Upstream changes the method set |
| D3 | Identity | Recovery-phrase master key → single admin key (v1) → device certificates; linear signed roster | No shared signing key, no forks in v1 | Multiple admins (P4) |
| D4 | Authorization | Grant bitset in certificates + target-side local policy and effect classification; hardware step-up | Simple, verifiable offline, cannot be widened remotely | Delegation needs (then Biscuit) |
| D5 | Sync | Per-field LWW + HLC with per-origin cursors; home-authoritative messages; BLAKE3 blobs; transactional outbox | Correct under relaying; matches real schemas | Collaborative text (Loro, P4) |
| D6 | Execution | Home-device authority with `home_epoch` fencing; executors are desktops and headless nodes | No double execution; phones sleep | Session home transfer (P4) |
| D7 | FFI | Protobuf byte bus over C ABI; napi-rs in `utilityProcess`; Nitro C++ on mobile | Same surface on both platforms; crash isolation | Typed bindings worth a second binding system |
| D8 | Schema | Protocol Buffers → prost + TypeScript; field patches only | Safe evolution across app versions | — |
| D9 | Reachability | Designated primary mailbox + content-free push gateway | Mobile OS limits | — |
