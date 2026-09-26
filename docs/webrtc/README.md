---
description: Cross-device sync and remote control design for The Boss desktop and the-boss-mobile (iroh transport, CRDT sync, shared Rust core)
---

# Cross-Device Sync And Remote Control

Status: **design, not implemented**. Researched 2026-09-26.

This directory is **identical in both repositories**:

| Repository | Path | Role in this design |
| --- | --- | --- |
| Mobile: `Prometheus-AGS/cherry-studio-app` (the-boss-mobile, Expo / React Native) | `docs/webrtc/` | Mobile host of the shared Rust core |
| Desktop: `Prometheus-AGS/the-boss` (The Boss, Electron) | `docs/webrtc/` | Desktop host of the shared Rust core; default always-on node |

Both copies carry the implementation plan for **both** sides so an agent working in either repository can
match its half against the other. Paths are always repository-qualified: `mobile:src/...` means
`cherry-studio-app/src/...`; `desktop:src/...` means `the-boss/src/...`. When one copy changes, apply the
same change to the other copy in the same working session; the files must stay byte-identical.

The directory is named `webrtc` because the work began as a WebRTC question. The recommended transport is
**iroh (QUIC with hole punching and relays)**, not WebRTC; WebRTC remains a documented fallback. See
[Research Report](./research-report.md) for why.

## Documents

| Document | Contents |
| --- | --- |
| [Research Report](./research-report.md) | Question, method, findings per area, options compared, decisions with evidence |
| [Architecture](./architecture.md) | System shape, the shared Rust core, responsibilities of Rust vs TypeScript, process layout on both platforms |
| [Protocol Specification](./protocol-spec.md) | Identity, pairing, roster, authorization, ALPNs, envelope, control methods, event streams, versioning |
| [Data Sync](./data-sync.md) | What syncs, per-scope mechanism, change-cursor protocol, transactional outbox and projection, deletes, restore, encryption |
| [Canonical Model](./canonical-model.md) | Synced entities and their field-by-field mapping to both apps' SQLite schemas |
| [Desktop Implementation](./desktop-implementation.md) | Work in `the-boss`: prerequisites, process model, files, owners, acceptance |
| [Mobile Implementation](./mobile-implementation.md) | Work in `cherry-studio-app`: native module, lifecycle, files, owners, acceptance |
| [Roadmap And Verification](./roadmap-and-verification.md) | Phases, spikes, exit criteria, risks, open decisions |
| [Adversarial Review](./adversarial-review.md) | Findings from independent reviewers and how the design changed |
| [Sources](./sources.md) | Every source consulted, with dates and what it supported |

## Decisions At A Glance

1. **Transport:** iroh 1.x endpoints inside a shared Rust core; peers addressed by Ed25519 key; direct QUIC
   with fallback to the account's own `iroh-relay` servers. WebRTC is a P5 option behind the transport seam
   (browser peers, audio/video). Operator decision OD-0.
2. **Control:** the existing upstream `agent.*` / `configuration.*` JSON-RPC methods, plus `jobs.*`,
   `files.fetch`, `skills.*`, `devices.*` and a kill switch, carried in signed envelopes that the Rust core
   verifies (roster, time, replay, grant, local policy, hardware step-up, home epoch) before the host executes.
3. **Who controls whom (v1):** every device controls desktops and headless nodes; phones are controllers and
   sync members, not execution targets, because mobile operating systems suspend background apps. OD-0b, OD-4.
4. **Identity:** master key held only as a recovery phrase → one admin key (v1) → device certificates in an
   append-only signed roster. Pairing by QR + SPAKE2 with codes confirmed on both devices. Private keys stay in
   hardware keystores and never reach JavaScript.
5. **Sync:** per-field last-writer-wins changes with hybrid logical clocks, delivered by per-origin change
   cursors; session messages replicated only from the session's home device; blobs by BLAKE3 hash. Each app
   writes a transactional outbox in its own database and applies projection batches through its own data
   layer. Loro documents arrive in P4 for collaborative text.
6. **FFI:** one protobuf byte bus over a C ABI. Desktop: napi-rs addon in an Electron `utilityProcess`.
   Mobile: C++ Nitro HybridObject linking the Rust static library. "Mostly Rust" means protocol, keys, security
   and sync in Rust; execution and database writes stay in the existing TypeScript runtimes. OD-0c.
7. **Reachability:** phones are never servers. A designated always-on device is the primary mailbox (mail
   sealed to the recipient) and requests user-visible pushes through a content-free push gateway.
