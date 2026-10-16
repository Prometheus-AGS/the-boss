# One normal-profile BossFang → UAR prompt

Prepared from retained receipts and source only. **Not executed.** The lead operates the installed **2.2.39 / UAR d815ef72** candidate after the completed build. The separate isolated desktop driver and this saved-configuration prompt prove different boundaries.

## Source and retained scope

- BossFang pinned source: `2ec0f66ec224ec60fe1b4aaecabbd6f735c73f85` in `GQAdonis/librefang`. The same pin is present in built Boss 2.2.38's `build/integration-sources.json` and the new release inputs.
- At that exact pin, `crates/librefang-api/dashboard/src/pages/ChatPage.tsx` uses `/chat` search `agentId` / `sessionId` (around 3141), renders the ordinary textarea/form submit path (around 2330–2400), sends the normal websocket message frame (around 1330), and consumes `text_delta` frames (around 1103).
- `dashboard/src/api.ts`: `getUarChatTarget` / `saveUarChatTarget` around 6893; `getUarChatTurns` around 6906; `getUarDelegation` around 6862. Only the GET operations below are needed for correlation; do not save a target during this operation.
- `dashboard/src/components/UarChatControl.tsx` displays effective agent/provider/model, execution state, `data-uar-run-id`, native run correlation and workspace from the same saved turn projection.
- Maintained Boss helper: `scripts/bossfang-workflow-delegation-operation/dashboard.mjs:openDashboard` verifies the actual managed origin, `webview[data-mini-app-id="bossfang-dashboard"]`, `persist:bossfang-dashboard` partition and authenticated guest. Its `guestEvaluate` / `request` helpers use the existing guest authentication without returning credential values.
- Retained `build/release-operation-2.2.38/operation.json` describes a real streamed no-tools `UAR_AC097_READY` prompt and correlated completed run, followed by readiness after whole-app restart. Its separate missing-workspace recovery is **not** part of this operation. No narrow executable prompt scenario was found among the retained Boss scripts, `.context`, `/tmp` or initiative scripts. Broad workflow/admission scripts include effects and are unsuitable for this one-prompt boundary.

## Normal UI / CDP sequence

1. **Bind actual candidate and preserve saved configuration.** Record installed version, ASAR/native payload hashes, native source marker and actual selected UAR process/instance identity. Through existing main IPC read `bossfang.status`; retain only `services.dashboard/uar/models/sharedMemory` states and effective UAR instance/generation. Record failures as observed; do not start/reconfigure external dependencies to force Ready.
2. **Open the existing authenticated dashboard.** Use Settings → BossFang → Open BossFang, or the maintained `openDashboard` helper. Bind CDP/guest evaluation to its verified origin and isolated guest. Select existing Chat → `runtime-agent`. Resolve its actual ID through the existing UI or read-only `GET /api/agents`; do not reuse an invented/hardcoded ID. Preserve its saved model, workspace and target. An ordinary new conversation is appropriate if the current conversation has a user draft or pending work; do not overwrite either.
3. **Snapshot the exact target and prior turns.** In the authenticated guest, read:

   ```text
   GET /api/agents/{agentId}/uar-target
   GET /api/agents/{agentId}/uar-chat/turns?sessionId={actualSessionId}
   ```

   Omit the turns query only if the ordinary UI has not yet selected a session. Record the saved `targetId`, `instanceId`, `workspaceId`, `bindingId`, `bindingRevision`, definition identity and model override, plus the existing task IDs. Retain only the fields required for correlation, not raw unrelated turn bodies or credentials.
4. **Submit exactly one normal UI prompt.** Locate the visible enabled ChatInput textarea. With the maintained `fill` helper, or its normal textarea value setter followed by `input` / `change`, enter:

   ```text
   Do not use tools. Reply with exactly UAR_D815_READY.
   ```

   Wait for that textarea's form to have an enabled `button[type="submit"]`, then click it **once**. Do not also submit a raw HTTP request or websocket frame. Do not edit the selected target/model/workspace. If a tool request appears, preserve the observation and leave it unapproved; this operation authorizes no tool effect.
5. **Observe actual streaming and terminal output.** Capture visible text growth and exact final marker with completed state. For transport evidence, use the already verified guest CDP target's Network websocket events and count only matching `text_delta` frames; the ordinary source path is `/api/agents/{agentId}/ws?session_id=...`. Keep counts/identities and the known marker, not raw frames, headers or tokens. Do not monkey-patch providers, transports or guest authentication. If streaming cannot be observed, mark it unverified rather than inferring it from a final response.
6. **Read the native correlation without another turn.** Re-read turns and find exactly one new task whose `chat.input` matches this prompt. Require `executionState: completed` and exact marker output. Retain:

   ```text
   bossTaskId, selectedInstanceId, workspaceId, effectiveBinding,
   uarTaskId, uarThreadId, uarRootRunId, uarRunId, runtimeEpoch,
   executionState, recoveryState,
   effectiveTarget.agent_id / provider_id / model_id
   ```

   Read-only `GET /api/uar/delegations/{bossTaskId}` can confirm the same projection. The UI's `data-uar-run-id` and correlation/workspace display must agree. Optional existing main IPC `prometheus.uar.runs.read` with the exact native root-run ID can confirm native terminal status/agent/conversation if the current installation owner permits it. If that owner cannot read the run, record the limit; do not forge an owner or call a raw privileged native endpoint. Avoid dumping unknown policy/context blobs.
7. **Confirm unchanged saved identities and retained result.** Read the saved target and main readiness again. If the completed release requires one whole-app restart, use only the existing owned-process restart procedure, then reopen the same saved conversation and re-read this completed task. No second inference prompt is needed. The selected instance, target, workspace, binding and effective model remain the saved identities; record new process/generation/epoch after restart rather than requiring the old process to remain. Retain the original run IDs and completed marker after reopen.

## Receipt and exclusions

The receipt identifies the exact installer/installed bytes, source pins, actual platform, pre/post saved target fields, ready states, observed stream evidence, one new task/native-run correlation and terminal output. Keep native Windows operation and human acceptance separate. Do not repeat the missing-directory workspace recovery, broad Gate A/B, workflow approval/denial/cancellation, model matrix or shared-memory authorization cycle. This is one actual configured native runtime stream, not a version-only probe.

## Incomplete launcher side effect

The unrelated 20:48 launcher-isolation attempt against old 2.2.38 remains failed/incomplete. Its three generated shell-registration block changes were explicitly authorized for restoration. [The sanitized restoration receipt](incomplete-launcher-rc-restoration.json) records exact backup/current/restored hashes, original modes and private rollback paths; no shell contents were printed or committed. No new app operation was performed during restoration.
