---
description: Dated record of every upstream CherryHQ/cherry-studio merge into The Boss fork, plus open branding items carried between merges
sources:
  - docs/contrib/upstream-merges.md
  - .agents/skills/upstream-merge/SKILL.md
---

# Upstream merge log

What each merge actually hit. Rules belong in [the playbook](./upstream-merges.md);
this page is history and carry-over. Newest entry first. The `upstream-merge` skill
appends here as its last step.

## 2026-10-01 — Cherry Studio main (upstream Grok compatibility)

- **Baseline:** Boss `7653c6a3e22a778f202b1d8a1f8a1edca36f47a1`; upstream `e2f53146eb6944718b091661df0854c75a4d933a` (94 incoming commits).
- **Version:** retain The Boss 2.2.9; upstream 2.1.4 must not downgrade the fork.
- **Conflicts:** combine upstream native-module filters with UAR payload exclusions; preserve Boss home directory with upstream isolated developer profiles; retain UAR enablement while adopting upstream removal of DSH from new-agent choices; retain both channel imports.
- **Persistence:** all shipped Boss migrations through 0025 are unchanged. Generate a fresh 0026 from the merged schemas for remote commands, diagnostics and paired-device identity/grants. Do not reuse upstream snapshot identities.
- **Preferences:** regenerate from merged source definitions; restore timestamp-only generated changes.
- **Locales:** per-key three-way merge of 26 catalogs; preserve Boss keys and branding. Adopt current network and invitation descriptions. Preserve distinct Boss/upstream 2.1.3 release notes in source-labelled sections within the existing unique-version schema. Regenerate built-in product knowledge from resolved sources.
- **Dependencies:** regenerate lockfile from upstream baseline with fork dependencies and patches; use Node 24. The first install under Node 26 left missing native bindings; a forced installation under Node 24 completed.
- **Retained worktrees:** no unmerged commits on the primary local branch. Convergence docs commit 480703469a remains separate. Older UAR branch commits f045e9636b, bae9d0aaf4, d40c2f2cd4 and launch-isolation e11fedb1ef remain ancestry-unmerged and are not silently imported; 51c231efe7 and 996f8d0460 have patch equivalents in main. Local modifications and untracked files remain in their original checkouts.
- **Grok protocol:** retain the existing OAuth subscription provider and saved IDs. Compare official xai-org/grok-build source `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8` (source version 1.0.45) with npm `@xai-official/grok` 1.0.46. Target the published compatibility version; add proxy authentication-response and interactive-mode headers, truthful The Boss client identity, and token-request version headers. Preserve core scopes, PKCE, refresh and subscription-only billing. Add localized recovery messages for authentication, model, entitlement and client-version errors. No Grok executable is bundled.
- **Evidence boundary:** missing headers and stale version are source-confirmed discrepancies; recent local logs contain no Grok requests. Max entitlement success has not been reproduced or demonstrated. The source and npm versions differ; this entry does not claim their implementations are identical.
- **Built source:** `b8924a6215ea21037cc867b6d578f249d4c04989`, following merge `ec199e2e15`. `pnpm build:mac:arm64` completed compilation; the first packaging attempt stopped at an uninitialized nested liter-llm checkout. Initialize its pinned `0617979022aea621dd13541dee07ad84ffcf7d21` revision and rerun only electron-builder packaging, then `validate-release-package.cjs darwin-arm64`: passed. An earlier superseded attempt was stopped to include the signed-out Pi OAuth correction found at the completed boundary.
- **Local artifact:** `dist/The-Boss-2.2.9-mac-arm64.dmg`, 704158896 bytes, SHA-256 `6b39b03aa4560e0190b224cb320ab42732eb863065b4556e7af6fdc48cf170e8`. Developer ID signed, mounted-image signature validated, not notarized, not published. UAR-enabled local profile includes pinned sidecar `afeb528b794961483862436edac6b7063065d66e`; mini inventory is 107 skills and 3795 runtime files.
- **Operated:** launch the exact packaged app with an isolated user-data directory. Its actual startup migrates a populated migration-0025 database to 0026, preserves a custom provider, retains `mcp_server.cwd`, and creates the new remote-command/diagnostic tables. Onboarding still shows “Set up LLM Providers.” Integration-settings and UAR administration snapshot IPC return successfully. Grok provider UI launches the browser OAuth flow and shows waiting/cancel feedback.
- **Checks:** build TypeScript compilation and i18n completeness passed (92976 translations). Repository-wide lint stopped on 111 findings, primarily pinned skill payloads; unrelated automatic edits were reverted. Documentation link checking stopped on three pre-existing links in bundled Vercel skills. No unit suites ran.
- **Pending:** no Grok OAuth token exists in the local baseline/isolated profile. Max-plan chat, agent streaming, follow-up, cancellation and actual served-model evidence require operator sign-in. Native Windows x64 operation and publication remain separate cadence gates. No subscription success is claimed. Git commits are locally SSH-signed; GitHub reports `no_user` for the configured author email.

## Open items

Branding work known to be outstanding. Close an item by moving it into the entry of
the merge (or commit) that fixed it.

- **Release notes** — `electron-builder.yml` `releaseInfo.releaseNotes` is upstream's
  "Cherry Studio X.Y.Z" text, replaced wholesale every release. Needs a fork-owned
  source (e.g. generated in `.github/workflows/the-boss-release.yml`) rather than a
  per-merge edit.
- **Product name in translations** — 42 non-English strings still say "Cherry",
  "Cherry Studio", or "Cherry-Studio" where `en-us` says "The Boss" (as of
  2026-09-22): 28 renderer (`de-de` 7, mostly `settings.dependencies.remove*ConfirmMessage`
  elsewhere) and 14 main-process (`apiGateway.docs.*`, plus 2 in `de-de`).
- **Product name in code and bundled agents** — `apiGateway/app.ts` (`'Cherry Studio API'`),
  two headless reasons in `builtinAgentGuardRules.ts`, and the built-in agents' bundled
  skills (`resources/builtin-agents/cherry-assistant/.claude/skills/**`,
  `resources/skills/cherry-tool-guide/**`).
- **Existing rows keep old names** — the default assistant seeder runs only on a
  fresh database, so installs seeded before the 2026-09-22 rename keep
  "Cherry Assistant". A rename seeder for the default assistant (like the one
  `cherrySupportSeeder` has for `Cherry 支持`) would fix them.

## Entry template

```markdown
## YYYY-MM-DD — upstream vX.Y.Z (<merge commit>)

- **Taken:** N upstream commits, <base>..<upstream sha>
- **Conflicts:** <file> — <resolution>
- **Rebranded:** <what upstream introduced that we renamed>
- **Left as upstream:** <accepted leftovers, and why>
- **Gate:** pnpm lint ✓, <tests run> ✓
- **Lessons:** <new rule added to the playbook, or "none">
```

## 2026-09-24 — upstream main (merge/upstream-2026-09-24)

- **Taken:** 34 upstream commits, up to `upstream/main`.
- **Conflicts:** `src/renderer/i18n/locales/zh-cn.json` — took upstream's Chinese
  `backup.error.newer_version` / `backup.error.operation_busy` over the fork's English
  placeholders, with Cherry Studio → The Boss.
- **Rebranded:** the `backup.error.newer_version` product name above.
- **Left as upstream:** 2 Cherry lines in test/e2e files.
- **Version:** stays 2.2.0; upstream's `package.json` is 2.1.2 and taking it would sit
  below the fork's shipped 2.1.3.
- **Gate:** `pnpm typecheck` ✓, `pnpm i18n:check` ✓ (after `pnpm i18n:sync` re-sorted the
  auto-merged catalogs).
- **Lessons:** none.

## 2026-09-22 — assistant rename (follow-up, no upstream commits)

- **Rebranded:** default assistant name (`DEFAULT_ASSISTANT_NAME`, zh `Boss 助手`),
  both built-in agent manifests (names and identity instructions), the runtime
  fallback instructions, the Support guard-rule and error text, and
  `chat.default.name` / Boss Support strings in every locale. English was
  already correct; the other twelve locales still said Cherry.
- **Found:** `DEFAULT_ASSISTANT_NAME` was still `'Cherry Assistant'` while the
  seeder's version hash claimed "Boss", so new users were seeded with the Cherry
  name.
- **Lessons:** added the Naming table and two detection values to the playbook.

## 2026-09-22 — upstream v2.1.2 (`2548629140`)

- **Taken:** 32 upstream commits, merge base `c3eda0c2b2`.
- **Conflicts:**
  - `package.json` — kept `name: TheBoss`, took `version: 2.1.2`.
  - `scripts/data-classify/data/target-key-definitions.json` — both sides only
    added keys (upstream: `shortcut.tab.close`, `shortcut.app.window.close`; fork:
    `app.prometheus.home_push.enabled`). The conflict came from fork commit
    `1937e4ab9d` re-sorting the whole file. Took upstream's text and order and
    appended the fork key.
  - `src/shared/data/preference/preferenceSchemas.ts` — regenerated; three other
    generated files had timestamp-only diffs and were reverted.
- **Rebranded:** three new renderer strings in 13 locales
  (`settings.skills.editor.conflict`, `settings.skills.remote.staleDescription`,
  `settings.skills.enableToTry.description`).
- **Left as upstream:** release notes, e2e and test fixtures, one log message.
- **Gate:** `pnpm lint` ✓; tests for the overlapping files plus the Prometheus and menu tests (272) ✓.
- **Lessons:** keyed-JSON and generated-file rules added to the playbook.
