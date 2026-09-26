---
description: Canonical synced entities and their field-by-field mapping to the mobile and desktop SQLite schemas, with local-only and secret fields
---

# Canonical Model

The canonical entities are the only shapes that cross devices. `boss-link-proto` defines them as protobuf
messages (`proto/boss/link/v1/entities.proto`) with the fields below. Each app maps canonical fields to its
own columns; columns not listed are **local-only** and never sync.

Field classes: **S** synced (per-field LWW), **A** authority-only (writable only by the current session home, or by the admin for recovery), **X** secret (only in the `secrets` scope, sealed per device), **R** home-authoritative row
(whole settled row replicated from the home), **D** derived locally after projection (never synced), **P**
protected (execution-relevant: a remote change is a *proposal* that the receiving executor applies only after
local approval on that device; a remote change that only narrows — disabling, removing, tightening — applies
automatically; see [Data Sync](./data-sync.md) "Protected fields"). **X + P** fields are sealed like secrets and
changed only through approved proposals that also carry `exec.shell` and step-up; a change that only removes
keys or values still applies automatically as a narrowing change.

Column names below are the Drizzle property names in `mobile:src/backend/data/db/schemas/*.ts` and
`desktop:src/main/data/db/schemas/*.ts` as surveyed on 2026-09-26. When either schema changes, update this
table in the same change; a column added without a mapping stays local.

## Provider — scope `config`

| Canonical | Class | Mobile `user_provider` | Desktop `user_provider` |
| --- | --- | --- | --- |
| `provider_id` (key) | — | `providerId` | `providerId` |
| `preset_provider_id` | S | `presetProviderId` | `presetProviderId` |
| `name` | S | `name` | `name` |
| `logo_key` | S | `logoKey` | `logoKey` |
| `endpoint_configs` (JSON) | P | `endpointConfigs` | `endpointConfigs` |
| `default_chat_endpoint` | P | `defaultChatEndpoint` | `defaultChatEndpoint` |
| `auth_config` (JSON, non-secret parts) | P | `authConfig` | `authConfig` |
| `api_features` (JSON) | P | `apiFeatures` | — (ignored) |
| `provider_settings` (JSON) | P | `providerSettings` | `providerSettings` |
| `is_enabled` | S | `isEnabled` | `isEnabled` |
| `api_keys` | X | `apiKeys` | `apiKeys` |

## Model — scope `config`

Ids are deterministic (`providerId::modelId`) on both apps, so the same model has the same id everywhere.

| Canonical | Class | Both apps `user_model` |
| --- | --- | --- |
| `id` (key) | — | `id` |
| `provider_id`, `model_id`, `preset_model_id` | S | same names |
| `name`, `description`, `group` | S | same names |
| `capabilities`, `input_modalities`, `input_modalities_explicit`, `output_modalities`, `endpoint_types` | S | same names |
| `context_window`, `max_input_tokens`, `max_output_tokens`, `supports_streaming` | S | same names |
| `reasoning`, `parameters`, `pricing` (JSON) | S | same names |
| `is_enabled`, `is_hidden`, `is_deprecated`, `notes` | S | same names |

## McpServer — scope `config`

| Canonical | Class | Mobile `mcp_server` | Desktop `mcp_server` |
| --- | --- | --- | --- |
| `id` (key) | — | `id` | `id` |
| `name`, `description` | S | `name`, — | `name`, `description` |
| `transport` (`http` \| `stdio`) | P | always `http` | `type` |
| `endpoint_url` | P | `endpointUrl` | `baseUrl` |
| `headers` (JSON; values treated as secret) | X + P | `headers` | `headers` |
| `disabled_tools` | P | `disabledTools` | `disabledTools` |
| `is_enabled` | P | `isEnabled` | `isActive` |
| `stdio_command`, `stdio_args`, `stdio_cwd` | P | not projected (`executable_here = false`) | `command`, `args`, `cwd` |
| `env` | X + P | — | `env` |
| `origin`, `builtin_id`, `authorization_id` | — | local-only | — |
| Registry, DXT, trust, install metadata | — | — | local-only |

A stdio server synced to a phone is shown as "runs on <desktop>" and is reachable only through that desktop. A
stdio server that arrives on a desktop from another device is created **disabled and untrusted** and runs only
after the user approves it on that desktop (its local install and trust metadata stay local).

## Agent — scope `agents`

| Canonical | Class | Mobile `agent` | Desktop `agent` |
| --- | --- | --- | --- |
| `id` (key) | — | `id` | `id` |
| `name`, `description` | S | `name`, — | `name`, `description` |
| `instructions` | S | `instructions` | `instructions` |
| `model_id` | S | `modelId` | `model` |
| `plan_model_id`, `small_model_id` | S | — | `planModel`, `smallModel` |
| `disabled_tools` | P | `disabledCapabilities` (mapped) | `disabledTools` |
| `tool_approval_mode` | P | `toolApprovalMode` | inside `configuration` |
| `avatar` | S | `avatar` | inside `configuration` |
| `desktop_configuration` (JSON, opaque) | P | stored, not interpreted | `configuration` |
| `kind` | S | — | `type` |
| `executable_here` | D | computed | computed |
| Tool bindings | P4 | `agent_tool_binding` | `agent_skill`, `agent_global_skill` |

`instructions` is plain text with LWW in v1: concurrent edits of the same agent's instructions keep the later
one. Merging text edits is a P4 upgrade to a Loro Text field.

## AgentSession — scope `sessions`

| Canonical | Class | Mobile `agent_session` | Desktop `agent_session` |
| --- | --- | --- | --- |
| `id` (key) | — | `id` | `id` |
| `agent_id` | S | `agentId` | `agentId` |
| `title`, `title_is_manual` | S | `title`, `titleIsManual` | `name`, `isNameManuallyEdited` |
| `description` | S | — | `description` |
| `workspace_id` | S | — | `workspaceId` |
| `last_activity_at` | S | `lastActivityAt` | `lastActivityAt` |
| `forked_from_session_id`, `fork_boundary_message_id` | S | same names | — |
| `home_device`, `home_epoch` | A | new columns (or side table) | new columns (or side table) |
| `execution_target` | — | `executionTarget` local-only | — |
| `task_schedule_id`, `trace_id` | — | — | local-only |

## AgentSessionMessage — scope `sessions` (home-authoritative)

Only **settled** rows replicate (status `success`, `error`, `cancelled`, `interrupted`, `paused`). Pending and
streaming rows never leave the home. Each replicated row carries `row_rev` (incremented by the home on every
settled update).

| Canonical | Class | Mobile `agent_session_message` | Desktop `agent_session_message` |
| --- | --- | --- | --- |
| `id` (key, UUIDv7) | — | `id` | `id` |
| `session_id` | R | `sessionId` | `sessionId` |
| `turn_id` | R | `turnId` | inside `delivery` / `deliveryTurnRef` |
| `role` | R | `role` | `role` |
| `parts` (canonical `MessagePart[]`) | R | from `data` | from `data` |
| `status` (canonical enum) | R | `status` (mapped) | `status` (mapped) |
| `model_id` | R | `modelId` | `modelId` |
| `usage`, `stats`, `error` | R | `usage`, `stats`, `error` | inside `stats` / `data` |
| `row_rev` | R | new column | new column |
| `searchable_text`, `fts_rowid` | D | rebuilt locally | rebuilt locally |
| `context_checkpoint`, `message_snapshot`, `runtime_resume_token`, delivery bookkeeping | — | local-only | local-only |

`MessagePart` is a protobuf `oneof`: `text`, `reasoning`, `tool_call`, `tool_result`, `file_ref (blob hash)`,
`image_ref (blob hash)`, and `unsupported{kind, json}` which preserves parts one app cannot render so they
round-trip unchanged. Status mapping: mobile `pending|streaming` and desktop `pending` are never replicated. Canonical settled
statuses are `success`, `error`, `cancelled`, `interrupted`, `paused`. Each app's CHECK constraint allows only
part of that set (mobile: `success|error|cancelled|interrupted`; desktop: `success|error|paused`), so each app
stores a canonical status it cannot hold as its nearest local value — desktop: `cancelled`/`interrupted` →
`error`; mobile: `paused` → `interrupted` — and keeps the canonical value in a `canonical_status` column (or
side table) so it round-trips unchanged. An unknown future status is stored as `error` the same way.

## Jobs — scope `jobs`

| Canonical | Class | Mobile | Desktop |
| --- | --- | --- | --- |
| JobSchedule `id`, `name` | S | — (not projected in v1) | `job_schedule` equivalents |
| JobSchedule `type`, `trigger`, `input_template`, `enabled`, `catch_up_policy` | P | — (not projected in v1) | `job_schedule` equivalents |
| JobRun (`id`, `schedule_id`, `executor_device`, `row_rev`, `type`, `status`, `scheduled_at`, `started_at`, `finished_at`, `output`, `error`) | R (executor) | `job` (read-only replicas of remote runs, `executable_here = false`) | `job` |
| Queue, attempt, idempotency, cancel flags, timeouts | — | local-only | local-only |

## FileEntry — scope `files`

Mapped from `file.ts` in both apps: `id`, name, mime type, size and `blob_hash` (BLAKE3 of content) are synced;
local paths are local-only. Blobs are fetched on demand by hash.

## Preferences — scope `prefs`

Both apps store `preference(scope, key, value)`. Only keys on the allowlist in
`proto/boss/link/v1/prefs_allowlist.txt` sync; each entry names the key, value type and whether it applies to
mobile, desktop or both. Initial allowlist: default model selection, default assistant/agent, language,
translation target language, web-search provider settings without secrets. Window geometry, theme per device,
cache sizes, feature flags and anything device-specific never sync.

## Scope `chat` [P4]

Desktop `topic`, `assistant`, `message` (tree via `parentId`, one `role = 'root'` virtual row per topic).
Rules fixed now so P4 cannot break them: the root row is never synced; every device derives it
deterministically as `root_id = UUIDv5(namespace_boss_link, topic_id)`; content rows are home-authoritative
per topic; `activeNodeId` is device-local. The full field mapping is written before P4 starts.
