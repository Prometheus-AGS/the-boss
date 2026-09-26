---
description: Phased delivery plan, spikes, exit criteria, risks and operator decisions for boss-link cross-device sync and control
---

# Roadmap And Verification

## Phases

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **P0 Spikes** | (a) iroh endpoint in the Nitro module on a real iPhone and Android phone, cellular ↔ home NAT, plus a corporate network; (b) napi-rs addon in an Electron `utilityProcess`, signed and notarized, keys in the OS keychain; (c) Secure Enclave / StrongBox presence-key signing from Rust; (d) protobuf codegen shared by both apps; (e) desktop remote-access server port estimate | Direct vs relay ratio over 20 attempts per network pair; connection setup time; static-library size delta per architecture; idle and active battery cost over 1 hour; utility-process crash/restart; all numbers recorded in this directory |
| **P1 Reach** | Desktop remote-access server port; boss-link keys, single-admin roster, pairing, grants, envelopes with all receiver checks, `boss/ctl/1` carrying `agent.*` + `jobs.*`, event streams with durable `seq`, kill switch and quarantine, two self-hosted relays; desktop → desktop controller | Desktop and mobile acceptance items for control pass on real devices; security gate has no open CRITICAL or HIGH finding |
| **P2 Offline** | Primary mailbox with HPKE-sealed mail, `Notify`, push gateway with registration, approval-from-notification with step-up, pause-on-expiry | Approval from a terminated app via push on iOS and Android; expired mail never delivered; duplicate push suppressed |
| **P3 Sync v1** | Outbox + projection on both apps; scopes `config`, `prefs`, `agents`, `sessions` (metadata LWW + home-authoritative settled messages), `jobs`, `files` + blobs, `secrets` (opt-in); cursors; quarantine; active-roster GC; restore incarnation; `min_reader_version` | Three-device partition test converges; restore test passes; version-skew test degrades to read-only; mobile replica documented |
| **P4 Extended** | Multiple admins (per-admin keys, roster DAG); `sessions.transfer_home`; phones as executors; `chat` scope and `chat.*` control; Loro Text for agent instructions, notes and knowledge | Each item has its own design review before implementation |
| **P5 Optional** | WebRTC transport behind the seam (browser peers, audio/video); hosted encrypted backup with epoch keys | Only with a product requirement |

## Verification Rules

- Unit tests prove merge rules and envelope checks; they are not completion evidence for a phase.
- Each phase closes on real devices and real networks (cellular ↔ residential NAT, two separate NATs, a
  network that forces relay), with commands and results recorded.
- **Three-device tests are mandatory** for sync (phone + two desktops, partitioned, reconnecting only through
  the always-on node). Two-device tests cannot reveal relayed-change bugs.
- `boss-link-conformance` replays recorded envelope and sync transcripts; both apps' host adapters run it in
  CI. A change to the canonical model or protocol updates the transcripts in the same change.
- Security gate (both teams' security roles) reviews each phase before exit.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| iroh direct-path rate, battery or binary size worse than reported | Relay cost, battery complaints, app size | P0 measurements gate P1 |
| Desktop remote-access server port is larger than expected | P1 slips | Separate estimate in P0; port through the upstream process |
| Projection bugs corrupt app data | Data loss | Projection only through data layers; transactional outbox; quarantine; backup before first enable; three-device tests |
| Remote tool execution abused via a compromised device | Code execution on a desktop | Target-side effect classification, `exec.shell` off by default, digest-bound approvals, hardware step-up, deny-wins, immediate revocation with cancellation, kill switch with quarantine |
| Single admin lost with no recovery phrase | Cannot add devices | Recovery phrase confirmation at account creation; P4 multiple admins |
| iroh companion crates change | Rework | v1 avoids `iroh-blobs`/`iroh-docs`; blobs over `boss/sync/1` |

## Operator Decisions

| Id | Decision | Recommendation |
| --- | --- | --- |
| OD-0 | Transport: iroh instead of WebRTC; browsers would only reach devices through relays | Accept; WebRTC stays a P5 option behind the transport seam |
| OD-0b | Control scope in v1: phones and desktops control desktops and headless nodes; phones are not controlled | Accept for v1; revisit in P4 |
| OD-0c | Meaning of "mostly Rust": protocol, keys, security checks and sync in Rust; execution and database writes in the existing TypeScript runtimes | Accept |
| OD-1 | Where the Rust workspace lives | New repository `Prometheus-AGS/boss-link`; submodule at `mobile:native/boss-link`; pinned dependency on desktop |
| OD-2 | Relays | Two self-hosted `iroh-relay` servers in different regions with access control; n0 public relays compiled out of production |
| OD-3 | Push gateway | Small stateless service operated by Know Me Tools holding APNs/FCM credentials; no content |
| OD-4 | Phones as session homes | Not in v1; P4 with `sessions.transfer_home` |
| OD-5 | Secrets sync | Off by default; opt-in per provider; `secrets` grant; sealed per device |
| OD-6 | Admin device | One admin (first desktop) in v1; multiple admins in P4 |
