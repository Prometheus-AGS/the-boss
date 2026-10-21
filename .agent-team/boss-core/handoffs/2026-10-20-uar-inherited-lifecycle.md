# UAR inherited lifecycle launcher handoff

Date: 2026-10-20. Source owner: lifecycle_boss_launcher (Boss runtime/desktop guidance). Destination: phase lead.

## Authority and source state

Operator verification gate: **CLOSED** across The Boss and UAR. No test, lint, format, typecheck, compiler probe, build, validator, review gate, acceptance script, `git diff --check`, or indirect verification command ran. Source inspection and authorized implementation/documentation writes only. This packet does not open the gate or claim phase acceptance.

The assigned outcome is the operator-approved Windows named-pipe launcher plus private launch-owner snapshot/reconnect and acknowledged process shutdown. The Boss JSON waypoint names `the-boss-universal-agent-runtime`, historical change `sidecar-session-principal`, and installed Windows acceptance pending; its Markdown waypoint says the historical coordinator snapshot is not the current convergence selector. The lead retains responsibility for reconciling authoritative phase position. No waypoint was edited by this writer.

Observed The Boss HEAD: `54d0911846ccbc0078c25493bb84ca8d5a0429fc`. `git status --short -- src/main/ai/runtime/uar/UarSidecarService.ts .agent-team/boss-core/handoffs` reported the service modified before this handoff was authored. The service contains the lead's prior Windows stdio/environment changes, retained by this writer. Other agents share the checkout; their edits were preserved. No commit was created.

## Files and production behavior

- `src/main/ai/runtime/uar/UarSidecarService.ts`: Windows stdin remains `overlapped` with `UAR_SIDECAR_STDIN_OVERLAPPED=1`; Unix stdin remains `pipe`. Completion observation and control response observation are registered immediately at spawn, before launch authentication. READY has no fixed readiness deadline. Startup observes READY, launch/input errors, actual child close, and service cancellation. Stop aborts startup before waiting for the operation mutex, including the capability HTTP read, then awaits the captured child completion. EOF on the launch input requests shutdown; process/stdio `close` acknowledges completion. Nonzero close codes, close signals, and process errors are reported as unsuccessful closure, including startup cleanup aggregation. Endpoint/admission bindings expire on child close.
- Same service: `lifecycleSnapshot(expectedGeneration?)` and `reconnectLifecycleResource(resourceId, expectedResourceGeneration, expectedGeneration?)` are main-process launch-owner methods. They use the existing owned child directly, including while database-backed HTTP authorization is unavailable. They do not start a new child, query database auth, or publish authority over IPC. Each request has one UUID, registered before writing; replies settle that pending request. Child close rejects every remaining request. Input failures and malformed control replies fail the channel. Reconnect acknowledgement validates the returned resource identity and generation's safe integer representation.
- `.agent-team/boss-core/handoffs/2026-10-20-uar-inherited-lifecycle.md`: protocol, source fallback, compatibility, and deferred acceptance record.

No unsolicited feature or request-budget change was added. Guards trace to the inherited process trust boundary, resource/generation binding, actual pipe failure or closure, and UAR's 8,192-byte command limit. The existing five-second capability HTTP timeout remains separate from readiness and shutdown.

## Protocol and compatibility

Read-only contract source: UAR `src/bin/uar-sidecar/control.rs`, `src/server/lifecycle_control.rs`, `src/uar/runtime/lifecycle.rs`, and `src/uar/realtime/lifecycle.rs` in the active UAR checkout.

The first stdin line remains the launch token. Later lines are JSON commands on that same launch-authenticated inherited stream:

```json
{"version":1,"request_id":"<UUID>","operation":{"kind":"snapshot"}}
{"version":1,"request_id":"<UUID>","operation":{"kind":"reconnect","resource_id":"<resource>","expected_generation":0}}
```

The command line excluding its newline must be at most 8,192 UTF-8 bytes. UAR replies on stdout with `LIFECYCLE:` followed by JSON:

```json
{"version":1,"request_id":"<UUID>","result":{"resources":[],"subscriptions":{}}}
{"version":1,"request_id":"<UUID>","result":{"resource_id":"<resource>","generation":1,"outcome":"acknowledged"}}
{"version":1,"request_id":"<UUID>","error":"lifecycle_command_failed"}
```

Snapshot resource state, ownership, outstanding operations, dependency IDs, tracked task count and failure are parsed as UAR emits them. Subscription maps contain retained generation, ready and reason values. This is process/resource inspection, separate from the existing business-entity lifecycle snapshot API.

The Windows UAR side now requires an inherited overlapped named-pipe stdin; Node's built-in spawn stdio provides it. No native helper or new dependency was added. The launcher's environment claim and handle must agree. Official sources supplied by the trust teammate and current Context7 Node 22 docs: [Node stdio](https://nodejs.org/api/child_process.html#optionsstdio), [Node 22.17 child_process contract](https://github.com/nodejs/node/blob/v22.17.0/doc/api/child_process.md), [libuv Windows pipe implementation](https://github.com/nodejs/node/blob/v22.17.0/deps/uv/src/win/pipe.c). Context7 lookup used `/nodejs/node/v22.17.0`; no compiler or API probe ran.

Managed startup requires the explicit `host_lifecycle_control_v1` capability before returning a running endpoint. The lead owns adding this capability to UAR's implemented vocabulary. External endpoint capability requirements are unchanged. The uncomfortable compatibility scenario is an older sidecar accepting the token but never handling commands: its capability check now fails and startup awaits its actual child close. A command sent during initialization remains pending until a reply, input failure or child close; no time-based success is introduced. External UAR processes have no inherited launch-owner channel; these private methods target this service's managed child only.

## Source fallback and remaining work

The active Boss checkout has no `.compass/verification.json`; no correct Boss graph was available through the loaded Compass surface. Per `.agent-team/boss-core/tool-policy.md`, source searches and direct reads were used for service callers, `processRunner.ts`, lifecycle ownership, IPC adapters and protocol schemas. No neighboring UAR graph was queried as Boss evidence. The runtime/desktop role instructions, team routing, local architecture, lifecycle docs, TypeScript rules, gotchas, `cherry-electron-dev` and `agent-team-handoff` skill sources were read. No application instance was launched or controlled. The handoff runtime CLI was not invoked because the assigned handoff is a bounded local artifact and execution scripts could conflict with the closed gate.

No acceptance result exists. Pending after whole-phase inventory and explicit operator gate instruction: real Windows launch through the packaged Boss child-process path; Windows native handle inspection/operation; startup cancellation before READY and during capability read; graceful finalization/stdio-close acknowledgement; unsuccessful/forced process outcome propagation; snapshot and reconnect while database authorization is unavailable; stale resource/process generations; input failure/child-close rejection of pending commands; Unix regression through its actual inherited pipe. TypeScript/lint and packaged customer builds also remain unrun. Exact proposed commands belong to the lead's whole-phase inventory and must be authorized separately.

No unresolved design choice blocks this scoped implementation. Delivery of UAR's matching `host_lifecycle_control_v1` capability and installed cross-platform acceptance remain lead-owned integration risks. UI/IPC exposure was outside this writer's assigned ownership and was not added.

## Final protocol integration update

The lead supplied the final `src/server/lifecycle_control.rs` resource projection. Source inspection confirmed it, and the launcher schema now retains `failure_categories`, `unresolved_effects`, typed missing-dependency/cycle failures, and nullable recursive `close_report` with child reports. Resource failure accepts only the sanitized `resource_failure` marker or null. Close reports retain release state, safe-integer generation/completion/failure counts, unresolved effects and typed dependency failures; raw failure text is not accepted or logged. This closes the earlier schema-stripping gap without adding an IPC or logging path. Recursive schema syntax follows the current official [Zod recursive object documentation](https://github.com/colinhacks/zod/blob/main/packages/docs/content/api.mdx), obtained through Context7.

This update changed only the assigned service and this handoff. Source inspection and authorized edits only; the verification gate is still **CLOSED**. No tests, checks, builds, format commands, compiler probes or review gates ran. All previously listed acceptance remains pending, including preservation of nested child close reports through the real private control path.
