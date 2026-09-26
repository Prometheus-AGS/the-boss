<p align="center">
  <img src="./build/logo.png" width="160" height="160" alt="The Boss logo" />
</p>

<h1 align="center">The Boss</h1>

<p align="center">An AI desktop workspace for conversations, agents, tools, and project work.</p>

<p align="center">
  <a href="https://the-boss.know-me.tools">Website</a> ·
  <a href="https://github.com/Prometheus-AGS/the-boss/releases">Downloads</a> ·
  <a href="./docs/README.md">Documentation</a> ·
  <a href="./docs/contrib/development.md">Development</a> ·
  <a href="https://github.com/Prometheus-AGS/the-boss/issues">Issues</a>
</p>

The Boss is the Know Me Tools desktop workspace built on [Cherry Studio](https://github.com/CherryHQ/cherry-studio). It brings multi-provider AI conversations, agent sessions, workspace tools, knowledge and document workflows together with Prometheus integration. This repository owns The Boss source, documentation, and release workflow.

## Get The Boss

Download the installer for your platform and architecture from [The Boss releases](https://github.com/Prometheus-AGS/the-boss/releases). Read that release's notes and platform records for its available installers, UAR profile, signing status, and acceptance evidence. Source support for a platform does not establish that a tested installer is available for it.

The documentation on `main` describes current source. The UI/UX catalog and team-routing adoption described below were merged after the existing 2.2.2 release; that merge does **not** establish that the 2.2.2 installers contain them. Use the [release runbook](docs/contrib/the-boss-release.md) for packaging and installed acceptance.

## Workspace capabilities

- Conversations and assistants across cloud and local model providers.
- Agent sessions with workspace context, MCP tools, skills, and approval boundaries.
- Knowledge, document, code, and Markdown workflows.
- Prometheus settings for packaged skills, workspace indexing, tools, and optional services.
- Shared renderer components, semantic design tokens, and light/dark themes.

Provider access and optional integrations require their own configuration. See the [documentation index](docs/README.md) for architecture and operational contracts.

## UI/UX skills and project teams

The current source distributes **97 mini skills**, including **40 portable UI/UX catalog entries**, through `resources/skills/`. The shared `prometheus-ui-ux` router selects project context, focused Pro Max guidance, craft, and platform instructions. `prometheus-ui-review` defines independent review at a completed UI phase; it does not automatically launch a browser or certify an application.

The existing ten-role [boss-core team](.agent-team/boss-core/README.md) is adopted through the project routing record. UI work goes to `boss-ux` and `boss-renderer`; completed UI acceptance goes to `boss-verifier`. Existing tokens, Electron workflows, permissions, and ownership remain authoritative.

Read [UI/UX routing and team adoption](docs/contrib/ui-ux-routing.md) for commands, prerequisites, installation boundaries, deferred engine support, and evidence limits.

## Develop and contribute

Use the Node version in [.node-version](.node-version), the engine range and pnpm pin in [package.json](package.json), and the [development guide](docs/contrib/development.md). Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the repository instructions in [CLAUDE.md](CLAUDE.md). Active development targets this repository's `main` branch.

- [Documentation index](docs/README.md)
- [UI/UX routing and team adoption](docs/contrib/ui-ux-routing.md)
- [Design system](DESIGN.md)
- [The Boss release workflow](docs/contrib/the-boss-release.md)
- [Upstream merge policy](docs/contrib/upstream-merges.md)

Documentation lives in this repository as Markdown. The index is generated from document headings and frontmatter with `pnpm docs:index`; the completed documentation gate is `pnpm docs:check`.

## Attribution and license

The Boss is derived from [Cherry Studio](https://github.com/CherryHQ/cherry-studio). Upstream contributors, copyright notices, and license obligations remain applicable. See [LICENSE](LICENSE) for the GNU Affero General Public License v3.0.

The Boss name and logo identify this fork. Existing `@cherrystudio/*` package names, Cherry-operated services, and historical migration identifiers are technical contracts; their presence does not redirect this project's downloads, documentation, or support to upstream.
