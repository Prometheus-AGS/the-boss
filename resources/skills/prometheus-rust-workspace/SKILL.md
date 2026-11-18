---
name: prometheus-rust-workspace
description: Route Rust and Cargo work to the minimum relevant installed skills and enforce phase-gated, serialized Cargo verification. Use when working with .rs files, Cargo.toml, Cargo.lock, compiler or Clippy diagnostics, Rust architecture, async Rust, unsafe Rust, Rust MCP servers, or Rust reviews. Do NOT use for non-Rust code or tasks that do not touch a Cargo workspace.
license: MIT
metadata:
  tags: 'rust, cargo, routing, verification'
  version: "1.1.0"
---

# Prometheus Rust Workspace

Use installed Rust skills proactively for static analysis, design, implementation,
and review. Skill activation does not imply immediate command execution. Repository
dependency pins, architecture rules, and acceptance-test requirements remain
authoritative.

## Start every Rust task

1. Inspect the nearest `AGENTS.md` or `CLAUDE.md`, the workspace manifests, and the
   affected crate boundaries.
2. Use `rust-router` first when available. Load only the specialized skills selected
   by the task signals; do not repeatedly load overlapping baseline skills.
3. Use `rust-best-practices` for general implementation and review,
   `rust-async-patterns` for Tokio or concurrency work, and
   `rust-mcp-server-generator` for Rust MCP server or transport work. Treat generator
   versions as examples; pinned project SDKs and protocols win.
4. Read [skill routing](references/skill-routing.md) only when choosing specialized
   language, analysis, safety, or domain skills.

## Command execution rule

Batch implementation work and perform Cargo verification only after a meaningful set
of production functionality is complete at a change or phase boundary. During
implementation, use code inspection, rust-analyzer diagnostics, and static reasoning.
Do not run unit tests or filtered function tests as completion evidence. Do not start
background Cargo commands, watchers, repeated check loops, or concurrent commands
against the same workspace or target directory.

In a KBD-managed project, or wherever VLBV is enabled, load the `vlbv` skill
before any verification step unless the operator names another method. Before
the first Cargo command, read
[phase-gated verification](references/phase-gated-verification.md). Choose the
smallest set of boundary-packet entries that exercises the completed production
path. Under VLBV, Cargo build/check/lint/test commands run only as packet entries at
the value-phase boundary (B4) or an authorized repair (B5) — there is no
change-level gate and no intermediate compiler check; rust-analyzer diagnostics are
static reading and stay available. Boundaries: `kbd-process-orchestrator/references/boundaries.md`.

When routing to a testing, review, performance, safety, or verification skill,
collect its recommended checks as candidate packet entries; none runs before B4.

## Finish accurately

Report the commands actually run, their results, checks intentionally deferred, and
whether a broader workspace gate remains recommended. Never report a deferred check
as passed.
