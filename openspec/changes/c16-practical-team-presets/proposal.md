# Proposal

## Why

Approved C16.2 requires useful product research, marketing/brand, logo/design, mobile design and customer-feedback teams. The current editor exposes Coding, Product/design and Specialist delivery only.

## What Changes

- Add five bounded presets using existing member delivery fields and immutable authoring/compiler lifecycle.
- Explain each preset's deliverables and connector limits in the existing editor.
- Preserve explicit model, reviewed-skill, knowledge and tool choices; retain existing presets.
- Translate all new labels in the existing thirteen renderer locales.
- Prepare one packaged operation covering author/save/revise/deploy/product-marketing-design runs/reopen without executing it.

## Capabilities

### New Capabilities

- `uar-practical-team-presets`: Task-specific team starting points with bounded artifacts and explicit resource selection.

### Modified Capabilities

None. Existing active reusable-team and specialist-authoring changes remain intact; their lifecycle and resource contracts are reused.

## Impact

`src/shared/types/uarTeams.ts`, the narrowly extracted `src/shared/types/uarTeamPresets.ts` ID tuple, `src/main/ai/runtime/uar/uarTeamAuthoringPackage.ts`, the existing Settings authoring panel, renderer locales, `scripts/operate-practical-team-presets.mjs` and `scripts/practical-team-presets-operation`. Root also approved the exact-roster extension in `scripts/reusable-team-operation/approvals.mjs`; it preserves the existing tool, filesystem and identity checks. No new executor, service, dependency, version, submodule pin, grant or connector operation.

Work-ahead ID `c16-practical-team-presets-work-ahead-20261008` contributes to initiative `afc-c16-specialist-marketing-product-and-design-teams`, task C16.2. Root owns KBD/Cadence, build, packaged execution, review and publication. Customer-feedback prepares issue-ready artifacts and connector requirements only; C10 GitHub effect acceptance remains pending.
