# Design

## Context
The Boss is an Electron/React product with six workspace packages, an existing DSH bridge and Prometheus workspace services. Compass records 5,481 production files and is partial static evidence. UAR has seven existing development roles. A Boss UAR adapter remains planned until demonstrated in source.

## Goals / Non-Goals
One canonical team and five native installations, with explicit product, design, implementation and independent review responsibilities. No application changes, daemon, global registration, peer-repository edits, publication or commits.

## Decisions
Use ten reusable roles, activating lead plus one specialist plus verifier by default, at most four including lead. Three generalists would lose explicit product/design and trust accountability; ten permanent workers would add unnecessary coordination. Default ownership is disjoint; shared and uncovered paths need task-level single-writer assignment. Native harnesses execute work; the team ledger only records it.

Reuse existing Electron, regression and React skills; add pinned MIT product skills, composition guidance and local accessibility guidance. Project design tokens/data architecture override generic examples. Preserve the existing AGENTS.md symlink to CLAUDE.md and append one routing section.

## Risks / Trade-offs
Partial graph: verify source and real boundaries. Missing CLI: report source-only support. Optional gateway unavailable: local artifacts remain useful and native independent review is a labeled weaker fallback. Model tiers are operator choices, not benchmarks. Ownership does not enforce permissions.

## Migration Plan
Install new namespaced files and preserve existing MCP definitions. Rollback removes only paths in the installation receipt and the delimited instruction section, never whole native directories or runtime user state.
