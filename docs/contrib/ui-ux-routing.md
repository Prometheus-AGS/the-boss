---
description: The Boss UI/UX catalog, project-team adoption, portable helpers, and completed-phase evidence limits
sources:
  - resources/skills/prometheus-ui-ux
  - resources/skills/prometheus-ui-review
  - resources/skills/ui-ux-pro-max
  - scripts/sync-prometheus-skills.ts
  - scripts/package-prometheus.js
  - .agent-team/project-routing.json
  - .agent-team/boss-core/skill-bindings.json
  - src/main/services/prometheus/fullPackDetection.ts
  - src/main/services/prometheus/pushSkills.ts
---

# UI/UX routing and team adoption

This guide describes the merged source integration. It does not certify a published installer: the existing 2.2.2 binary predates this adoption. A future release must freeze its sources, package the payload, and complete the applicable installed acceptance in [The Boss release workflow](the-boss-release.md).

## What is included

The shared catalog has 41 entries. The Boss consumes mini's **40 portable entries** as part of **97 synchronized mini skills** in `resources/skills/`. The canonical mini source is the pinned `resources/prometheus-skills-mini` submodule; `pnpm skills:sync:prometheus` produces the tracked built-in copies. Packaging also carries the mini runtime closure. Do not hand-edit the built-in copies to diverge from that source.

The workflow includes `prometheus-ui-ux`, `prometheus-ui-review`, `prometheus-impeccable-core`, Node-based UI/UX Pro Max search, selective taste/craft guidance, and platform instructions. Catalog inclusion records provenance and suitability, not proof that a skill is universally best.

Mini's Impeccable core is a bounded workflow adaptation. The full-only native detector/live-browser engine is excluded; its proposed Node port is **not implemented or invocable**. See the [deferred engine design](../../resources/skills/prometheus-ui-ux/references/deferred-ports.md). Portable SwiftUI, Android, Flutter, and other platform guidance does not install SDKs or prove native execution.

## Choose context and roles

The [project routing record](../../.agent-team/project-routing.json) selects the existing `boss-core` team for code work. Read its [routing table](../../.agent-team/boss-core/routing.md), [skill bindings](../../.agent-team/boss-core/skill-bindings.json), and [design playbook](../../.agent-team/boss-core/design-playbook.md).

| Work | Role and entry point |
| --- | --- |
| User-visible flow, design, accessibility | `boss-ux` → `resources/skills/prometheus-ui-ux/SKILL.md` |
| Renderer implementation | `boss-renderer` → the same router plus relevant React/Electron guidance |
| Completed UI acceptance | `boss-verifier` → `resources/skills/prometheus-ui-review/SKILL.md` in an independent context |
| Backend-only changes | Relevant existing specialist; no UI workflow preload |

Ten role identities and their ownership are retained. Native definitions configure roles; they do not prove a harness invoked them. The lead assigns disjoint work; reviewers activate only after the complete implementation phase. When native delegation is unavailable, follow selected roles sequentially and disclose that builder-context inspection is not independent review. Zed's parallel-thread UI is not an automatic delegation API, and external ACP agents retain their native configuration.

The operational desktop defaults to **Operate** mode. Read [DESIGN.md](../../DESIGN.md), [.impeccable.md](../../.impeccable.md), the [token system](../../packages/ui/docs/design-token-system.md), and the [variable catalog](../../packages/ui/docs/variable-catalog.md) before visible changes. Preserve `@cherrystudio/ui` components, semantic tokens, fonts, and the tracked `cherry-electron-dev` workflow. Pro Max recommendations do not replace project design authority.

Refinement and review load no taste implementation. New surfaces or an explicitly authorized redesign may select one taste implementation and at most one requested overlay. `gpt-taste` requires an actual GPT-family model, not merely a particular harness. User-only `interface-review`, `break`, `variant`, and `explain-interface` remain user-invoked.

## Use the portable helpers

The helpers require Node.js 22+ and carry their runtime assets; no Python, native engine, extra daemon, or network service is needed. Developing The Boss itself requires the stricter [.node-version](../../.node-version) and [package.json](../../package.json) pins. Use the skill's actual installed directory when running outside this checkout.

From this repository root, save a request such as `ui-request.json`:

```json
{
  "project": ".",
  "affected": ["src/renderer"],
  "operation": "refine",
  "surface": "app",
  "focus": "layout",
  "ui": true
}
```

```text
node resources/skills/prometheus-ui-ux/scripts/cli.mjs route --input ui-request.json
node resources/skills/ui-ux-pro-max/scripts/search.mjs "keyboard navigation React 19" --stack react --json
```

Read returned context files before the selected skills. Use focused search for refinement; generate a complete design-system recommendation only when establishing or explicitly replacing visual direction. Missing skills or tooling are gaps, not silently downloaded dependencies. Pro Max persistence writes its own `design-system/` output and preserves existing master/page decisions unless replacement is authorized; it does not overwrite `DESIGN.md`.

## Installation is separate from export

The UI bootstrap/injector installs the portable catalog and routing instructions. Existing-team adoption is a separate creator operation. For an explicitly selected project, preview both before applying:

```text
node resources/skills/prometheus-ui-ux/scripts/cli.mjs install --project "<project>" --dry-run
node .agents/skills/agent-team-creator/scripts/cli.mjs install-project --project "<project>" --team boss-core --dry-run
```

Use `boss-core` only for a project containing that team; otherwise select the project's actual team. Omit `--dry-run` to apply an authorized installation; use `--check` to inspect drift without writes. Installation preserves project protocol overrides, unrelated instructions, and existing native configuration. Read its result and the project's `.agent-team/project-routing.json` rather than assuming every harness discovers identical files.

Creator **export** produces artifacts for inspection and deliberate merging; it does not install or activate a project team. Do not rerun initialization to overwrite live team state. The UI-only installer does not perform Zed team adoption; creator's `install-project` owns that operation and records effective instruction files.

The Boss application keeps its mini runtime in application data. Existing full-pack detection and refusal to push mini into native skill roots when a full pack is present remain unchanged: the full pack is authoritative and must not be shadowed. Repository synchronization, project installation, and application-to-native skill pushing are distinct operations. See [pushSkills.ts](../../src/main/services/prometheus/pushSkills.ts) and [fullPackDetection.ts](../../src/main/services/prometheus/fullPackDetection.ts).

## Complete the phase, then gather evidence

After the complete authorized UI implementation, change the request's operation to `review` and run:

```text
node resources/skills/prometheus-ui-ux/scripts/cli.mjs phase-boundary --input ui-request.json
```

This returns an evidence contract with `status: "evidence-required"` and `executed: false`. It accepts no evidence payload, launches no browser, runs no checks, and cannot certify PASS.

Use a verified tracked Electron instance for applicable window widths, light/dark states, real content, keyboard/focus, loading/empty/error/disabled states, overflow, and reduced motion. Keep credentials out of captures. The independent reviewer records PASS/BLOCK against actual evidence with scoped findings and unavailable checks. Allow one batched correction/confirmation cycle; outstanding blockers remain blocking. Screenshots do not substitute for native screen-reader or installed Windows evidence.

## Recorded evidence and remaining gaps

The [packaged-helper receipt](../../.agent-team/boss-core/ui-routing-packaged-evidence.json) records a macOS offline materialization and helper run with 40 portable skills, preserving 50 native definitions and ten role ownership records. The [pin/sync receipt](../../.agent-team/boss-core/ui-routing-pin-sync-evidence.json) records synchronization and unchanged anti-shadowing implementation. These are source/payload evidence, not installer or Electron acceptance.

The [mini delivery record](../../resources/prometheus-skills-mini/docs/research/ui-ux-routing/DELIVERY.md) separates macOS/Linux helper evidence and independent skill-contract review from release gaps. Native Windows execution, live invocation across every supported harness, and a full installed Electron run remain unverified for this adoption. The prior Boss repository lint stopped on bundled creator diagnostics; later pipeline stages were not proved. No rendered product UI changed in the routing implementation, so its receipt has no product screenshot acceptance claim.

## Documentation surface

The Boss documentation is repository Markdown, linked from [docs/README.md](../README.md). There is no local Docusaurus site in this repository. The inherited documentation-dispatch workflow points to the upstream docs repository and is not evidence of a deployed Boss documentation site. Edit source headings/frontmatter, generate the index with `pnpm docs:index`, then run `pnpm docs:check` at the completed documentation boundary.
