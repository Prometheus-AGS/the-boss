# Phase-gated Cargo verification (VLBV)

Rust work follows VLBV, the pack's single verification method. Boundaries are
defined once in `skills/kbd-process-orchestrator/references/boundaries.md`;
this page only says how Cargo commands fit into them.

**Cargo commands that build, check, lint, test, document or run the workspace
execute only as entries of the phase's adopted boundary packet — at B4, once, and
after an authorized repair at B5.** There is no change-level gate and no
intermediate compiler check. rust-analyzer / LSP diagnostics read in the editor
are static reading and are allowed throughout.

## During the phase (B0–B3)

- inspect and edit; batch related edits;
- use rust-analyzer diagnostics and static reasoning for intermediate feedback;
- do not run `cargo check`, `cargo build`, `cargo clippy`, `cargo test`,
  `cargo run`, `cargo doc` or any compiler probe — not after a file changes, not
  after a change or task completes, and not to diagnose a compile error;
- do not add or run unit, module-local, mock-only or filtered function tests as
  completion evidence;
- do not start background Cargo commands, test watchers or check loops.

A compile error found by reading is fixed by reading. If static inspection
genuinely cannot resolve a blocker, record it, finish the rest of the agreed
production work, and let the boundary packet's `build` entry report it.

## The boundary packet (B4)

Choose the smallest set of packet entries that exercises the production entry
point and real collaborating components. Repository commands remain authoritative.
Typical typed entries (contract v2):

```json
{ "id": "build",  "kind": "build",    "argv": ["cargo", "build", "-p", "<package>", "--bin", "<bin>"] },
{ "id": "scn-1",  "kind": "scenario", "argv": ["cargo", "test", "-p", "<package>", "--test", "<integration-target>"], "scenarioIds": ["SCN-1"] },
{ "id": "neg-1",  "kind": "negativeControl", "argv": ["cargo", "test", "-p", "<package>", "--test", "<integration-target>", "--", "--ignored", "negative_scn_1"], "scenarioIds": ["SCN-1"] }
```

- A scenario entry enters through a public API, binary, protocol, process,
  filesystem, database or network boundary. A unit-test name filter is not a
  substitute.
- Add only the feature flags the scenario needs; `--all-features` only when the
  project supports it.
- Prefer an integration-only selector; never a broad selector that silently adds
  unit-test harnesses.
- Workspace-wide formatting and lint (`cargo fmt --check`, `cargo clippy
  --workspace --all-targets -- -D warnings`) are packet entries when the contract
  lists them, typically for a phase touching shared public APIs, workspace
  configuration or dependencies.

The packet runs once. Each entry's receipt is kept; a failed entry is FAIL or
BLOCKED and is not rerun.

## Repair (B5)

Only after the owner authorizes a bounded repair within `budgets.repairAttempts`:

1. Read all relevant diagnostics from the existing receipts.
2. Complete the agreed repair, batching the fixes.
3. Rerun only the affected scenarios' entries and their negative controls.

## Locks, caches and formatting

- Only one Cargo/rustc build process runs on the machine at a time; check for an
  active one and wait for or reuse it.
- Reuse the workspace target directory; do not clear caches or run `cargo clean`.
- Do not change `Cargo.lock` unless dependency resolution is part of the task.
- Do not create a separate `CARGO_TARGET_DIR` merely to bypass ordinary contention.
- Format once, as a packet entry or at the end of the agreed production work,
  limited to the affected files or package.

## Opt-in commands

Audit, deny, Miri, benchmarks, documentation, fuzzing, Loom, sanitizers, coverage,
cross-compilation, full feature matrices and release builds are packet entries only
when the contract names them (a release or security boundary), or run after the
phase closes on explicit request.

## Reporting

Report the packet entries that ran, their verdicts, intentional deferrals, and
whether broader validation remains recommended. Never claim that a deferred check
passed.
