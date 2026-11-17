---
paths: ['**/*.rs', '**/Cargo.toml', '**/Cargo.lock', '**/clippy.toml']
---

<!-- prometheus-mini-context:start v1 -->
# Rust development

Load `prometheus-rust-workspace` before Rust implementation, review, refactoring,
or architecture work. Use `rust-best-practices` generally,
`rust-async-patterns` for Tokio and concurrency, and
`rust-mcp-server-generator` for MCP servers and transports. Project dependency
pins and protocol versions remain authoritative.

- Batch related implementation and use static reasoning or rust-analyzer; editor
  and LSP diagnostics are reading, not execution.
- Cargo build/check/test/clippy commands run only as entries of the boundary
  packet at the value-phase boundary (VLBV B4), or after an authorized repair
  (B5). There is no change-level gate and no intermediate compiler check.
- The packet starts with the smallest integration target that enters through a
  public API, binary, protocol, process, filesystem, database, or network
  boundary with real collaborators.
- Unit, module-local, mock-only, and filtered-function tests are not completion
  evidence. Do not escalate a passing targeted integration without a scope reason.
- Serialize Cargo commands within a workspace and target directory. Account for an
  existing Cargo process, wait on lock contention, and never start retry loops.
- Reserve workspace-wide, release, cross-compile, feature-matrix, Miri, fuzzing,
  coverage, benchmark, documentation, and audit commands for the final applicable
  boundary or an explicit request.
- After a boundary failure and an authorized repair, rerun only the affected
  scenarios' packet entries (B5).
- Report commands, results, intentional deferrals, and any remaining integration gate.

## Selected phase method

Before this stack work, recover the active phase `method-context.md` and adopted contract from signed canonical KBD status/decisions. Under VLBV (the pack default; deviations are signed `KBD-METHOD` decisions), complete the agreed whole value phase before generated-code builds, tests, imports, lint/typecheck or verification probes; a stack-specific compiler/check example is not permission. Surface host-policy conflicts before dependent action. Retain supersession, evidence/candidate freshness, consumed budgets and unresolved effects; reconcile uncertain effects before retry. This path rule is instruction-only, not universal interception.
<!-- prometheus-mini-context:end -->
