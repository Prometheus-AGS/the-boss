---
name: prometheus-context-bootstrap
description: Install compact, layered Prometheus agent context into a project with Node-only, copy-mode behavior. Use when auditing, previewing or explicitly updating an existing project, or initializing or refreshing AGENTS.md, CLAUDE.md, path-scoped Rust or TypeScript rules, and project-local Rust skill routing on Windows, macOS, or Linux. Do NOT use for global skill installation or for replacing operator-owned project prose.
license: MIT
compatibility: Node.js LTS (>= 22.20.0); no shell, Python, symlinks, or executable bit required
metadata:
  tags: 'bootstrap, context-engineering, agents-md, claude-md, hooks, scaffold'
  version: '1.2.1'
---

# Prometheus Context Bootstrap

## User goals, value, and business rules

Always think in terms of user goals and value—not in tests or assumptions.

Before selecting or planning a unit of work, state the user's intended outcome
and why it matters. Anchor intended behavior in exact representative examples
and observed evidence; distinguish confirmed requirements from assumptions.
Before proposing a solution, query, or test, record plain-language, verifiable
business rules in the existing accepted specification or behavior contract:
condition, expected outcome, supporting evidence, exceptions, and unresolved
assumptions. Do not invent a separate workflow or treat assumptions as rules.
Trace scoped end-of-phase BDD scenarios to those rules. Test outcomes verify
user value; they do not define it. Preserve established build, release, phase-end
BDD/VLBV processes and approval gates unchanged.


Install the compact resident contract, path-scoped stack rules, and project-local
skill copies. The bootstrap owns only marked regions. It preserves prose outside
those markers and refuses a corrupt marker pair or a symlink that resolves outside
the target project.

Generated files carry VLBV as the single verification method: the marked
`<!-- kbd-policy:begin/end -->` block (verification VLBV, compiler exception
retired, no cadence exception, execution only at B4 — the boundary packet, once —
or B5, an owner-authorized repair rerunning only affected checks), a first-action
recovery protocol that works without hooks, and precedence over built-in TDD,
verify and apply workflow skills. `CLAUDE.md` imports `@AGENTS.md`, so Claude
Code reads the same policy. Static runner/fixture review is early developer
feedback, not acceptance. Keep executable feedback within the exact admitted
cadence, and cumulative formal review at B4. Unit, mock-only, filtered-function,
and per-edit test loops do not count as proof. See
`kbd-process-orchestrator/references/boundaries.md` for the controlling cadence.

## Selected method and phase authority

The managed resident and path-scoped templates carry compact references to the
active phase's `method-context.md` and adopted contract, not another authority
ledger. Signed canonical KBD status/decisions remain authoritative; the waypoint
is their derived position view. Session-start and pre-compaction hooks restore
pointers and a labelled derived snapshot (`lib/hooks/method-reanchor.mjs`); a
missing or stale index is reported explicitly. The index is produced by
`scripts/kbd-method-context.mjs` in the mini pack; a bootstrapped project without
the pack reads the existing index and does not invent one.

Recovery preserves the latest authorized supersession, original evidence,
candidate freshness, consumed budgets and unresolved effects, and reconciles
uncertain effects before retry. The templates retain the complete agreed
value-phase boundary and keep execution authority separate: no task, hour,
commit, reviewer or compiler boundary, and no stack-rule compiler or
completed-change example, opens generated-code verification. Host-policy conflicts are surfaced before dependent action without changing
operator-owned prose outside the marked regions. Template guidance is
instruction-only unless a named host boundary enforces it; no global context
rewrite, universal interception, release or automatic-successor authority is
implied.

## Run from the mini pack

From a standalone mini checkout:

```text
boss-mini prometheus-context-bootstrap.mjs --path <project> --stacks rust,typescript
boss-mini prometheus-context-bootstrap.mjs --path <project> --stacks rust,typescript --check
```

From the copy vendored inside `the-boss`:

```text
node resources/prometheus-skills-mini/scripts/prometheus-context-bootstrap.mjs --path . --stacks typescript,rust
node resources/prometheus-skills-mini/scripts/prometheus-context-bootstrap.mjs --path . --stacks typescript,rust --check
```

Every run prints a `RESIDENT` line: the words in the managed region against a
900-word ceiling, plus the project's own words outside it. Only the managed
region counts toward the ceiling; operator prose and other tools' regions are
reported, never charged. `--check` fails when the managed region exceeds the
ceiling.

Every run also prints a `POLICY` line. `--check` fails when the governing file
lacks exactly one `kbd-policy` block stating `verification: VLBV`, or when the
managed region of the governing file or a stack rule carries retired
compiler-exception or opt-in VLBV wording or an `/opsx:*` command (removed in
OpenSpec 2.0). The same wording in operator prose outside the markers is printed
as `STALE` for manual cleanup and never rewritten.

Use `--dry-run` to print the complete write plan without changing files. If
`--stacks` is absent, a root `Cargo.toml` selects Rust and a root `package.json`
selects TypeScript.

Bootstrap does not install, migrate, remove or neutralize project-local hooks.
An existing local Stop or command hook can remain effective after a refresh.
If it loops or rejects an admitted command, identify the actual hook owner and
reason; report the conflict and use the normal reviewed repair path. A rule
marker, comment, or toggle is not execution authority.

## Maintain instructions in an existing project

From the Mini repository, run the existing CLI with the project's exact Git root:

```text
boss-mini prometheus-context-bootstrap.mjs --path <project-root> --audit
boss-mini prometheus-context-bootstrap.mjs --path <project-root> --preview
boss-mini prometheus-context-bootstrap.mjs --path <project-root> --apply <PLAN_SHA256>
```

In an installed skill, call its bundled `scripts/maintain-project.mjs` with the same
arguments. These modes are exclusive; they do not take stack or scaffold flags.
Audit lists coverage and planned changes without printing file content. Preview
adds a local unified diff and `PLAN_SHA256`. Inspect it before explicit apply;
do not share local diffs containing private prose. Apply requires the same root
and fresh digest. No file is staged in Git or enrolled into the installer.

The modes touch only the named root instruction files. They preserve dirty
prose, recognised relative canonical references, existing in-root entrypoint
symlinks, and managed block bytes. An ignored named entrypoint, broken or
conflicting topology, malformed/partial recognised policy, or unsafe generated
authority is blocked for manual review. Natural-language conflicts are not fully
machine-detectable. Run apply with no concurrent editor. If a filesystem failure
partially applies, audit and reconcile before repeating; separate named writes
are not a multi-file transaction. A fresh preview after a complete apply is
a no-op. The legacy initializer, `--dry-run` and `--check` are unchanged.

## Installed context

- a marked resident block in `AGENTS.md`, or in the in-project target of an
  existing `AGENTS.md` symlink;
- an `@AGENTS.md` import in a separate `CLAUDE.md`;
- marked `.claude/rules/rust.md` and/or `typescript.md` regions;
- copied `prometheus-context-bootstrap` and, for Rust, `prometheus-rust-workspace`
  skills under both `.agents/skills/` and `.claude/skills/`;
- missing append-only `.prometheus` context files and directories.

The Rust path rule loads `prometheus-rust-workspace`, which routes
`rust-best-practices`, `rust-async-patterns`, `rust-mcp-server-generator`, and
the specialized catalog only when relevant. Dependency and protocol pins in the
target project remain authoritative.

## Shared UI and team defaults
Bootstrap also installs the offline UI catalog, shared protocol (preserving a project override), short UI pointers in both entrypoints and recovery data. It adopts a sole or explicitly selected existing project team using creator install-project; ambiguous teams require selection. UI roles use prometheus-ui-ux, reviewers prometheus-ui-review, backend-only work no UI context. New helpers use TypeScript 7 compiled to Node .mjs.

## Delivery cadence context

When `.prometheus/cadence-binding.json` exists, read that small binding and carry its profile/root into the execution dispatch. Load delivery-cadence only for cadence-enabled work. Its configured build-and-run boundary, publication frequency and pending failure obligations survive compaction; do not substitute test suites or silently reset the run. No profile means no additional cadence context.
