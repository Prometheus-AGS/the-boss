---
description: Wire-level specification for boss-link identity, pairing, roster, authorization, ALPN protocols, envelopes, control methods, event streams, mailbox and push
---

# Protocol Specification

Normative for both applications. "MUST" means both implementations reject or fail otherwise. Message
definitions live in `boss-link-proto` (`proto/boss/link/v1/`); the field lists below are the contract those
files implement. Scope marks: **[v1]** ships in phases P1–P3; **[P4]** is specified for later and MUST NOT be
enabled before its phase.

## 0. Versioning And Names

- **boss-link v1** is this protocol: ALPNs `boss/pair/1`, `boss/ctl/1`, `boss/sync/1`; envelope field
  `v = 1`; QR payload `t = "boss-link-pair"`, `v = 1`.
- **legacy remote-protocol v1** is the existing Noise-over-WebSocket LAN protocol in
  `mobile:packages/remote-protocol` / `mobile:packages/remote-transport`. It is not part of boss-link.
- A future incompatible change adds `boss/ctl/2` etc.; devices offer every ALPN they support.
- Every signature uses a context tag: `sig = Ed25519(key, context || 0x00 || payload)` with contexts
  `boss-link/envelope/v1`, `boss-link/roster/v1`, `boss-link/pair/v1`, `boss-link/push/v1`, `boss-link/push-request/v1`,
  `boss-link/stepup/v1`. The device identity key is also used by legacy v1; context tags prevent any
  cross-protocol reuse of a signature.

## 1. Keys And Identity [v1]

| Key | Type | Held by | Purpose |
| --- | --- | --- | --- |
| Master key (MK) | Ed25519 | **Nowhere at rest.** Derived from a 24-word recovery phrase shown once at account creation; used, then erased from memory | Certifies the admin key; re-certifies a replacement admin after loss |
| Admin key (ADK) | Ed25519 | The single admin device, non-exportable where the platform allows | Signs roster entries (device certificates, revocations, mailbox designation) |
| Device identity key (DK) | Ed25519 | Every device; the existing `remote-device-identity` key is reused | Signs envelopes; its public key is the **device id** |
| Endpoint key (EK) | Ed25519 | Every device | iroh endpoint identity (node id); rotatable without re-pairing |
| Agreement key (AK) | X25519 | Every device | HPKE recipient key for mailbox-sealed envelopes (§9) |
| Presence key (PK) | P-256 | Every device with a hardware keystore: Secure Enclave / Android StrongBox or TEE, created with "user presence / biometry current set" access control; macOS: Secure Enclave key with `userPresence`; Windows: Windows Hello `KeyCredentialManager` key; Linux: none | Step-up proofs (§6); the private key cannot be used without the user |

`account_id = BLAKE3(MK public key)`. Rules:

- Private keys MUST NOT cross the FFI boundary into JavaScript. The core reads and writes them through
  native keystore bindings compiled into the Rust/C++ layer (Apple Security framework, Android Keystore via
  JNI, OS keychain on desktop). The host only answers "user approved" prompts that the OS itself shows.
- The presence key MUST be a key the operating system refuses to use without the user present. A boolean
  prompt result (for example Electron `promptTouchID`) is never a step-up. Devices without such a key
  (Linux desktops, phones without a hardware keystore) cannot produce step-up approvals. At pairing, the
  admin records the platform attestation of PK (Apple App Attest, Android Key Attestation) in the certificate
  where available and shows "hardware-verified" or "not verified" to the user.
- A desktop whose only available secret storage is plaintext (Electron `safeStorage` backend `basic_text` on
  Linux) MUST NOT become the admin device and MUST warn the user.
- **Single admin in v1.** Exactly one device holds ADK. If it is lost, the user enters the recovery phrase on
  another enrolled device to certify a new ADK (`AdminReplaced`, §2.1). Multiple admin devices with per-admin
  keys are specified in §2.4 **[P4]**.
- **Recovery phrase handling.** The phrase is shown and entered only through secure input owned by the core:
  on mobile a native secure view in the Nitro module (secure text entry, autocorrect and suggestions off,
  screenshots blocked with `FLAG_SECURE` / hidden in the app switcher); on desktop an isolated window whose
  preload passes the words straight to the utility process over a dedicated MessagePort, with clipboard,
  logging and crash reporting disabled for that window. The host UI only receives `SecureInputRequest`
  progress, never the words. Residual risk: desktop renderer memory; recovery is rare and the window is
  destroyed immediately after use.

## 2. Roster

### 2.1 Entries [v1]

An append-only, strictly linear chain per account. Each entry has `seq` (starting at 0), `prev_hash`
(BLAKE3 of the previous entry), `issued_at_ms`, a type-specific body, and a signature.

| Entry | Signed by | Body |
| --- | --- | --- |
| `AccountCreated` | MK | MK public key, ADK certificate |
| `AdminReplaced` | MK | New ADK certificate, `invalidates_after_seq`, old admin `device_id` (revoked) |
| `DeviceAdded` | ADK | Device certificate (§2.2) |
| `DeviceUpdated` | ADK | Certificate replacement (new EK/AK/PK, changed grants, rename) |
| `DeviceRevoked` | ADK | `device_id`, reason |
| `MailboxDesignated` | ADK | Primary mailbox `device_id`, ordered standby list |
| `PushGatewayRegistered` | ADK | Gateway URL and registration id (§9.4) |

With one signer the chain cannot fork; a device receiving an ADK-signed entry whose `seq` already exists with a
different hash MUST stop accepting roster entries and alert the user (key compromise indicator).

`AdminReplaced` rules:

- Before signing, the recovering device fetches the highest roster head from every reachable peer and appends
  at `head + 1`. An MK-signed `AdminReplaced` is the one defined exception to the conflict rule: it supersedes
  any ADK-signed entry at the same or later `seq`.
- `invalidates_after_seq` invalidates ADK-signed `DeviceAdded`, `DeviceUpdated` and `MailboxDesignated`
  entries after that point. **`DeviceRevoked` entries are never invalidated:** any valid ADK-signed
  `DeviceRevoked` found at or after the superseded position (including on a branch learned later from a peer
  that was unreachable during recovery) is carried forward by the new admin as a new `DeviceRevoked`, and every
  device applies it on sight even before it is carried forward.
- After `AdminReplaced`, nothing signed by the old ADK is accepted except `DeviceRevoked`.
- The old admin's device certificate is revoked by the same entry.
- Every device alerts the user. The new admin cannot issue `DeviceAdded` or grant changes for 24 hours unless
  the recovery is confirmed from a second enrolled device.

### 2.2 Device Certificate [v1]

`{device_id (DK pub), endpoint_id (EK pub), agreement_key (AK pub), presence_key (PK pub, optional),
display_name, platform (ios|android|macos|windows|linux|headless), roles (subset of {controller,
executor, mailbox_capable, admin}), grants (bitset, §4), app_version_min, issued_at_ms}`.

### 2.3 Enforcement [v1]

- Every device MUST reject a connection on `boss/ctl/1` or `boss/sync/1` from an endpoint whose EK is not in
  a current, non-revoked certificate, before reading application data. `boss/pair/1` is exempt only while an
  invitation is active (§3).
- Revocation takes effect when the entry is verified: close the revoked device's connections, cancel every
  execution it started, resolve its pending interaction answers as denied, drop its mailbox items, and revoke
  its legacy remote-protocol v1 pairing if one exists.
- Every envelope carries the sender's roster `seq` (§6). A receiver whose roster is behind MUST fetch roster
  entries from the sender (or any peer) before executing the envelope.

### 2.4 Multiple Admins [P4]

Each admin device holds its own ADK certified by MK. The roster becomes a DAG with explicit multi-parent
`Merge` entries. On merge, every entry signed by a key revoked in either branch after its revocation point is
dropped; a revocation of one admin by another admin requires MK arbitration (recovery phrase) and freezes
admin operations until resolved; concurrent grant changes resolve to the narrower set. Not enabled in v1.

## 3. Pairing [v1]

1. The admin device shows a QR: `{v: 1, t: "boss-link-pair", account_id, inviter_endpoint_id, relay_urls,
   invitation_id, pairing_secret (128-bit), expires_at (≤ 2 min)}`. While the invitation is active the admin
   accepts `boss/pair/1` connections; otherwise that ALPN is refused.
2. The new device connects and runs SPAKE2 (`pairing_secret` as password, `invitation_id` as identity
   binding).
3. The new device sends its DK, EK, AK, PK public keys, name and platform, signed by DK with context
   `boss-link/pair/v1` over the SPAKE2 transcript.
4. **Both** screens show the same 6-digit code derived from the transcript and the new device's DK
   fingerprint. The admin screen additionally shows the name, platform and the grants about to be issued.
   The user confirms on both devices.
5. The admin appends `DeviceAdded` and returns the roster and the new certificate.
6. The invitation is single-use. A second connection attempt, a SPAKE2 failure or a confirmation mismatch
   aborts it; the admin shows why. Pairing attempts are rate-limited (3 per minute).

Legacy v2 invitations (`t: "cherry-studio-pair"`) remain valid only for legacy remote-protocol v1.

## 4. Grants And Local Policy [v1]

Grants are a bitset in the certificate, set by the admin at pairing and changed with `DeviceUpdated`.

| Grant | Allows | Phone default | Desktop default |
| --- | --- | --- | --- |
| `configuration` | Read provider/model configuration **without secrets** | on | on |
| `agent.control` | List agents/sessions, create sessions, send messages, cancel own executions | on | on |
| `agent.approve` | Answer tool-permission interactions; high-risk requires step-up | on | on |
| `jobs.control` | List, run, pause, cancel scheduled jobs on the target | on | on |
| `sync` | Participate in data sync scopes | on | on |
| `files` | Fetch blobs referenced by synced entities | on | on |
| `exec.shell` | Approve or start tools classified `shell` or `unknown-effect` | off | off |
| `secrets` | Receive opted-in provider secrets (sealed to AK) | off | off |

Evaluation on the target: `allowed = grant(action) AND local_policy(action, sender)`. Local policy is a
per-device setting that can only narrow (for example "never execute remote shell tools here"). **Tool effect
classification happens on the target** from its own tool registry; MCP annotations supplied by a server are
not trusted; a tool with no local classification is `unknown-effect` and treated as `shell`.

## 5. Transport And ALPNs [v1]

| ALPN | Purpose | Streams |
| --- | --- | --- |
| `boss/pair/1` | Pairing (§3) | One bidi stream |
| `boss/ctl/1` | Envelopes (§6), subscriptions (§8) | One bidi stream per request; one uni stream per subscription |
| `boss/sync/1` | Roster and data sync ([Data Sync](./data-sync.md)) | One bidi stream per sync session |

- Framing: `u32 big-endian length || protobuf`. Limits (receiver-enforced): frame ≤ 1 MiB; ≤ 32 concurrent
  streams per connection; ≤ 8 MiB buffered per connection; protobuf decode depth ≤ 32; ≤ 60 envelopes per
  minute per sender device outside sync; blob transfer ≤ 5 concurrent per peer.
- Blobs are transferred on `boss/sync/1` as chunked, BLAKE3-verified streams in v1 (no dependency on
  `iroh-blobs` while it is 0.x).
- Relays: production builds use only the account's configured relays (OD-2); n0 public relays are compiled
  out of production builds. If every relay is unreachable, only direct and LAN paths work.

## 6. Envelope [v1]

```text
Envelope {
  v: 1
  msg_id: ULID                   // idempotency key, unique per sender
  from_device, to_device: device_id
  roster_seq: u64                // sender's roster head
  home_epoch: optional u64       // required for session-targeted commands (§7.3)
  issued_at_ms, expires_at_ms
  nonce: 16 bytes
  body: oneof { RpcRequest{method, params_json}, RpcResponse{in_reply_to, result_json | error},
                Subscribe{...}, Unsubscribe{...}, Notify{...} (§9.3), DeliveryReceipt{msg_ids} }
  step_up: optional { presence_key_sig over BLAKE3(all fields above), context boss-link/stepup/v1 }
  sig: Ed25519(DK, context boss-link/envelope/v1, all fields above including step_up)
}
```

Receiver checks, in order; the first failure returns its typed error:

1. Signature valid; on a direct connection, the connection's EK belongs to `from_device`'s certificate.
2. `from_device` is in the roster and not revoked; if `roster_seq` is ahead of the local roster, sync the
   roster first.
3. `to_device` is this device, or this device is the designated mailbox for it (§9).
4. Time: `issued_at_ms ≤ now + 60 s`; `expires_at_ms - issued_at_ms ≤ 5 min` (≤ 2 min for interaction
   answers); `now ≤ expires_at_ms + 60 s`.
5. `msg_id` not in the journal. The journal keeps entries for 24 h (≥ maximum lifetime + skew). A duplicate
   returns the stored result.
6. Grant and local policy permit the method.
7. Step-up present and valid when required (high-risk approvals, `exec.shell`, `secrets`, `control.unlock`).
8. For session-targeted methods, `home_epoch` matches the session's current epoch (§7.3).
9. Hand the RPC to the host; journal the result.

## 7. Control Methods [v1 unless marked]

### 7.1 Method set

The existing upstream `agent.*` / `configuration.*` JSON-RPC methods
(`mobile:packages/remote-protocol/src/agent/methods.ts`) are carried unchanged as `RpcRequest.method` /
`params_json`, plus boss-link additions.

| Method | ACP analogue | Rule |
| --- | --- | --- |
| `agent.agents.list`, `agent.workspaces.list` | — | Target's catalog |
| `agent.sessions.list/get/create` | `session/new`, `session/load` | `create` makes the target the home |
| `agent.messages.send` | `session/prompt` | Returns `SESSION_BUSY` if a turn is active; the **home** writes the user message |
| `agent.executions.cancel` | `session/cancel` | MUST carry the `execution_id`; cancels only that execution |
| `agent.interactions.list/get/respond` | `session/request_permission` | `respond` MUST carry `request_digest` (§7.2) |
| `agent.sessions.subscribe`, `checkpoints.read`, `subscriptions.*` | `session/update` | Mapped onto `Subscribe` (§8); the JSON-RPC names remain for legacy v1 |
| `configuration.export.prepare/read` | — | Secrets stripped unless the receiver holds `secrets` and the provider is opted in |
| `devices.list`, `devices.status` | — | Roster view with presence and path (direct / relay) |
| `jobs.list`, `jobs.run`, `jobs.pause`, `jobs.cancel` | — | Target's scheduled jobs (desktop `job_schedule`/`job`, mobile `job`) |
| `files.fetch` | — | By entity id or blob hash only; never a filesystem path; resolved inside app-managed roots |
| `skills.list`, `skills.invoke` | — | Runs a skill on an executor device (remote-only skill placement) |
| `control.stop_all` | — | Kill switch (§7.4) |
| `control.unlock` | — | Unlock after quarantine: from the device's own UI, or — for headless nodes only — from the admin device with step-up |
| `devices.push_token.set` | — | Sent only to the primary mailbox; the sender may set only its own token; needs roster membership only |
| `sessions.transfer_home` **[P4]** | — | Moves a session's home; increments `home_epoch` |
| `chat.*` **[P4]** | — | Desktop topic chat control |

### 7.2 Approval binding

`request_digest = BLAKE3("boss-link/approval/v1" || home_device || session_id || interaction_id ||
tool_server_id || tool_name || effect_class || decision_scope || JCS(tool_input))`, where JCS is RFC 8785
canonical JSON and `decision_scope ∈ {once, session}`; `always` is not available remotely. The home rejects
an answer whose digest differs from the pending request (`DIGEST_MISMATCH`). The approval screen MUST render
the raw tool input from the request, not an agent-written summary.

Resolution: the first valid **deny** received before execution starts wins over any allow; otherwise the
first valid allow wins. All subscribers receive `interaction.resolved`. When an approval expires with no
answer, the home **pauses** the turn (it does not fail it) and re-raises the interaction on reconnect.

### 7.3 Home authority

Each session has `home_device` and `home_epoch` (synced metadata). Only the home executes turns and writes
the session's messages. Commands carry `home_epoch`; a stale epoch returns `NOT_HOME` with the current home.
In v1, only devices with role `executor` can be homes: desktops and headless nodes. Phones are controllers
(OD-4).

### 7.4 Kill switch

`control.stop_all` (every quarantine is announced on all devices so a misused kill switch is visible) cancels every execution on the target, resolves pending interactions as denied, and puts
the target in **remote quarantine**: it refuses all further remote `agent.*`, `jobs.*`, `skills.*` commands
until it is unlocked: locally from its own UI, or for a headless node by the admin device with step-up. It bypasses queues, is never
mailboxed (sent only over a live connection, or it fails visibly), and requires `agent.control`.

## 8. Event Streams [v1]

- The home's agent runtime produces events; the host hands them to the core, which assigns a gapless
  per-session `seq`, persists the event to its event log with fsync, and only then fans it out. The host keeps
  unacknowledged events until the core acknowledges them, so a core restart loses nothing.
- `Subscribe{session_id, from_seq}` returns a `subscription_id` chosen by the home. The home replays from
  `from_seq`, or returns `RESET_REQUIRED` with a checkpoint when the range was compacted, then streams live on
  a unidirectional stream.
- Token deltas are streamed but not retained after the message settles; settled messages are synced
  ([Data Sync](./data-sync.md)).
- A subscriber more than 256 KiB behind receives `RESET_REQUIRED`.
- `Notifications` subscriptions deliver device-level events (interaction pending, job finished) to connected
  controllers.

## 9. Mailbox And Push [v1]

### 9.1 Designation

The admin designates one **primary mailbox** (a device with role `mailbox_capable`, normally an always-on
desktop or headless node) and optional standbys via `MailboxDesignated`. Only the primary accepts mail; a
standby takes over only after a new `MailboxDesignated`.

### 9.2 Mail

- An envelope for a device that is not connected is sent to the primary mailbox **sealed to the recipient's
  AK** with HPKE (RFC 9180, X25519 / HKDF-SHA256 / ChaCha20-Poly1305); the mailbox stores ciphertext and
  routing metadata only.
- Per-sender quota: 1,000 items or 50 MiB; items are dropped at `expires_at`; delivered in `issued_at` order;
  deleted when the recipient returns a signed `DeliveryReceipt`.

### 9.3 Notify

Home devices send `Notify{target_device, category, ref}` envelopes (to the target, via the mailbox when the
target is offline) when a user-facing event happens (`approval_pending`, `job_finished`, `session_error`).
`Notify` carries no content beyond the category and an opaque reference.

### 9.4 Push gateway

- Devices send their push token to the primary mailbox in a `devices.push_token.set` RPC (not in the roster;
  tokens rotate).
- First registration: the admin sends the gateway the roster prefix from `AccountCreated` (MK-signed, carrying
  the ADK certificate) to the current head; the gateway verifies the MK → ADK chain and stores only
  `account_id`, MK public key, current ADK and the current primary mailbox DK. The admin records
  `PushGatewayRegistered` (a roster entry, signed by ADK with context `boss-link/roster/v1`; the registration
  request sent to the gateway is signed with context `boss-link/push/v1`) and sends the gateway every later
  roster entry that changes the admin, the mailbox or revokes a device. The
  gateway accepts push requests only from the currently registered primary mailbox's DK.
- Push request: `{account_id, device_id, push_token, category (allowlist), msg_id}`, signed by the primary
  mailbox's DK with context `boss-link/push-request/v1`; the gateway deduplicates by `msg_id`,
  rate-limits per account (60/min), and sends a user-visible APNs / FCM notification with generic text
  ("Action needed in The Boss"); device names never reach the gateway. Push tokens are stored only on the
  primary mailbox and travel in each push request; the gateway does not store them. The phone opens, connects, drains mail.

## 10. Errors [v1]

`UNAUTHENTICATED`, `DEVICE_REVOKED`, `GRANT_DENIED`, `POLICY_DENIED`, `STEP_UP_REQUIRED`, `EXPIRED`,
`CLOCK_SKEW`, `DUPLICATE` (with stored result), `ROSTER_BEHIND`, `NOT_HOME` (with current home and epoch),
`SESSION_BUSY`, `ALREADY_RESOLVED`, `DIGEST_MISMATCH`, `QUARANTINED`, `QUOTA_EXCEEDED`,
`UNSUPPORTED_VERSION`, `RESET_REQUIRED`, `LIMIT_EXCEEDED`, `INTERNAL`.
