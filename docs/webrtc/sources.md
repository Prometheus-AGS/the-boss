---
description: Sources consulted for the cross-device sync and control design, grouped by topic with what each supported
---

# Sources

Retrieved 2026-09-26 with Firecrawl search and scrape. Dates are publication or release dates where the
source states one. Secondary sources are marked; claims resting only on them are treated as unverified in the
other documents.

## Transport

| Source | Supports |
| --- | --- |
| https://www.iroh.computer/blog/v1 | iroh 1.0 (2026-06-15), wire/API stability within v1, multipath, NAT traversal, ~95% direct traffic, public relay limits |
| https://www.iroh.computer/blog | Release history (1.0.1–1.1.0, security fixes), QUIC address discovery, mDNS improvements |
| https://www.iroh.computer/blog/iroh-0-98-0-getting-back-to-traversing-nats | Relay-stuck regressions fixed in 0.98 |
| https://www.iroh.computer/blog/iroh-dns | DNS / pkarr discovery |
| https://www.iroh.computer/blog/comparing-iroh-and-libp2p | iroh vs libp2p (vendor source) |
| https://www.iroh.computer/blog/shared-relays | Managed relay pricing (2026-09-08) |
| https://docs.iroh.computer/add-a-relay | Self-hosting `iroh-relay`; do not rely on public relays |
| https://docs.iroh.computer/languages , https://docs.iroh.computer/languages/swift | Official Swift/Kotlin/Node/Python bindings; iOS `-framework Network` |
| https://github.com/n0-computer/iroh-ffi | iroh uniffi bindings, xcframework build |
| https://kerkour.com/iroh-v1-p2p (secondary, 2026-06-24) | API walkthrough; relays cannot decrypt |
| https://crates.io/crates/iroh-docs , https://docs.iroh.computer/protocols/documents | iroh-docs 0.x status |
| https://arxiv.org/html/2604.12484v1 | libp2p DCUtR 70% ± 7.1% hole-punch success (2026-04) |
| https://github.com/libp2p/rust-libp2p/discussions/3458 | Maintainer comment on success rate |
| https://crates.io/crates/webrtc , https://github.com/webrtc-rs/rtc | webrtc-rs 0.21 on sans-IO `rtc`, pre-1.0 |
| https://github.com/algesten/str0m | str0m data channels, no TURN client, `catch_unwind` advice |
| https://developers.cloudflare.com/realtime/turn/faq/ , https://developers.cloudflare.com/realtime/sfu/pricing/ | TURN pricing |
| https://github.com/react-native-webrtc/react-native-webrtc/pull/1590 | react-native-webrtc New Architecture work in progress |
| https://github.com/tailscale/libtailscale | Embedded Tailscale option |

## Mobile platform limits

| Source | Supports |
| --- | --- |
| https://developer.apple.com/documentation/pushkit/pkpushtype/voip | VoIP pushes must report CallKit calls |
| https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app | Silent pushes throttled, not guaranteed |
| https://developer.apple.com/forums/thread/835645 | Priority-5 push throttling |
| https://developer.apple.com/videos/play/wwdc2025/227/ | Background suspension model |
| https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time | Background task grace period |
| https://github.com/isontheline/pro.webssh.net/issues/1278 (secondary) | Sockets die ~20 s after backgrounding |
| https://developer.android.com/develop/background-work/services/fgs/timeout | Android 15 `dataSync` 6 h / 24 h limit |
| https://developer.android.com/training/monitoring-device-state/doze-standby | Doze; FCM high priority for chat apps |
| https://firebase.google.com/docs/cloud-messaging/android-message-priority | High-priority downgrade without visible notification |

## Sync

| Source | Supports |
| --- | --- |
| https://loro.dev/blog/v1.0 | Loro 1.0, performance, shallow snapshot sizes |
| https://loro.dev/docs/tutorial/encoding | Stable encoding, export modes |
| https://docs.rs/loro/latest/loro/struct.LoroDoc.html | Version vectors, `export(updates)`, PeerID caution |
| https://loro.dev/docs/advanced/shallow_snapshot | Shallow snapshot limits |
| https://loro.dev/docs/tutorial/tips , https://loro.dev/docs/tutorial/composition | PeerID reuse and mergeable containers |
| https://loro.dev/blog/loro-protocol , https://github.com/loro-dev/protocol | Loro Protocol rooms; `%ELO` E2EE experimental |
| https://github.com/loro-dev/loro-ffi , https://github.com/loro-dev/loro-react-native | Bindings |
| https://automerge.org/blog/automerge-3/ | Automerge 3 memory reduction |
| https://github.com/alexjg/samod | samod status (work in progress) |
| https://docs.rs/yrs | yrs state-vector sync |
| https://archive.jlongster.com/using-crdts-in-the-wild | Actual Budget HLC + LWW over SQLite |
| https://www.evolu.dev/blog/scaling-local-first-software | Set reconciliation replacing merkle trees |
| https://github.com/wzhudev/reverse-linear-sync-engine (secondary) | Linear sync engine model |
| https://tech.anytype.io/any-sync/overview | any-sync spaces and ACLs |
| https://www.inkandswitch.com/keyhive/notebook/ , .../05/ , .../06/ | Keyhive / Beelay encrypted sync, Sedimentree |
| https://docs.rs/iroh-blobs/latest/iroh_blobs/ | BLAKE3 verified blob streaming |
| https://johnny.sh/blog/choosing-a-sync-engine-in-2026/ (secondary, opinion) | 2026 practitioner comparison |
| https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544 | Obsidian LWW conflict complaints |

## Control, identity, authorization

| Source | Supports |
| --- | --- |
| https://www.iroh.computer/blog/irpc , https://github.com/n0-computer/irpc | irpc streaming RPC, postcard encoding |
| https://capnproto.org/rpc.html | Cap'n Proto RPC levels |
| https://github.com/grpc/grpc-rust/issues/339 | gRPC over HTTP/3 not native |
| https://agentclientprotocol.com/protocol/v1/overview , https://agentclientprotocol.com/protocol/v1/schema | ACP session methods |
| https://agentclientprotocol.com/rfds/streamable-http-websocket-transport | ACP remote transport RFD |
| https://docs.ag-ui.com/concepts/events , https://docs.ag-ui.com/concepts/interrupts | AG-UI events and interrupts |
| https://github.com/a2aproject/A2A/blob/main/docs/specification.md | A2A task model |
| https://modelcontextprotocol.io/specification/2025-11-25/basic/transports | MCP streamable HTTP |
| https://code.claude.com/docs/en/remote-control | Remote control prior art: local execution, 5-minute dialog expiry |
| https://signal.org/blog/a-synchronized-start-for-linked-devices/ , https://signal.org/docs/specifications/sesame/ | Signal linked devices, Sesame |
| https://thehackernews.com/2025/02/hackers-exploit-signals-linked-devices.html (secondary) | Linked-device QR phishing |
| https://matrix.org/docs/guides/implementing-more-advanced-e-2-ee-features-such-as-cross-signing/ | Cross-signing key hierarchy |
| https://book.keybase.io/docs/teams/puk | Per-user key rotation on revocation |
| https://tailscale.com/docs/features/tailnet-lock | Locally verified node signing |
| https://docs.rs/spake2 | SPAKE2 for device pairing |
| https://www.biscuitsec.org/ , https://ucan.xyz/specification/ , https://github.com/cedar-policy/cedar | Capability tokens and policy engines |
| https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/ | Agentic threat categories |

## Rust core and FFI

| Source | Supports |
| --- | --- |
| https://napi.rs/docs/more/async-concurrency , https://napi.rs/docs/concepts/error-handling | napi-rs threadsafe functions, runtime lifecycle, panics |
| https://github.com/can1357/oh-my-pi/issues/4071 | `AsyncTask` panic aborts process |
| https://napi.rs/docs/more/support-compatibility | Node-API ABI stability |
| https://www.electronjs.org/docs/latest/api/utility-process | `utilityProcess` with native addons and crash events |
| https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules | Native modules in Electron |
| https://www.electron.build/docs/features/code-signing/notarization/ | Signing and `asarUnpack` |
| https://github.com/jhugman/uniffi-bindgen-react-native/blob/main/CHANGELOG.md | ubrn 0.31 status |
| https://jhugman.github.io/uniffi-bindgen-react-native/reference/nodejs.html | ubrn Node target status |
| https://github.com/smolcars/react-native-nitro-ark | Nitro C++ module over a Rust library |
| https://nitro.margelo.com/docs/types/callbacks , https://nitro.margelo.com/docs/types/array-buffers | Nitro callbacks and ArrayBuffers |
| https://github.com/leegeunhyeok/craby | Craby status |

## Repository survey (local, read-only)

- `mobile:docs/references/remote-access/*`, `mobile:packages/remote-protocol`, `mobile:packages/remote-transport`,
  `mobile:src/backend/services/desktopConnections/*`, `mobile:src/backend/services/remoteAgent/*`,
  `mobile:src/backend/data/db/schemas/*`
- `desktop:src/main/services/lanTransfer/*`, `desktop:src/main/features/apiGateway/*`,
  `desktop:src/main/data/db/schemas/*`, upstream branch `zhangjiadi225/lan-agent-remote-design`
