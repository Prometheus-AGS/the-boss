<!-- prometheus-mini-context:start v1 -->
## Prometheus development context

- The testing policy in this managed block takes precedence over conflicting
  per-edit, unit-first, mock-first, or test-first instructions elsewhere. Report
  the stale prose for manual cleanup; do not follow both policies.
- Signed canonical KBD status/decisions and the adopted phase contract are
  authoritative; `.kbd-orchestrator/current-waypoint.json` and
  `position-reminder.txt` are their derived position view. Restore position and
  read `versions.toml`, `.prometheus/decisions.md`, and relevant
  `.prometheus/gotchas.md` before dependency or architecture changes.
- Recover the active phase's `method-context.md` and adopted contract before
  dependent work (`node <pack-root>/scripts/kbd-method-context.mjs --phase <id>
  --write`). The index is advisory: resolve the current canonical identity,
  selected method and latest supersession, included value, exclusions, stage
  authority, evidence freshness, consumed budgets and unresolved effects. A
  missing or stale reference is explicit, never guessed from memory or an old
  next-command.
- Finish every planned production change in the phase before testing. During
  implementation, use static inspection and reasoning; use a narrow compiler or
  type check only when an observed compiler error blocks progress (except under a
  selected VLBV phase, below).
- For a selected VLBV phase, no generated-code tests, builds, imports,
  lint/typecheck, verification hooks or probes run during generation. Define
  acceptance and scenarios before generation; executable authoring follows
  governing host policy. A task, hour, commit, reviewer request, compiler problem
  or renamed slice does not create the complete value-phase boundary. If a host
  compiler exception conflicts, surface it before dependent action; do not
  rewrite owner policy or infer permission. Recover the latest authorized
  supersession without reviving retired workflows. Keep original evidence,
  candidate identity, consumed budgets and unresolved effects; reconcile
  uncertain effects before retry. These rules are instruction-only unless a named
  trusted host boundary enforces them. Publication cadence does not certify
  partial value, grant release authority or create a successor.
- At the final phase boundary, run one integration flow through the real production
  entry point and collaborators. If the harness provides an agent team, keep reviewer,
  auditor, verifier, and integration-checker roles dormant until that boundary. Unit,
  mock-only, filtered-function, snapshot, and per-edit tests are not evidence.
- Run cross-platform and release gates at the final applicable boundary. Report only
  commands and results actually observed.
- For Rust work, load `prometheus-rust-workspace`. It routes
  `rust-best-practices`, `rust-async-patterns`, and
  `rust-mcp-server-generator` when relevant. Project pins and protocols win.
- Stack details live under `.claude/rules/`; load only the rule matching the files
  being changed. Preserve operator prose outside this managed region.
<!-- prometheus-mini-context:end -->
