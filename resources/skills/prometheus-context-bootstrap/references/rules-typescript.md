---
paths: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/package.json', '**/tsconfig*.json']
---

<!-- prometheus-mini-context:start v1 -->
# TypeScript development

- Batch related implementation until a production path is complete. Use a narrow
  type check earlier only when it is required to unblock work (never as a boundary
  under a selected VLBV phase; see the last section).
- At a completed change boundary outside a selected VLBV phase, run the smallest
  browser, IPC, API, process, or build integration that exercises the real entry
  point and collaborators.
- Unit, component-only, snapshot, mock-only, and per-edit tests are not completion
  evidence. Do not escalate a passing targeted integration without a scope reason.
- Reserve broad end-to-end, visual, bundle, cross-platform, and release gates for
  the final applicable boundary.
- After failure, read all diagnostics, batch fixes, and rerun only the smallest
  integration flow that confirms the completed behavior.
- Keep state and I/O behind the project's existing service boundaries. Components
  render state and submit intent; they do not own business logic or external calls.

## Selected phase method

Before this stack work, recover the active phase `method-context.md` and adopted contract from signed canonical KBD status/decisions. For selected VLBV, complete the agreed whole value phase before generated-code builds, tests, imports, lint/typecheck or verification probes; a stack-specific compiler/check example is not permission. Surface host-policy conflicts before dependent action. Retain supersession, evidence/candidate freshness, consumed budgets and unresolved effects; reconcile uncertain effects before retry. This path rule is instruction-only, not universal interception.
<!-- prometheus-mini-context:end -->
