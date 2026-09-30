# Harness and delivery adapters

## KBD and goals

The owning harness runs work; Cadence is delivery metadata, not another scheduler. The profile mode is `standalone`, `kbd` or `goal`. `binding` names the project/phase/goal and source ledger. Only existing KBD commands write canonical transitions/completion. Native goal limits and architecture approvals remain authoritative.

Configure `binding.canonicalCommand` with a trusted executable, string-array `args`, and explicit `cwd`. It emits the normalized JSON snapshot described in [child recovery](child-recovery.md). The portable seam reads canonical status and connects registered child-entry/exit notifications to Cadence commands. Preserve existing hook entries and keep pack-specific adapters outside the shared skill payload.

A missed entry notification is reconciled on resume. A missed exit still needs explicit return evidence. Hook notification does not certify completion. Standalone/goal attachment records use owning-work references and explicitly state that no KBD lifecycle is present.

Record the cadence root/profile and chosen increment in the existing dispatch contract. Full `kbd-goal` keeps its controller owner; mini uses available native goal capabilities. No automatic plugin installation, daemon, cross-harness scheduler, or assumed background continuation.

## Teams

Select `.agent-team/project-routing.json`, then its team manifest. Assign explicit role/path ownership, inputs, outputs and dependencies. Independent runtime, UI/localization and packaging/documentation work may proceed concurrently under configured resource limits. One writer per shared build directory and one metadata/site publisher. These limits are harness responsibilities; the lead performs checkpoint-only optimization, not continuous review. Fall back to sequential role work when delegation is unavailable.

## The Boss

Keep 120-minute increments, local `pnpm build:mac:arm64`, launch, then operation of the completed new feature. A window alone proves launch only. Fix observed build/run failures before continuing.

Every second successful delivery requires macOS ARM64/x64 and Windows x64/ARM64 artifacts, release metadata, and exact website download pointers. Linux installers remain excluded. Publication stays due until the latest corrected delivery has all required immutable receipts. Only evidenced corrective scope may run while publication is due; unrelated product scope waits.

Use the configured worktree explicitly. Preserve unrelated changes, freeze source identities and retain previous artifacts until replacements have the required evidence. Old installed acceptance cannot certify new bytes. Native platform execution not performed must remain pending.

## Karpathy and Compass

`learning` config invokes the existing recorder with command/argument-array/cwd and `{report}` substitution. The durable local report remains available if optional memory services fail. Cadence does not write an invented canonical store or fabricate completion records.

Refresh Compass for changed repositories approximately hourly when resource capacity permits. Record revision, observed operation and deferred reason. A handshake is not a graph refresh. Do not compete with an active heavy build.

## Installing across tools

From the full skill system, run `node <full-pack>/scripts/distribute-delivery-cadence.mjs --targets all`. The selective installer copies this entire skill for Codex, Claude Code, Kimi Code, MiniMax, Zed and OpenCode and records separate KBD/Karpathy support paths. It preserves unrelated skills; conflicts require deliberate resolution. Restart or reload existing harness sessions to discover new files. Installation and CLI operation do not prove a native harness has loaded the skill.

Use the mini copy inside The Boss when a full pack is already installed; never install mini globally over a full-pack installation. For detailed ownership, dry-run and target options, see the full pack documentation at https://github.com/Prometheus-AGS/prometheus-skill-system/blob/main/docs/delivery-cadence-distribution.md.
