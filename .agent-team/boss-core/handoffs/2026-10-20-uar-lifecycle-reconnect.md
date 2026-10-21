# UAR lifecycle reconnect consumer continuation — 2026-10-20

## Authority and boundary

Assigned by the UAR lead as a bounded boss-runtime implementation packet. The
user authorized cross-project UAR/Boss lifecycle integration. UAR remains in
`uar-outstanding-issues-v1-1-1 / function-first-release-certification`, Execute,
`deterministic-lifecycle-management` task `5.4`; its waypoint reported revision
3144, plan revision 68, and 137/153 implementation items complete when read.
The Boss linked waypoint remains `the-boss-universal-agent-runtime /
sidecar-session-principal`. This packet does not advance either waypoint.

**Verification CLOSED across both projects.** No tests, checks, builds, lint,
formatting, typechecking, compiler probes, packaging, policy validators,
independent review gates, or scripts that indirectly run them were executed or
delegated. Only source inspection and assigned source/document authoring occurred.
The whole active phase remains in progress. The lead must reconcile the complete
implementation inventory and obtain explicit operator authorization for the exact
gate commands before verification can run. Later implementation edits close that
gate again.

## Changed source and consumer contract

Owned source: `src/main/ai/runtime/uar/UarSidecarService.ts`. Observed Boss HEAD:
`54d0911846ccbc0078c25493bb84ca8d5a0429fc`; the file already contained substantial
uncommitted lifecycle/Windows launcher work before this packet. Those edits were
preserved. The spans below refer to the authored working-tree source, not HEAD.

- Lines 146–161: reusable schemas for transport observations, bus command
  generations, and the existing subscription topic map. Generations retain the
  existing nonnegative safe-integer constraint; a transport generation can be
  null and its state must be `available`, `unavailable`, `released`, or
  `observation_unavailable`. Map keys remain resource IDs supplied by UAR;
  current transport registrations are persistence/memory.
- Lines 181–183: snapshot results now retain required `transports` and
  `subscription_generations` alongside `resources` and `subscriptions`.
- Lines 190–212: the response union accepts version-1
  `lifecycle_reconnect_failed` with required schema-parsed details:
  `resource_id`, `expected_generation`, `transports`,
  `subscription_generations`, and `subscriptions`. The exported
  `UarLifecycleReconnectError` exposes these details as a typed property. It
  carries a fixed safe message rather than a driver error or raw envelope.
  Existing `lifecycle_command_failed` and successful result envelopes remain.
- Line 218 and line 598: each pending request retains its originating operation.
- Lines 926–940: a correlated reconnect failure must match the originating
  reconnect's resource ID and expected generation before its parsed details are
  delivered. An identity mismatch rejects that pending promise with a fixed
  error. A valid reconnect failure rejects only its own pending promise and
  leaves other pending commands/channel admission intact. Malformed envelopes
  retain the pre-existing channel-wide incompatibility path.

Existing object schemas continue to retain declared fields through parsing; no
passthrough of unknown detail fields was added. The resource/generation match
and typed error are required by the new private control-channel contract. The
schema checks protect the real child-process output trust boundary. No retry,
timeout, fallback, rollback, or other speculative guard was added.

No launcher process behavior, Windows overlapped stdin setting, launch-token
delivery, child-close ownership, IPC, UI, credentials, or other source file was
changed by this packet. The only additional file is this assigned handoff.

## Source evidence and limitations

Authoritative producer sources read:

- UAR `docs/operations/lifecycle-reconnect-continuation.md`.
- UAR `src/server/lifecycle_control.rs`, including `connection_snapshot()` and
  the reconnect failure envelope in `execute()`.

Boss project instructions, boss-runtime role/routing/tool policy, applicable
backend architecture/lifecycle guidance, parent README, and gotchas were read.
Source inspection used `sed`, `rg`, `nl`, `cat`, and read-only Git inspection.
`git rev-parse HEAD` returned the identity above; scoped `git status --short`
reported ` M src/main/ai/runtime/uar/UarSidecarService.ts` before this handoff was
created. This is source-state evidence, not behavior acceptance.

The lead's Compass lookup was unavailable: `mcp__compass__search_symbols` for
`UarSidecarService lifecycleSnapshot` rejected graph-index/2 because the server
expected graph-index/1; `.compass/verification.json` was absent. Source fallback
was used; no graph rebuild was attempted. There is no graph-backed call or
impact assurance. The lead's source caller search found only the lifecycle
method definitions, so no IPC/UI consumer delta was assigned.

The uncomfortable compatibility case is a managed UAR binary with the older
snapshot shape: the new snapshot parser requires both added maps, while the
private protocol version remains 1. A matching UAR payload and Boss consumer
must be included in the eventual integrated delivery. Compilation, runtime
schema behavior, partial recovery delivery, request concurrency/isolation,
malformed payload handling, CAS mismatch handling, and macOS/Windows packaged
behavior remain unverified. No acceptance credit or phase-completion claim is
made. No unresolved design choice remains within this packet; production
integration and the explicit operator-opened verification gate remain with the
lead.
