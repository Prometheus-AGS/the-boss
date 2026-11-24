<!-- prometheus-mini-context:start v1 -->
## Prometheus development context

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



**First action, every session (hooks or not):** read signed canonical KBD status
and the active phase's `method-context.md`; state the phase and the boundary rule
below; only then act. Never rebuild a retired method from an old plan, handoff,
summary or next-command.

### Verification boundaries (VLBV)

<!-- kbd-policy:begin -->
- verification: VLBV
- compiler-exception: retired
- cadence-exception: none
- execution-boundary: B4 (boundary packet, once); B5 after an authorized repair
<!-- kbd-policy:end -->

- This managed block takes precedence over built-in TDD, verify, apply or
  test-first workflow skills and over conflicting per-edit, unit-first or
  mock-first prose elsewhere. Report the stale prose for manual cleanup; do not
  follow both policies. Never edit generated `openspec-*` skills.
- Adopt the phase's acceptance scenarios before generation. Write the whole agreed
  increment without executing generated code: no tests, builds, compiler checks,
  imports, lint, typecheck, verification hooks or probes. Editor/LSP diagnostics
  are reading. Tasks, hours, commits, reviews and compiler problems are not
  boundaries.
- At the value-phase boundary (B4) the adopted boundary packet runs once:
  one integration flow through the real production entry point and collaborators.
  After a FAIL, only an owner-authorized repair (B5) reruns, and only the affected
  checks. Verdicts: PASS, FAIL, BLOCKED, NOT_EXERCISED. A deviation is a signed
  `KBD-METHOD` decision disclosed in the closure packet.
- If the harness provides an agent team, keep reviewer, auditor, verifier, and
  integration-checker roles dormant until B4. Unit, mock-only, filtered-function,
  snapshot, and per-edit tests are not evidence. Report only commands and results
  actually observed, and the boundary they ran at.

### Position and authority

- Signed canonical KBD status/decisions and the adopted phase contract are
  authoritative; `.kbd-orchestrator/current-waypoint.json` and
  `position-reminder.txt` are their derived position view. Read `versions.toml`,
  `.prometheus/decisions.md`, and relevant `.prometheus/gotchas.md` before
  dependency or architecture changes.
- Recover the active phase's `method-context.md` and adopted contract before
  dependent work (`node <pack-root>/scripts/kbd-method-context.mjs --phase <id>
  --write`). The index is advisory: resolve canonical identity, latest
  supersession, included value, exclusions, stage authority, evidence freshness,
  consumed budgets and unresolved effects. A missing or stale reference is
  explicit, never guessed. Reconcile uncertain effects before retry. If a host
  policy conflicts, surface it before dependent action; do not rewrite owner
  policy or infer permission. These rules are instruction-only unless a named
  trusted host boundary enforces them; publication cadence does not certify
  partial value, grant release authority or create a successor.

### Stacks

- For Rust work, load `prometheus-rust-workspace`. It routes
  `rust-best-practices`, `rust-async-patterns`, and
  `rust-mcp-server-generator` when relevant. Project pins and protocols win.
- Stack details live under `.claude/rules/`; load only the rule matching the files
  being changed. Preserve operator prose outside this managed region.
### Done

Done requires the actual agreed user goal and value to be achieved, supported by relevant end-of-phase VLBV evidence against accepted business rules and all existing mandatory exit criteria. Deliver the necessary user guidance and access, verify the observable outcome, disclose limits and remaining risks, and record reflection. Review-ready means a coherent change is ready for maintainer assessment, not that the user outcome is already delivered. Preserve existing approval, release and verification boundaries; tests alone are not completion.
<!-- prometheus-mini-context:end -->
