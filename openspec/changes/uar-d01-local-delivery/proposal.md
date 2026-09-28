# Proposal: Package durable UAR administration on Apple Silicon

## Why

The exact `pnpm build:mac:arm64` command currently disables UAR. The pinned helper predates UAR's accepted C06 durable-agent and C07 local-observer capabilities, and The Boss settings do not expose either capability. A local Apple Silicon package must run the accepted helper and let an operator use those capabilities in two separate workspaces.

## Scope and source

This change implements the Boss-owned portion of Agent Fabric Convergence D01. The UAR source is the clean committed C07 revision `d4e5413c` (including C06 and SurrealDB 3.3.0); the final source freeze records its full SHA, the separately committed Boss SHA, the latest committed mini revision selected for this delivery, and the produced binary hashes. UAR C08 work remains separate. Public releases continue to require canonical Windows x64 and Mac ARM64 records from one UAR source revision; a local Mac record is never a public release input.

## Ownership

- Boss desktop packaging: `package.json`, `scripts/release-profile.cjs`, `scripts/integration-binaries.js`, `scripts/before-pack.js`, `scripts/after-pack.js`, `scripts/validate-release-package.cjs`, `scripts/uar-payload-integrity.cjs`, new local payload preparation scripts and the public publication preflight entry points they guard. Existing canonical integration manifests and importer are read-only for this change.
- Boss runtime/desktop: `src/main/ai/runtime/uar/UarAdministrationAdapter.ts`, `src/main/ai/runtime/uar/uarPayload.ts`, new adjacent adapters, `src/main/ipc/handlers/prometheus.ts`, `src/shared/ipc/schemas/prometheus.ts`, and only required shared contract types.
- Boss renderer: existing UAR settings workspace, new UAR instance/observer panels, settings navigation/search, and the locale resources used by those panels.
- UAR binary producer and KBD lead: isolated worktree at `~/.claude/worktrees/afc-d01-uar` on `d4e5413c`, one native binary/package build at the completed production boundary, then the exact Boss build and packaged-app journey.
- KBD lead: update only the `resources/prometheus-skills-mini` Git pointer to the latest accepted committed mini revision when freezing the Boss source; retain the current checkout's unrelated local submodule selection.

No existing user data, unrelated local changes, or C08 implementation belongs to this change.
