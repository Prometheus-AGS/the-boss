---
name: bdd-cucumber-js
description: Author Gherkin features, real assertions, step definitions and runner configuration for adopted scenario IDs on plain Node (cucumber-js, ESM, no TypeScript or browser required for API and CLI scenarios). Default mode is author-only; execution belongs to value-scenario-verify at the authorized phase boundary.
license: MIT
compatibility: Node.js 22 or newer. The project supplies and pins @cucumber/cucumber itself; this skill never installs it. Browser or video adapters are optional and out of scope here.
metadata:
  version: "1.0.0"
  tags: "testing, bdd, cucumber, gherkin, node, vlbv"
---

# BDD with cucumber-js (Node, author-only first)

Compact mini counterpart of the full pack's JS BDD guidance. It covers API and
CLI scenarios that need no browser, Rust toolchain, shell or Python helper, or
service. Playwright, video proof and Rust BDD are not part of mini's skill set.

## Choose the mode first

- `author-only <contract-reference> <scenario-IDs>` consumes adopted scenario IDs
  and writes features, assertions, steps and config. Read
  [the author-only procedure](references/author-only.md) and stop after writing.
  Do not execute or import the generated code, dry-run, build, lint, typecheck,
  install dependencies or edit protected scenarios.
- `execute <contract-reference> <scenario-IDs>` is a separate request: follow
  `value-scenario-verify` and require the complete agreed value-phase production
  plus current boundary authority before any command in "Running" below. A task,
  hour, commit or reviewer request is not that boundary, and exit code zero is
  not an assertion.

Define scenarios first (`value-scenario-discovery`), then author under the
governing repository policy. Where that policy is production-first (mini's A-9),
wait for the complete production implementation before writing these files.
Unknown or unadopted IDs block. Available tools or example commands are not
execution permission. Report authored artifacts as `NOT_EXERCISED`.

## Layout

```
tests/bdd/
  features/<capability>/<name>.feature   one feature per file, scenarios tagged with stable IDs
  steps/<name>.steps.mjs                 ESM step definitions
  support/world.mjs                      World: base URL, scratch root, process handles
  assertion-map.json                     scenario ID -> assertion/oracle provenance
cucumber.mjs                             runner config (ESM default export)
```

Keep fixtures under the contract's scratch fixture root, not the repository tree.

## Author a scenario

```gherkin
@API @SCN-001
Feature: Export a report
  Scenario: Operator exports a report over the real CLI
    Given a fixture workspace with 3 records
    When the operator runs the export command
    Then the exported file contains exactly those 3 records
```

Rules: declarative steps; one behavior per scenario; tag every scenario with its
adopted ID (`^[A-Z]+-[0-9]+$`) and `@API` or `@CLI`; use `Scenario Outline` for
data variation. Steps exercise the production entry named in the contract.

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { When, Then } from '@cucumber/cucumber';

When('the operator runs the export command', function () {
  // Real production entry; argv comes from the adopted contract, no shell.
  execFileSync(process.execPath, [this.entry, 'export', '--out', this.outFile], { cwd: this.scratchRoot });
});

Then('the exported file contains exactly those {int} records', function (count) {
  const rows = JSON.parse(readFileSync(join(this.scratchRoot, 'out.json'), 'utf8'));
  assert.equal(rows.length, count); // independent expected value from the fixture, never from the product
});
```

Use `async function` (not arrow functions) so `this` is the World. For HTTP use
`fetch` against the endpoint the contract names. Never write a step that only
returns success, asserts `exitCode === 0`, or reuses the product's output as its
own expected value; each Then compares against an independent truth.

## Runner config

```js
// cucumber.mjs
export default {
  import: ['tests/bdd/support/*.mjs', 'tests/bdd/steps/*.mjs'],
  paths: ['tests/bdd/features/**/*.feature'],
  format: ['json:tests/bdd/reports/cucumber.json'],
};
```

Tag selection (`tags: '@SCN-001'`) is added per profile. Package versions are
read from the project's own manifest and `versions.toml`; this skill pins none.

## Assertion map (provenance)

For every authored ID record in `assertion-map.json`: contract digest,
requirement source, expected-truth source, real boundary, and the plausible false
positive the assertion excludes. This feeds the negative control that
`value-scenario-verify` runs later.

## Running (authorized phase-end execution only)

Only after the boundary is admitted, using the contract's `boundaryPacket`
commands, for example `npx --no-install cucumber-js`. `--no-install` forbids
silent downloads; a missing package is BLOCKED, not fixed. `--dry-run` loads
support code and skips steps: it is neither author-only nor evidence. Triage a
failure as product failure versus prerequisite, fixture, permission or evidence
failure; retries and flake tags never turn a failing oracle into PASS.

Related: `value-scenario-discovery`, `value-scenario-verify`,
`docs/value-scenario-workflow.md`.
