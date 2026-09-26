---
description: What data syncs across a person's devices, the per-entity mechanism, the change-cursor sync protocol, transactional outbox and projection, deletes, restore and encryption
---

# Data Sync

## Principles

1. **Each data shape gets the cheapest correct mechanism.** v1 uses per-field last-writer-wins (LWW)
   changes and home-authoritative message replication. Loro documents are reserved for collaborative text in
   P4 (notes, knowledge), where they earn their cost.
2. **The core owns sync state; each app owns its database.** boss-link keeps `sync.db` (change log, cursors,
   quarantine, blob index). Changes enter an app's SQLite only through that app's data layer, keeping each
   database single-writer.
3. **Canonical model, per-app projection.** The canonical entities and their mapping to each app's tables are
   in [Canonical Model](./canonical-model.md). Each app ignores scopes it does not support.
4. **Execution state never syncs.** Running turns, token deltas and pending approvals travel on control
   streams ([Protocol Specification](./protocol-spec.md) §8). Only settled results sync.

## Scopes

| Scope | Entities | Mechanism | Writers | Phase |
| --- | --- | --- | --- | --- |
| `config` | Provider (without secrets), Model, McpServer | Per-field LWW | Any device | P3 |
| `prefs` | Preference keys on the allowlist | Per-key LWW | Any device | P3 |
| `agents` | Agent | Per-field LWW | Any device | P3 |
| `sessions` | AgentSession metadata | Per-field LWW; `home_device`/`home_epoch` writable only by the home | Any device (metadata), home (authority fields) | P3 |
| `sessions` | AgentSessionMessage (settled) | Row upsert with per-row revision | **Home only** | P3 |
| `jobs` | Job schedule definitions; job run results (read-only replicas) | Per-field LWW (schedules); home-authoritative rows (runs) | Any device (schedules); executor (runs) | P3 |
| `files` | FileEntry + blob | Per-field LWW + BLAKE3 content address | Any device | P3 |
| `secrets` | Provider API keys (opt-in per provider) | Per-field LWW, value sealed to each device holding `secrets` grant | Any device with `secrets` | P3 |
| `chat` | Topic, Assistant, Message tree | Per-field LWW + home-authoritative message rows | Desktop devices | P4 |
| `knowledge` | Knowledge base/item, Note | Loro documents (Text) + blobs | Any device | P4 |

## Change Model [v1]

### Local changes and the outbox

Each app adds a `sync_outbox` table to its own database. Every write to a synced table appends an outbox row
**in the same transaction**:

`sync_outbox(id autoincrement, scope, entity_type, entity_id, op (upsert|delete), changed_fields_json,
local_rev, created_at)`

- The data layer writes outbox rows for inserts, field updates, soft deletes and hard deletes (cascading
  deletes are expanded into one delete row per affected synced entity inside the transaction).
- Writes performed by the projector (remote changes) are tagged with a connection-local flag and do **not**
  produce outbox rows.
- The core drains the outbox (`CoreEvent::OutboxDrainRequest` → `HostCommand::OutboxRows` → `CoreEvent::OutboxAck{up_to_id}`); the host deletes
  acknowledged rows. A crash anywhere leaves rows in the outbox; nothing is lost and no startup scan is needed.

### Change records

The core turns each outbox row into a change record:
`Change{origin_device, origin_incarnation, origin_seq, scope, entity_type, entity_id, field → (value, hlc),
deleted: optional hlc}`.

- `origin_incarnation` is a random 128-bit id created when `sync.db` is created (new install, restore, or
  reset). `origin_seq` is gapless per `(origin_device, origin_incarnation)`. A reinstall that keeps the same
  device key therefore starts a new stream instead of colliding with its old sequence numbers.
- Changes carry **field patches only**, never full rows, so a device that does not know a field never erases
  it.
- HLC is `(physical_ms, logical, device_id)`. A received HLC is never rewritten. A change whose physical time
  is more than 5 minutes ahead of the receiver's clock is quarantined (kept, not applied) until the receiver's
  clock catches up or the user resolves it; the local clock advances past received HLCs by at most 5 minutes.

### Merge rules

- Per field: the larger HLC wins; ties break on `device_id`.
- Delete: a tombstone HLC larger than every field HLC deletes the entity; a later field write resurrects it
  only if its HLC is larger than the tombstone.
- Home-authoritative rows (session messages, job runs, and later chat messages): only changes whose
  `origin_device` is the entity's home at the change's `home_epoch` are accepted; within that, the larger
  `row_rev` wins. For job runs the authority is the run's `executor_device`, fixed at creation; only changes whose
  `origin_device` equals it are accepted.
- Fields marked authority-only in the canonical model (`home_device`, `home_epoch`) accept changes only from
  the current home (or the admin for recovery).

### Protected fields

Fields of class **P** in [Canonical Model](./canonical-model.md) decide what runs on a device: MCP
transport, endpoint, stdio command, environment and disabled-tool fields, provider endpoints and auth configuration, agent tool-approval
mode, disabled tools and opaque desktop configuration, and job schedule triggers, templates and enablement.

- A change to a P field that originates on another device is **not projected** automatically. The receiving
  device stores it as a pending proposal (`CoreEvent::ProposalPending`) and shows it to the user with the
  originating device, the old and new values, and the effect ("will run `sh -c …`"). It is projected only after
  the user approves it on that device (`HostCommand::ApproveProposal`); rejection records a local override
  with a newer HLC.
- A change that only narrows (disable a server, add a disabled tool, tighten approval mode, disable a job)
  applies automatically.
- A remote change that enables a stdio server, widens tool access or loosens approval also requires the sender
  to hold `exec.shell` and to have signed the change with step-up; otherwise the executor drops it.
- This applies on **every device that runs anything locally**, phones included: the mobile app runs agents,
  providers and HTTP MCP tools on-device, so a remote change to its provider endpoints or tool-approval mode is
  a proposal there too. Only a device with no local runtime at all (none in v1) may project P fields directly.
- Step-up on a sync change: the originating device signs the change record's BLAKE3 hash with its presence key
  (context `boss-link/stepup/v1`) and the signature travels with the change; receivers verify it against the
  originator's certificate before treating a widening change as eligible for local approval.

## Sync Protocol (`boss/sync/1`) [v1]

1. `SyncHello{account_id, roster_seq, scopes, min_reader_version per scope, protocol}`. Roster reconciled
   first. If a peer's `min_reader_version` for a scope exceeds this device's version, this device syncs that
   scope **read-only** (applies nothing, writes nothing) and asks the user to update.
2. Each side sends its **change cursor** per scope: `{(origin_device, origin_incarnation) → max_seq}`.
3. Each side streams every change the other lacks, from any origin, in `origin_seq` order per origin. This is
   what makes relaying through an always-on node correct: a node forwards other devices' changes with their
   original origin and sequence, so a receiver never skips a change because it already saw a newer one from a
   different origin.
4. Receivers apply changes to `sync.db`, then emit projection batches to the host.
5. After catch-up, both sides stay connected and push new changes as they are recorded.

The always-on node stores all changes; two phones that are never online together converge through it.

## Projection Into Each App [v1]

- `CoreEvent::ProjectionBatch{batch_id, changes (ordered)}`; the host applies a batch in one transaction and
  replies `ProjectionAck{batch_id}`. Unacknowledged batches are re-sent; applying a batch twice is idempotent
  because each field write compares HLCs stored in the projection bookkeeping.
- Bookkeeping: each app keeps `sync_field_state(entity_type, entity_id, field, hlc)` (or equivalent) so the
  projector never overwrites a local field whose HLC is newer (for example a local edit not yet drained).
- Ordering: batches are ordered by dependency — `config` → `secrets` → `prefs` → `agents` → `sessions`
  (metadata) → `sessions` (messages) → `jobs` → `files`.
- References: a reference to an entity this device does not have (for example a model not present) is
  projected as null where the column is nullable; otherwise the entity is **quarantined** (kept in `sync.db`,
  retried when the referenced entity arrives). One poison entity never blocks a batch.
- Executability: entities that cannot run on this device (a desktop agent with a local workspace or stdio MCP
  servers, on a phone) are projected with an `executable_here = false` marker and shown as remote-only.

## Deletes And Garbage Collection [v1]

- Tombstones are kept until every device in the **active roster** has acknowledged a cursor past them. The
  active roster is non-revoked devices seen within the last 90 days.
- A device that returns after more than 90 days is re-seeded: it discards its cursors, pulls a full state, and
  its own unsent outbox rows are shown to the user as conflicts to keep or discard.
- Change records older than the active roster's minimum acknowledged cursor are compacted into per-entity
  current state.

## Backup And Restore [v1]

A replacement restore invalidates sync state. After restore:

1. The host sends `RestoreCompleted`; the core creates a new `origin_incarnation`.
2. The core pulls the current state from peers.
3. Restored rows that differ from the synced state are recorded as new local changes with fresh HLCs **only
   after the user confirms** a summary of the differences; otherwise the synced state is projected over the
   restored rows.
4. `sync.db` is excluded from backups.

## Encryption [v1]

- In transit: QUIC TLS 1.3 between endpoints authenticated by their EK; relays cannot decrypt.
- Mailbox: envelopes are sealed to the recipient's AK (HPKE). The primary mailbox is one of the user's own
  devices and does see sync changes it relays, like any member device; it never sees mailboxed envelope
  contents.
- Secrets scope: values are sealed per recipient device (AK) and stored only by devices holding the
  `secrets` grant. Secret fields are redacted from logs, `tracing` output and FFI log events. Revoking a device
  lists the secrets it held so the user can rotate them at the provider.
- Hosted storage (a node that is not one of the user's devices) is out of scope for v1. If added, it requires
  epoch content keys wrapped to each device's AK and rotated on revocation.

## Changes To Existing Behavior

- Mobile keeps remote session projections in memory only today
  (`mobile:docs/references/remote-access/session-read-cache.md`). With the `sessions` scope, sessions homed on
  another device are **persisted** as read-only replicas. Update that reference when P3 ships.
- `configuration.export.*` remains as the legacy path; it never includes secrets for a receiver without the
  `secrets` grant.
