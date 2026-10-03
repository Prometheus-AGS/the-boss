# Harness and delivery adapters

## KBD and goals

The owning harness runs work; Cadence is delivery metadata, not another scheduler. The profile mode is `standalone`, `kbd` or `goal`. `binding` names the project/phase/goal and source ledger. Only existing KBD commands write canonical transitions/completion. Native goal limits and architecture approvals remain authoritative.

Configure `binding.canonicalCommand` with a trusted executable, string-array `args`, and explicit `cwd`. It emits the normalized JSON snapshot described in [child recovery](child-recovery.md). The portable seam reads canonical status and connects registered child-entry/exit notifications to Cadence commands. Preserve existing hook entries and keep pack-specific adapters outside the shared skill payload.

A missed entry notification is reconciled on resume. A missed exit still needs explicit return evidence. Hook notification does not certify completion. Standalone/goal attachment records use owning-work references and explicitly state that no KBD lifecycle is present.

Record the cadence root/profile, chosen increment, candidate/work-ahead identities and complete featureOperation in the existing authored dispatch contract. Preserve that operation through child/scope splits; if the split moves it to a later delivery, explicitly assign a replacement operation or an approved creation task before starting the earlier delivery. Use the pack adapter's `dispatch --project <project> --input <request.json>` to return that contract with a fresh canonical snapshot. It is a read-only envelope, not KBD approval or a Cadence start. Optional `cadence-binding.json.dispatchFile` names the authored JSON request for child hooks to carry its operation and candidate references; it never points at generated waypoints. Full `kbd-goal` keeps its controller owner; mini uses available native goal capabilities. No automatic plugin installation, daemon, cross-harness scheduler, or assumed background continuation.

## Teams

Select `.agent-team/project-routing.json`, then its team manifest. Assign explicit role/path ownership, inputs, outputs and dependencies. Independent runtime, UI/localization and packaging/documentation work may proceed concurrently under configured resource limits. One writer per shared build directory and one metadata/site publisher. Physical output reservations coordinate cooperating local runs only; team concurrency and remote serialization still require the harness/consumer. the lead performs checkpoint-only optimization, not continuous review. Fall back to sequential role work when delegation is unavailable.

## The Boss

Keep 120-minute increments, local `pnpm build:mac:arm64`, launch, then operation of the completed new feature. A window alone proves launch only. Fix observed build/run failures before promoting work-ahead; independent authorized edits can continue.

Every second successful delivery requires macOS ARM64/x64 and Windows x64/ARM64 artifacts, release metadata, and exact website download pointers. Linux installers remain excluded. Publication stays due until the latest corrected delivery has all required immutable receipts. Publication debt is candidate-specific and survives concurrent work. One authorized work-ahead scope may proceed after production freeze in isolated roots; promotion respects delivery failures, child/hook/review gates and release capacity. Version-changing promotion must wait if an active publisher consumes that version from a release branch. A local lock cannot enforce a remote publisher. Unsupported exact-source or serialization capabilities are blocked with an assigned follow-up.

Use the configured worktree explicitly. Preserve unrelated changes, freeze source identities and retain previous artifacts until replacements have the required evidence. Old installed acceptance cannot certify new bytes. Native platform execution not performed must remain pending.

## Karpathy and Compass

`learning` config invokes the existing recorder with command/argument-array/cwd and `{report}` substitution. The durable local report remains available if optional memory services fail. Cadence does not write an invented canonical store or fabricate completion records.

Refresh Compass for changed repositories approximately hourly when resource capacity permits. Record revision, observed operation and deferred reason. A handshake is not a graph refresh. Do not compete with an active heavy build.

## Installing across tools

From the full skill system, run `node <full-pack>/scripts/distribute-delivery-cadence.mjs --targets all`. The selective installer copies this entire skill for Codex, Claude Code, Kimi Code, MiniMax, Zed and OpenCode and records separate KBD/Karpathy support paths. It preserves unrelated skills; conflicts require deliberate resolution. Restart or reload existing harness sessions to discover new files. Installation and CLI operation do not prove a native harness has loaded the skill.

Use the mini copy inside The Boss when a full pack is already installed; never install mini globally over a full-pack installation. For detailed ownership, dry-run and target options, see the full pack documentation at https://github.com/Prometheus-AGS/prometheus-skill-system/blob/main/docs/delivery-cadence-distribution.md.

## Publication consumer command

A supported registered consumer uses a Node executable, explicit cwd and string-array args containing a literal `{request}` argument. Cadence replaces that one argument with a private JSON request path; no shell is used. `secretEnv` lists environment names and `timeoutMs` bounds acknowledgement waiting. Never put credential values in the request or returned identity.

The consumer reads the request including stable attemptId/correlationId, candidate/source digest, version, approved effects and expected predecessor. It must write only a JSON acknowledgement to stdout: `{ "schemaVersion":1, "attemptId":"...", "correlationId":"...", "status":"dispatched", "externalIdentity":{ "repository":"org/repo", "workflow":"release", "runId":"..." } }`. Allowed identity keys are repository, workflow, runId, jobId, url and id. This acknowledges dispatch only; platform/metadata/site receipts arrive separately through reconciliation.

A durable exclusive claim prevents duplicate dispatch. Successful acknowledgements are replayed locally; timeout, interruption or malformed/lost acknowledgement leaves an unknown external outcome. Reconcile the actual remote identity and effects before a deliberate new attempt. The adapter never retries an unknown launch merely because no process remains. Raw consumer stdout/stderr is not persisted.
