# The Boss Contributor Guide

Contribute improvements to The Boss desktop workspace, documentation, or integrations through [this repository](https://github.com/Prometheus-AGS/the-boss). Start with an observed problem or explicit requirement, keep the change scoped, and preserve existing behavior outside that scope.

## Before you start

Read the [Code of Conduct](CODE_OF_CONDUCT.md), [LICENSE](LICENSE), and repository instructions in [CLAUDE.md](CLAUDE.md). Follow the [development guide](docs/contrib/development.md) for the pinned Node/pnpm environment and local setup. Active development targets this repository's `main` branch.

Use [GitHub Issues](https://github.com/Prometheus-AGS/the-boss/issues) for reproducible defects or proposed work. Include the affected platform, version, steps, expected behavior, and relevant evidence without credentials or private user data.

## UI/UX and team workflow

Read [UI/UX routing and team adoption](docs/contrib/ui-ux-routing.md) for the portable catalog, project installation, and evidence limits. The existing [boss-core team](.agent-team/boss-core/README.md) provides role instructions: `boss-ux` owns usability/design artifacts, `boss-renderer` implements renderer changes, and `boss-verifier` reviews completed acceptance independently where the harness supports it.

Follow [DESIGN.md](DESIGN.md), the shared token system, and existing Electron tooling. Routing guidance does not authorize a new palette, framework, dependency, or redesign. Backend-only tasks use the relevant team role without loading UI guidance.

## Implementation and verification

Finish the coherent production phase before its verification boundary. Exercise the promised behavior through the real UI, IPC, process, filesystem, database, or protocol path. Unit or mock-only results do not establish completion. Record the commands actually run, source boundary, evidence paths, failures, and unavailable platform checks.

For documentation changes, edit document headings and frontmatter, then run `pnpm docs:index` to regenerate [the index](docs/README.md). Run `pnpm docs:check` at the completed documentation boundary; it checks links, structure, frontmatter/source paths, and index freshness.

UI acceptance also requires the applicable captures and interaction evidence plus independent review. The routing helper's `phase-boundary` result is an evidence request, not a test run or PASS.

## Pull requests

Use a focused branch and Conventional Commit messages. Explain the problem, resulting behavior, scope, and actual verification. Follow [.github/pull_request_template.md](.github/pull_request_template.md) and the repository's `gh-create-pr` workflow. Draft PRs may communicate incomplete work, but do not claim that draft status or a passing automated check proves acceptance.

### Contributor certification

The inherited contribution policy requires human contributors to certify their right to contribute under [LICENSE](LICENSE). Human certification uses the conventional trailer:

```text
Signed-off-by: Your Name <your.email@example.com>
```

This is a human certification, distinct from cryptographic commit signing. Agents must follow the active operator and repository instructions for generated-content attribution and must not manufacture a human certification.

## Releases and upstream

Use [The Boss release workflow](docs/contrib/the-boss-release.md) for fork releases and installed acceptance. A source merge does not establish inclusion in an existing published installer.

This project derives from Cherry Studio. Preserve upstream attribution, notices, and compatibility identifiers. Follow the [upstream merge policy](docs/contrib/upstream-merges.md); upstream service names and historical data identifiers are not cosmetic branding.
