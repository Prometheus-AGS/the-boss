# R3 desktop operation: bounded failed-only continuation

The lead's second failed-only continuation successfully exercised the three previously failed stages and restored its temporary service configuration. Its actual qualification remains **partial**, with zero new failures and six explicit pending clauses. This assessment combines retained R3 evidence with that continuation; it does not certify the entire release. No application source was changed for these three failures. This evidence author ran no tests, compiler/build commands, application operations, or service mutations while preparing the corrections or this assessment.

## Retained receipts

| Artifact under `.context/release-2.2.39/desktop-operation-r3/` | SHA-256 |
| --- | --- |
| `operation.json` | `2d3e77072df3a07e72c06ac900c27cee28b55de262eebf9b355c838d1a78173f` |
| `initial-evidence.json` | `2780a5931b933586ca3b2323d07961c8d40e0fc7b893434287ebeb9f8b2f7f36` |
| `profile/user-data/Data/Prometheus/operations/89fed7d9-6077-4e35-8a04-fd930ee0c5d3/operation.log` | `5f672d95e0d53d3e1201be9943d2bb2de9629b79bdda1fb00e6a58b678ba4427` |

R3 installed ASAR hash: `ade0a169e076778f0b9cc5a49b971af5c10300becae46412659cb541b80f2645`. The operation receipt records exact owned PID 30208 exiting after SIGTERM and removal of its unchanged `profile/session-data/DevToolsActivePort` after confirmed shutdown. No forced cleanup was admitted.

The seven recorded passing checks remain evidence references: private startup catalog/library/mirror/pack/shims; doctor IPC; owned user skill install/reconcile; read-only file IPC; missing executable refusal; service configuration restoration; and removal of only the owned missing-command record. The continuation skips these checks. Its necessary temporary-service restoration receives its own cleanup receipt. Historic 61/61, 20/20 and 43/61 totals retain their separate meanings.

## Observed failures and source contracts

1. `UAR110_WORKSPACE_INDEX_FAILED`: owned workspace contains only `README.md`. Actual operation output is `graph is empty — deterministic extraction produced no nodes`. `src/main/services/prometheus/workspaceMcp.ts:255` calls Compass with `--code-only`. The correction adds one owned `operation-fixture.js` during the authorized continuation. Its two lines match the JavaScript deterministic-extraction fixture in Compass `crates/compass-core/src/pipeline.rs:9333–9336`; no inference or semantic enrichment is added.
2. `UAR110_ADVERTISED_WORKSPACE_SERVERS_MISSING`: `workspaceMcp.ts:190–208` advertises active Compass only when indexed, current and error-free. The failed index never reaches successful server registration at `PrometheusIntegrationService.ts:1088–1094`. This is downstream of the empty fixture. A read-only examination of the stopped private SQLite database found owned Compass `09d8d274-a2b7-4eed-b2ac-21d34f39938f` and filesystem `0c1aa5ee-e3b8-44b4-bc07-5d709eeb9b51` rows, both inactive. This final inactive state does not independently diagnose filesystem transport: the later service configuration/restore stops and deactivates all managed rows (`PrometheusIntegrationService.ts:813–818`). The continuation reruns indexing, which normally re-registers the owned servers, followed by real connectivity and tool inventory through existing IPC.
3. `UAR110_DEGRADED_UI_UNAVAILABLE`: operation `c2463dea-705b-423a-9111-423303e5f778` succeeded and recorded failed `surrealdb`, `memory` and `gateway` diagnostics for the isolated unreachable endpoints. The assertion incorrectly required `#app-sidebar` on settings. The macOS `AppShell.tsx:272–282` deliberately hides it when a settings tab is active. `SettingsPage.tsx` supplies `data-ui="settings.navigation"`; `ServicesSettings.tsx` supplies `setting-services-service-management`, diagnostic `dl/dt` rows and ordinary action buttons. The correction checks this visible services surface, records its three rendered diagnostic labels without assuming a language, and requires an enabled control. It leaves the services route before the check so returning mounts a fresh snapshot through the normal route/controller.

## Prepared invocation; not executed here

`--resume` accepts the original single initial-phase receipt with exactly these three failures and a graceful owned shutdown. It preserves the same profile, workspace, workspace ID and existing settings. It refuses an existing prior PID, residual session-data port file, or changed installed ASAR/native executable. It writes a new receipt directory, references the prior evidence by hash, and launches once with maintained launcher `--keep-open` behavior. Only the three failed stages and their required service restoration execute. It does not replay startup, doctor, skills, file read, missing-command refusal, native inventory, or a second launch phase.

```console
node /Users/gqadonis/Projects/prometheus/the-boss/scripts/operations/uar110-desktop-operation.mjs --boss /Users/gqadonis/Projects/prometheus/the-boss --app '/Applications/The Boss.app' --launcher /Users/gqadonis/Projects/prometheus/prometheus-skill-pack/skills/process/delivery-cadence/scripts/boss-launch.mjs --output /Users/gqadonis/Projects/prometheus/the-boss/.context/release-2.2.39/desktop-operation-r3-failed-only --version 2.2.39 --resume /Users/gqadonis/Projects/prometheus/the-boss/.context/release-2.2.39/desktop-operation-r3/operation.json
```

All original pending clauses are carried forward explicitly. Passing these three stages alone cannot qualify direct filesystem MCP tool invocation, shared memory authorization, native `/runs` cancellation/reopen, persisted/empty native MCP hydration, OpenSpec command execution, or doctor streaming/repair/Docker-state distinctions. Earlier fork/static-preset/consent supersession or pending dispositions in `desktop-applicability.md` remain in force. A continuation with no new failures can remain `partial` because these clauses are pending.

## First continuation: startup input-contract refusal

The lead's actual first continuation on the same R3 profile failed at startup, with zero stage checks. It retained all original passes and pending clauses. Receipt hashes under `.context/release-2.2.39/desktop-operation-r3-failed-only/` are `failed-only-evidence.json`: `761a843c2630e55a53393671657b5f3159863ad2979ac155320d283318c58171`; `operation.json`: `d1ec8b5f85d355e3159da953119c4f47b159c0572e39ab39cd88648bb4f63782`. Owned PID 6439 exited after SIGTERM; its unchanged session-data port file was removed after confirmed exit.

Source inspection identifies the exact call: resume used `ipc(evaluate, 'app.get_info')`, whose generic helper supplies `{}`. The real contract at `src/shared/ipc/schemas/app.ts:34–35` is `input: z.void()`. The original passing startup uses `request('app.get_info')` with no input. The correction makes resume use that same actual request form. The scoped logs show the lifecycle completing; no readiness retry or application source change was added. The generic wrapper had discarded the underlying refusal details, so its exact native error code was not retained; the input mismatch is source-established.

The first continuation already created the owned JavaScript fixture before its startup refusal. The correction accepts only those identical fixture bytes, leaving the existing file unchanged; differing bytes refuse. The handoff kept the original R3 `--resume` input and selected the new output directory `desktop-operation-r3-failed-only-2`, preserving both failed receipts. No application, tests or builds were run while preparing that driver correction; at handoff its result was unverified. The next section records the lead's subsequent actual operation.

## Second continuation: observed success, partial qualification

The lead operated the corrected driver on the same R3 profile and workspace. The installed ASAR remained `ade0a169e076778f0b9cc5a49b971af5c10300becae46412659cb541b80f2645`; executed scenario SHA-256 was `a8297ebf0de12cb233b0325910ee3defc2983b96429ff422e4afd8a9de8405cb`. The three original failing predicates now passed through the installed renderer IPC boundary. The first continuation's startup refusal remains preserved as failed evidence; the second continuation recorded no failures.

| Artifact under `.context/release-2.2.39/desktop-operation-r3-failed-only-2/` | SHA-256 | Recorded outcome |
| --- | --- | --- |
| `failed-only-evidence.json` | `2a551c98c8ee988097b26895a776c3f43decc7a515e4819930ed456dd961cca4` | `partial`, `complete:false`, four checks, zero failures, six pending clauses |
| `operation.json` | `94042f1294bcb56333a4ea1b873408ddf073797ba4b5a83e798c147e25479f0a` | `partial`, exact prior R3 receipt hash retained |
| `failed-only-launch.json` | `4602dde53a3e329ea17d11e762bcfd86cc8f9b42ab3ff1e7cc1c260d8e49636e` | `success` |

The continuation references the original `initial-evidence.json` hash `2780a5931b933586ca3b2323d07961c8d40e0fc7b893434287ebeb9f8b2f7f36` and `operation.json` hash `2d3e77072df3a07e72c06ac900c27cee28b55de262eebf9b355c838d1a78173f`. Those receipts remain unchanged. The original seven passes were retained by reference and were not rerun.

| New continuation check ID | Actual evidence |
| --- | --- |
| `workspace-managed-mcp-registration-and-index` | Index operation `6607beda-9235-4b0d-8fe1-b04c78f1ad2e` succeeded, with queued/indexing/completed stages. |
| `available-owned-workspace-mcp-connections-and-tool-inventory` | Existing owned Compass row `09d8d274-a2b7-4eed-b2ac-21d34f39938f` connected with 18 tools; existing owned filesystem row `0c1aa5ee-e3b8-44b4-bc07-5d709eeb9b51` connected with 24 tools. |
| `isolated-unreachable-service-endpoint-feedback` | Status operation `9e637b90-7d64-4ea7-a9ab-6dd622d40c88` succeeded; `surrealdb`, `memory`, `gateway` each reported `failed`. All three corresponding rendered labels were `Failed`; the services page retained visible navigation and an enabled control (`usableUi:true`). Docker CLI/daemon/Compose remained operational. |
| `restore-owned-service-configuration` | Original private service configuration restored through existing configure IPC. This is also a retained initial check ID and is counted once in the combined predicate set. |

Seven retained initial IDs plus four continuation IDs therefore represent **ten distinct operation check IDs**, not eleven new qualifications. These are bounded desktop operation checks, not additions to historic code 61/61, changes 20/20 or portfolio 43/61 counts. No historical totals change.

The lead's owned PID 14089 exited after SIGTERM, with removal of its unchanged private session-data port file only after confirmed shutdown. Reusing the same R3 profile necessarily involved another launch, but **restart retention of the user skill and shims was not explicitly checked**. Neither `whole-owned-app-relaunch-preserves-user-skill-and-shims` nor native `/runs` reopen/cancel receives credit from this continuation.

All six pending clauses were carried unchanged: direct filesystem MCP tool invocation; shared-memory connection; native `/runs` cancellation/reopen; native persisted/empty MCP catalog hydration; OpenSpec command execution; and doctor streaming/repair/distinct Docker-absent/daemon-down behavior. Prior fork/static-preset/consent pending or explicit supersession dispositions still apply. This partial result does not waive any of them.
