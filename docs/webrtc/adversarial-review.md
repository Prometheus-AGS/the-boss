---
description: Findings from three independent adversarial reviews of the boss-link design and how each changed the design
---

# Adversarial Review

The first draft of this design was reviewed on 2026-09-26 by three reviewers who saw only the documents
(and, read-only, both repositories):

- **Defect critic** — consistency, completeness, implementability, repository facts.
- **Security gate** (`boss-mobile-security`) — keys, pairing, roster, authorization, remote execution. Verdict
  on the draft: **BLOCK** (3 critical findings).
- **Distributed-systems red team** — sync correctness, failure modes, control semantics, scope. Checked
  claims against the repositories and primary sources.

The current documents are the revised design. The table records every material finding and its resolution.

## Sync Correctness

| Finding | Severity | Resolution |
| --- | --- | --- |
| LWW manifest `{entity → max_hlc}` loses a field changed by a third device at an older HLC when relayed through the always-on node | Blocker | Replaced by per-origin change cursors `{(device, incarnation) → max_seq}`; relays forward original origin and sequence ([Data Sync](./data-sync.md) "Sync Protocol"); mandatory three-device tests |
| Canonical model unspecified; two schemas would diverge | Blocker | New [Canonical Model](./canonical-model.md) with field-by-field mapping from both schemas |
| `RecordChange` after commit plus wall-clock `updated_at` anti-entropy misses changes and hard deletes | Blocker | Transactional `sync_outbox` in each app's database; cascades expanded to per-entity deletes |
| Session messages are mutable rows with divergent status enums and device-local columns; two writers would duplicate user messages | Blocker | Home-authoritative settled rows with `row_rev`; only the home writes; canonical `MessagePart` with `unsupported` passthrough; local-only columns listed |
| Projection batches fail on foreign keys (RESTRICT) and retry forever | Blocker | Dependency-ordered batches, null for dangling optional references, per-entity quarantine |
| Desktop message tree has a locally generated virtual root row | Blocker (P4) | Root never synced; `root_id = UUIDv5(topic_id)` fixed now for P4 |
| Reinstall reuses the device key but restarts sequence numbers | Blocker | `origin_incarnation` per `sync.db` |
| Loro with random PeerID per session grows version vectors per launch; shallow-snapshot GC blocked by offline devices | Major | Loro removed from v1; per-field LWW for v1 entities; Loro Text in P4 for collaborative text |
| HLC "clamp" rewrites received timestamps and breaks convergence | Major | Never rewrite; quarantine far-future changes; bound local clock advance |
| GC waits for every roster device forever | Major | Active roster (seen within 90 days); stale devices re-seeded |
| Full-row writes from older clients erase newer fields | Major | Field patches only; `min_reader_version` per scope makes older clients read-only |

## Security

| Finding | Severity | Resolution |
| --- | --- | --- |
| Step-up was a sender claim | Critical | Hardware presence key (Secure Enclave / StrongBox P-256) in the certificate; step-up is its signature over the envelope hash; biometric result never passes through JS |
| One self-signing key shared by all admin devices; revocation did not rotate it | Critical | Single admin in v1 with its own admin key certified by a master key that exists only as a recovery phrase; `AdminReplaced` invalidates the old admin; per-admin keys in P4 |
| Roster fork resolution applied both branches with a grindable tiebreak | Critical | v1 chain has one signer and cannot fork; a conflicting entry is treated as compromise; P4 DAG rules drop entries signed by revoked keys and require master-key arbitration |
| A phone could both prompt and approve; "first respond wins" let an auto-approver beat the user | High | Target-side effect classification, unknown = shell, `exec.shell` off by default, hardware step-up for high risk, deny wins before execution |
| `files.fetch` resolved filesystem paths | High | Entity ids and blob hashes only, inside app-managed roots |
| Private keys crossed into JS | High | Native keystore bindings in the core; plaintext-only desktops cannot be admin |
| Legacy v1 fallback bypassed grants and revocation | High | No fallback for roster peers; revocation removes v1 pairing; enrolled desktops disable the v1 listener |
| Revocation raced mailbox and control paths | High | Envelopes carry `roster_seq`; receivers sync the roster first; revocation cancels executions and denies pending answers |
| Configuration export could leak API keys | High | Secrets stripped unless `secrets` grant and per-provider opt-in |
| Approval digest covered only tool input | Medium | Domain-separated digest over home, session, interaction, server, tool, effect class, scope and JCS input; `always` not available remotely |
| Expiry, skew and journal retention were sender-controlled | Medium | Receiver caps lifetime, 60 s skew, 24 h journal |
| Mailbox could read mail; any device could be a mailbox; epoch-key claim was hollow | Medium | Designated primary mailbox; HPKE sealed to recipient; quotas; epoch keys removed from v1 |
| Push gateway trusted a stale roster | Medium | Admin-signed registration renewed on mailbox change and revocation; category allowlist; rate limits; dedupe |
| Pairing raceable within the QR window; unauthenticated ALPN | Medium | ALPN open only while an invitation is active; single attempt; code and fingerprint confirmed on both devices; rate limits |
| No resource limits | Medium | Frame, stream, buffer, decode, rate and blob limits in [Protocol Specification](./protocol-spec.md) §5 |
| Secrets in logs and FFI events | Medium | Redaction; revocation lists secrets to rotate |
| Kill switch only cancelled | Medium | Quarantine until local unlock; never mailboxed |
| Cross-protocol reuse of the device key | Medium | Context tags on every signature |
| n0 public relays in production | Low | Compiled out of production builds |

## Scope And Coverage

| Finding | Resolution |
| --- | --- |
| "Any instance controls any other" had shrunk to phone → desktop without saying so | Control matrix in [Architecture](./architecture.md); desktop → desktop controller added; phones as targets deferred with reason (OD-0b, OD-4) |
| Jobs and non-agent chat not covered | `jobs` scope and `jobs.*` methods in v1; `chat` scope and `chat.*` in P4 |
| "Mostly Rust" silently reinterpreted | Stated as OD-0c for operator confirmation |
| Operator asked for WebRTC | WebRTC steelmanned in the review; iroh kept for native peers; browser implications stated as OD-0 |
| Desktop remote-access server does not exist on `main` | Made a P1 prerequisite with its own estimate |
| Workspace location contradicted the mobile repository map; mobile native directories do not exist yet | Separate repository mounted at `mobile:native/boss-link`; prerequisites listed |
| Pairing contradicted the roster-only accept rule | `boss/pair/1` exempt only while an invitation is active |
| Mailbox trigger, push-token source, multiple always-on nodes undefined | `Notify` envelope, `devices.push_token.set`, primary/standby designation, delivery receipts |
| Cancel and send races | `execution_id` required; `SESSION_BUSY`; pause on approval expiry; `home_epoch` fencing |
| Event `seq` lost across utility-process restart | Core persists before fan-out; host keeps events until acknowledged |
| Translations for new screens | Both implementation documents require every locale |
| Section references and version labels inconsistent | Versioning section added; references corrected |

## Second Round

The revised design was reviewed again by the security gate and a consistency critic. The security gate
returned **BLOCK** on the revision with one new critical and three new high findings; all were resolved below.

| Finding | Severity | Resolution |
| --- | --- | --- |
| Sync scopes let any device write MCP stdio commands, tool-approval mode, provider endpoints and job templates on an executor, bypassing `exec.shell`, step-up and approvals | Critical | New field class **P** (protected): remote changes become proposals approved locally on the executor; narrowing changes apply automatically; widening changes also need `exec.shell` + step-up; synced stdio servers arrive disabled and untrusted ([Data Sync](./data-sync.md) "Protected fields") |
| `AdminReplaced` could resurrect revoked devices, halt the roster, and leave the old admin enrolled | High | Fetch highest head first; defined exception to the conflict rule; revocations never invalidated; old admin revoked; alerts and a 24-hour hold unless confirmed from a second device |
| Recovery phrase passed through JavaScript | High | Core-owned secure input (native secure view on mobile; isolated window on desktop) with logging, clipboard and screenshots disabled |
| Desktop presence key could be a boolean Touch ID prompt | High | OS-gated keys only (Secure Enclave `userPresence`, Windows Hello key); boolean prompts are never step-up; attestation recorded at pairing; Linux cannot give step-up |
| Legacy listener could be re-enabled on an enrolled desktop | Medium | Cannot be re-enabled while enrolled |
| Kill switch quarantine could not be undone on headless nodes; misuse invisible | Medium | Admin-with-step-up unlock for headless nodes; every quarantine announced on all devices |
| Push gateway registration and token storage undefined; device names leaked | Medium | MK → ADK chain verified at first registration; roster updates forwarded; tokens only on the mailbox; generic notification text |
| Message status values violate each app's CHECK constraint (mobile has no `paused`; desktop has no `cancelled`/`interrupted`) | Critical (consistency) | Nearest local value plus a `canonical_status` column so the canonical value round-trips |
| Outbox and event acknowledgements missing from the FFI bus | High | `OutboxAck`, `EventsAck`, `ProposalPending`, `ApproveProposal`, `SecureInputRequest` added |
| Job-run authority undefined | High | `executor_device` is the run's authority |
| Third pass: phones applied protected fields directly although they run agents and HTTP MCP tools; MCP `disabled_tools` and `env` were not protected; provider settings could carry base URLs; a revocation on an unreachable peer's branch could be lost during admin recovery | High | Protected-field proposals on every device that runs anything; MCP `disabled_tools` P; `env` and `headers` X + P; `provider_settings` and `api_features` P; step-up signatures defined for sync changes; revocations carried forward after `AdminReplaced` and the old admin key rejected |
| Missing method, projection order and prerequisite paths; wrong repository claims | Medium/Low | `devices.push_token.set` added; `secrets` and `prefs` ordered; nonexistent mobile paths listed as prerequisites; desktop settings path corrected |

## Deferred By Decision

Multiple admins, session home transfer, phones as executors, `chat` and `knowledge` scopes, Loro, WebRTC,
hosted encrypted storage — all specified as P4/P5 with their constraints fixed now.
