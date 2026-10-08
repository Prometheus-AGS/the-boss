# Design

## Source contract

Keep the existing flow: Settings draft → strict shared IPC authoring schema → private revision store → bundled creator compiler → immutable package → existing private workspace binding → normal Work entrypoint. No new persistence or runtime service.

Use `specialist-delivery` with role order coordinator, product, ui-ux, mobile, security, documentation, code-review. The coordinator delegates; specialists receive existing readonly filesystem choices. Operators retain explicit manual model, skill, knowledge and tool selection. Roles and scope are instructions, never authority. Native max-member support must be confirmed before increasing schema/editor capacity to seven.

Member fields `projectScope`, `outputInstructions`, `evidenceInstructions` are optional bounded strings, interpreted as empty when absent. Project scope describes project-relative paths or areas in plain text; it is not a filesystem allowlist. Append only populated fields to compiled instructions, preserving compilation of existing teams. Include populated delivery text and its structured fields in sourceIdentity digest; new fields therefore change a new immutable revision without changing old stored packages.

## UI contract

Native capacity inspected at UAR `b0070b42e7d39d06dca83094cd7868920760cbed`: draft.2 common limits permit maxMembers up to 16; team_planning.rs checks against the definition's declared maxMembers, execution clamps to the private binding cap, and MAX_CONTEXT_ROSTER_MEMBERS is 16. Boss authored deployment already derives its binding cap from member count. Seven therefore fits the existing source contract; runtime acceptance remains pending.

Refine the existing Operate settings surface using shared Textarea controls, associated labels, existing disabled state and semantic tokens. Place the three fields after member instructions. Explain project-relative work scope and that actual permissions remain governed by host policy. Use ordinary text, no raw JSON configuration. Preserve the existing model/resource and reviewed-guidance controls, dirty/save/deploy behavior, keyboard order and wrapping.

## Verification boundary

Prepare a source-only packaged operation that uses the existing maintained launcher, real UAR/gateway normal profile, disposable workspace, visible editor/Work controls and bounded approvals. It must author all seven roles, save and revise member fields, deploy, run each specialist with real correlated artifacts, reload and reopen both immutable revisions. It must retain model/resource selections and earlier run identities. Record source hashes and credential-free receipts; renderer reload is not process restart.

Root executes the operation once after all next-increment production source and packaging finish. No tests, compiler checks, installs, formatting gates, builds or reviewer loops run during this authoring work. Independent UI/runtime review and native Windows acceptance remain pending.

## Instruction reconciliation

## Observed specialist budget repair — 2026-10-08

Packaged 2.2.19 at Boss `8bdca9ac3b7ee1c98592bee4f97d8749829cf555` and UAR `b0070b42e7d39d06dca83094cd7868920760cbed` completed five specialists, then blocked its coordinator wait with `TEAM_BUDGET_EXHAUSTED`. Retained reservations reached 61,440 tokens, 7,500,000 cost microunits and the entire 2,400-second budget. Usage was unknown, so UAR conservatively retained completed/yielded reservations; no native accounting change is warranted.

Size new compiled definitions for the initial coordinator reservation plus one member reservation and one coordinator continuation per non-coordinator. Preserve the existing floors for smaller teams. Six specialists require 77,824 tokens, a 10,000,000 cost-microunit cap and 3,060 reserved seconds. These are aggregate reservation caps, not an execution-time promise. Deployment consumes the exact budget of the immutable compiled root document; old revisions and bindings retain their original caps. Native admission and effect authorization remain unchanged.

The failed operation remains failed. Rebuild the repaired source and rerun only this affected packaged author/deploy/run/reopen procedure before claiming C16.1 completion.

## Observed coordinator reference repair — 2026-10-08

The budget-corrected packaged operation at Boss `a91577f66551c5fde0acdba6ccac728e7e8b7556` completed product, UI/UX, mobile and security. Coordinator attempt `ea2e6d43-cf25-4c6f-9d3c-35a6106e0b2e` then supplied a nonexistent UI/UX artifact ID to `team_wait`: `artifact-51abdfa4-2440-472e-8625-165e05bac0e6518ca0` instead of the actual `artifact-51abdfa4-2440-472e-8625-165e05bac0e8`. Its security target and exact-attempt delegation were valid. UAR correctly refused the payload with `TEAM_SCOPE_DENIED`; the coordinator ended before documentation and review.

Compiled coordinator guidance now requires opaque references to be copied exactly from attributed context or accepted receipts, explains automatic target-artifact selection, and permits correcting only an unaccepted wait with a new command identity. An accepted delegation must never be repeated to recover that wait. Native artifact, task, actor and workspace authorization remains unchanged. Existing immutable packages remain unchanged; corrected guidance applies to newly compiled revisions.

The operation records incomplete coordinator termination immediately instead of waiting fifteen minutes for work that will not be delegated. Preserve the cancelled failed attempt and original delivery clock, rebuild the changed production package, and repeat only the affected author/deploy/run/reopen procedure.

The generic openspec-propose planning pause does not revoke the explicitly approved implementation assignment. The task's Assisted-by-only signed commits supersede CLAUDE.md's DCO signoff instruction. Compass has no exact compileAuthoredTeam node and incomplete published coverage; direct source establishes the affected path.
