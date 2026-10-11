# Session Log

Append-only. Mark superseded entries; do not delete them.

## Session learning handoff — BAUAR — 2026-10-10

This is an archival learning record explicitly requested by the operator. It is not a canonical KBD task/change/phase completion event. Acceptance and certification were transferred to the receiving session; its newer evidence takes precedence over this dated baseline.

### Delta

All four BAUAR source PRs are merged. Sixteen evidence-linked lessons were persisted in Surreal Memory and read back. The archive retains original failures, deferrals and cancelled scope.

### Root Cause

Observed delays and gaps included damaged copied pnpm topology, plan/preparation mismatches, missing archived-task reconciliation, and mistaken or incomplete review/evidence claims. Historical Keychain, earlier aggregate runtime and external-hook incident causes remain unresolved where receipts do not establish them.

### Corrective Actions

Resume from receiving-session state and fresh source/artifact evidence; keep one authoritative loop and exact approval ownership. Preserve actual binary provenance, configured MCP credentials, F6 exclusions, isolated hook roots and tracked-process diagnostics. Do not repeat passing gates or treat unexecuted checks as PASS.

### Memory retrieval and evidence

Surreal Memory: search_memories(query='BAUAR archive handoff 2026-10-10', categories=['BAUAR'], session_id='bauar-architecture-2026-10-06-to-2026-10-10', limit=20). Knowledge graph entity: BAUAR Session Handoff 2026-10-10.

Full learning artifact: /Users/gqadonis/Projects/prometheus/bauar-handoff-2026-10-10/session-learnings.md. Durable IDs and readback results: /Users/gqadonis/Projects/prometheus/bauar-handoff-2026-10-10/memory-publication-receipt.json. Exact source commits: /Users/gqadonis/Projects/prometheus/bauar-handoff-2026-10-10/publication-manifest.json. Removed paths: /Users/gqadonis/Projects/prometheus/bauar-handoff-2026-10-10/relocation-manifest.json.

### Findings, standards and lessons

#### Merged publication boundary and receiving-session ownership

As of this session's 2026-10-10 publication boundary, all four BAUAR source PRs merged: Boss PR70 main 2f6238fd02b6200dc1b878e5385d807cdbd1a24f; UAR PR368 fe77af32d38cc1ffcd0fdf5c34336943825e000d; Bossfang/librefang PR154 bb2e87f55b564b9b8aab7f1b716c3f03fa90d472; mini PR55 c3936d8c2264e0366b41a6d515479c6390db5fa9. Boss source reconciliation head21cd118870243a08cef2afacc3779a74a0919847 resolved fifteen conflict paths plus required callers while preserving newer main authority/principal/instance/catalog behavior. Further runtime tests, builds, final review and certification were transferred to the operator's other session. Publication is complete; acceptance is not thereby complete. Treat this as a dated baseline: the receiving session may have advanced it. Restore publication-manifest.json and that session's current receipts before doing more work.

Evidence: publication-manifest.json; boss/pr70-publication-receipt.json.

#### Model provider, execution harness, job orchestrator and application host

Preserve four distinct responsibilities. A model provider supplies model responses, tool proposals and correlated continuation. UAR is the execution harness and owns the authoritative delegated agent loop, native execution and run continuation. Bossfang is the job orchestrator and owns jobs/attempts and observation of delegated full runs. The Boss application owns desktop configuration, credentials, host policy, exact human approvals and durable admission consumption. Calling UAR only as an LLM driver leaves Bossfang owning its own loop; that is not full-run harness delegation. Each job attempt must have one authoritative loop, with approvals and effects bound to that execution. Do not run a second local agent loop over a delegated full run or replay ambiguous effects. Existing automatic cron/deferred paths without a JobAttemptRef remained native at the reviewed boundary. Selected tests support scoped paths, not every deployment.

Evidence: mini-workstream/.kbd-orchestrator/phases/bossfang-uar-authorization-and-execution/reflection.md; boss/bauar-testing-handoff-2026-10-10.md.

#### MCP configuration credentials are distinct from agent caller identity

Operator explicitly rejected the assumption that the agent user's JWT should authenticate every outgoing MCP call. The application/MCP server configuration owns the resource credentials for that call. Distinguish inbound caller JWT/opaque token, sidecar authentication, provider API credentials, configured MCP resource credentials and approval capabilities. No concrete remote MCP receiver, IdP or new credential custodian was selected; remove defaults and do not invent an external OAuth acquisition/refresh deployment. Retain actual scoped owner/run/destination/grant/lease/revision boundaries where implemented. HTTP and stdio have separate credential/process boundaries. Neither configured sandboxing nor this decision proves every remote tenant/authentication deployment secure; external multi-user acceptance remains unclaimed. Do not reopen the withdrawn concern as a release blocker without a new authorized observed problem.

Evidence: boss/bauar-testing-handoff-2026-10-10.md; mini-workstream/.kbd-orchestrator/phases/bossfang-uar-authorization-and-execution/reflection.md.

#### Admission v2 binds execution kind and consumes authority before effects

Strict admission v2 distinguishes runtime_native from host_mcp and includes executionKind in prepared invocation, authority digest, receipt and managed MCP metadata. Revalidate current disposition, scope, authority and immutable binding after awaits; preserve main authority-provider/principal checks. Native consumption uses the native-consuming claim before dispatch; managed host MCP dispatch consumes its own admission before effects. A consuming claim is permission to execute, not proof the effect happened. Repeated claims, lost acknowledgement, changed policy, interruption and cancellation require the actual recorded state; unknown effects must not be automatically replayed. Do not regress to the earlier native terminal/state mismatch or call v1/v2 interchangeable. The bounded PR70 static review checked caller integration; it did not execute the merged behavior.

Evidence: boss/pr70-static-review.json; mini-workstream/.kbd-orchestrator/phases/bossfang-uar-authorization-and-execution/children/desktop-mcp-projection-acceptance/reflection.md.

#### Exact approval-ID cutover and source-derived executable binding

Operator approved a strict cutover: require a nonempty exact approval ID and update owned callers together, including root and descendant approval paths. Tool-call IDs and presentation IDs are not substitutes. Bind approval to canonical executable input, invocation/admission/run/attempt and current execution. UI safe-action displays and secret projection are presentation; do not silently execute edited display/input as the original authorized action. The reconciled Boss controller always sends approval_id through the selected current instance; UAR callers were adapted together in PR368. Retain cancellation/reconnect/post-ack handling and durable lifecycle evidence. An approval capability is not the MCP resource credential. A visible approval or completed task box is not proof an effect occurred.

Evidence: boss/pr70-static-review.json; uar/bauar-testing-handoff-2026-10-10.md.

#### Actual UAR v2 binaries are a packaged acceptance prerequisite

At Boss PR70 merge, truthful main metadata retained published source308aea46ff26e7f61340281bb51f67ebe5351569 for all four UAR packages and local-uar-source.json. That source supports admission v1; merged BAUAR Boss uses v2. UAR PR368 sourcefe77af32d38cc1ffcd0fdf5c34336943825e000d supplies v2, but a source merge does not rebuild existing binaries. Both versions advertise administration schema5 and the same admission capability names without a protocol discriminator: existing checks cannot distinguish v1/v2 before catalog synchronization; v1 refuses v2 at run admission. The receiving owner must build/select actual server-full v2 artifacts and update actual platform URL/source/size/SHA256 plus local source selection together. Never relabel a v1 binary as compiled from v2 or downgrade authority. This is a dated dependency to recheck against receiving-session updates, not a claim no one has since fixed it.

Evidence: boss/bauar-testing-handoff-2026-10-10.md; boss/pr70-static-review.json.

#### Source, emitted binary, package and acceptance boundaries stay separate

Record source revision, compilation inputs, emitted binary/archive digest, packaged application/ASAR digest and actual scenario execution separately. Historical equality can preserve applicability of selected source-bound results but does not create a fresh whole-tree build or test. Ordinary and instrumented sidecars have distinct emissions and claims. An external-current-UAR override does not certify the bundled sidecar. A receipt wrapper exiting0, a completed task disposition, artifact QA, a passing individual predicate and successful aggregate acceptance command are different outcomes. Preserve failed/interrupted/cancelled/deferred receipts; do not rewrite them into PASS. Original goal attainment, selected implementation completion, publication and human release certification are distinct states.

Evidence: mini-workstream/.kbd-orchestrator/phases/bossfang-uar-authorization-and-execution/reflection.md; mini-workstream/.kbd-orchestrator/phases/phase-bauar-release-integration-2026-10-09/reflection.md.

#### Private profile roots isolate filesystem paths, not macOS Keychain

THE_BOSS_PROFILE_ROOT selects an existing canonical private filesystem root early, before configuration/logging. Invalid selections produce a fixed nonsecret stderr message and synchronous exit2. Valid roots route config,userData,sessionData,temp,logs and suppress development-root/log suffix diversion. Omitting the variable preserves main default/development/portable/BootConfig selection. This is not a macOS Keychain sandbox. Historical desktop D01 stalled during async safeStorage/Keychain initialization before sidecar creation; consent denial, deadlock or root cause was not confirmed. Operator consent was granted for legitimate local Keychain handling, not plaintext encryption/bypass. D01-D04 were not completed here; a later retry lacked candidate node_modules/Playwright and launched no runtime. Current-session source review does not reproduce either condition.

Evidence: boss/bauar-testing-handoff-2026-10-10.md; boss/pr70-static-review.json.

#### Preserve locked pnpm topology and declare candidate preparation

Observed integration failure: copying pnpm dependency directories while dereferencing links changed package resolution; fixing get-tsconfig exposed a later signal-exit mismatch. Rebuild the coherent frozen-lockfile graph rather than patching lookup edges after graph-wide relocation damage is established. Resolve package engine requirements before scheduling child commands: Boss used existing Node24.11.1/pnpm12.3.4 while orchestration/UAR packaging used Node22; no version upgrade was required. Plans must account for unchanged npm-ci/checksum-pinned packaging hooks and missing locked assets. Operator authorized those isolated locked/pinned operations and then routine completion; do not repeatedly request already-given authorization. Preserve previous candidate inputs and separate compiler duration from coordination delay. No fresh restoration/build ran after the final testing transfer.

Evidence: mini-workstream/.kbd-orchestrator/phases/phase-bauar-release-integration-2026-10-09/reflection.md.

#### Tracked-process diagnostics and finite secret projection

Observed incident: broad process-title inventory exposed credential-bearing arguments before filtering. Do not enumerate unrelated command lines/environments; select recorded owned child identities and filter before any output. Retain value-free incident records; credential rotation was recommended in that historical incident but not verified, so do not claim completion. Known-secret projection covers a finite captured credential corpus and relevant model/user/history/catalog/MCP/error/stream surfaces, not unknown transforms, opaque constructor-owned credentials or dependency-internal logs. Projected presentation must not alter executable arguments or configured client authentication. Trace security changes to actual boundaries and observed/source-established behavior, not invented threats. Broader error-string projection warning had no reproduced secret-bearing failure at the child boundary.

Evidence: mini-workstream/.kbd-orchestrator/phases/phase-bauar-release-integration-2026-10-09/reflection.md; mini-workstream/.kbd-orchestrator/phases/bossfang-uar-authorization-and-execution/children/desktop-mcp-projection-acceptance/reflection.md; boss/pr70-static-review.json.

#### Operator deferrals, F6 cancellation and phase handovers remain explicit

The operator required staged assess/analyze/spec/plan/execute/reflect handovers, later explicitly waived broad regression/review/certification to implement first and test later, then transferred remaining testing to another session and authorized source PR merges/cleanup. Respect the latest authorized scope without reasking routine permissions; give time for required product choices and do not treat elapsed time as approval. Preserve failures as failures and deferrals as unpassed separately owned work. F6 transport-session ownership was withdrawn: tests/bauar_session_owner.rs and src/uar/mcp_server.rs remain excluded from inspection/search/hash/diff/tests unless the operator reopens them. Do not infer no vulnerability from cancellation. Historical acceptance snapshot revision490 had8/11tasks,2/3changes; it is not the receiving session's live state. Do not mutate original shipping/C05 gates, canonical projections or certification from archival logging.

Evidence: README.md; mini-workstream/.kbd-orchestrator/phases/bossfang-uar-authorization-and-execution/reflection.md; mini-workstream/.kbd-orchestrator/phases/phase-bauar-release-acceptance/execution.md.

#### Recoverable cross-session handoff and session-owned worktree cleanup

Preserve exact branches/source refs, working-tree additions, safe receipts and private evidence before removing session worktrees. HEAD alone misses uncommitted/untracked deliverables. Consume another session's repair through hash/source/canonical receipts rather than duplicate its work. Keep raw logs/profiles/private artifacts out of Git and external memory. This session preserved evidence at /Users/gqadonis/Projects/prometheus/bauar-handoff-2026-10-10; relocation-manifest.json maps removed paths. All eight known session worktrees were removed/unregistered before this memory handoff; unrelated sessions' worktrees and primary checkouts are not owned by this session. Existing app worktree attachment can be stale even when filesystem/Git prove removal. Large retained evidence lives outside worktrees and was retained for receiving-session needs; deleting that evidence is a separate retention decision, not worktree cleanup.

Evidence: cleanup-receipt.json; boss/pr70-cleanup-receipt.json; relocation-manifest.json.

<!-- karpathy-progress-event:bauar-session-learning-2026-10-10-2 -->
