---
name: skill-certification
description: Certifies an Agent Skill against five evidence levels (specification, static, trigger, outcome, portability) and writes a certificate bound to the skill's content hash. Use when asked to certify, validate, evaluate or prove a skill works, when a skill was just created or changed and needs checking before it ships, or when a skill does not trigger and the cause is unknown. Do not use for reviewing application code, or for writing a new skill from scratch.
license: MIT
metadata:
  author: Travis James
  version: '1.0.0-prometheus.1'
  category: testing
  tags: 'certification, skills, evaluation, agentskills, trigger, validation'
---

# Skill Certification

Establish, with evidence, what can be claimed about one Agent Skill, and say
plainly what cannot. The output is a certificate and a report, not an opinion.

A skill holds the highest level for which it has current evidence. Levels are
cumulative.

| Level | Claim | Evidence | Cost |
|---|---|---|---|
| C0 Spec | Conforms to agentskills.io | Two independent validators agree | Seconds |
| C1 Static | No broken references or static hazards | Built-in checks | Seconds |
| C2 Trigger | Starts on the right requests, stays quiet on the wrong ones | Trigger cases in the catalogue users get | Billed model runs |
| C3 Outcome | Output is measurably better with the skill than without | With/without comparison | Billed model runs, the most expensive |
| C4 Portable | C2 and C3 hold on each named harness | The same cases per harness | Not automated here |

Pass rules and where each threshold came from: [references/levels.md](references/levels.md).

## Procedure

Work in this order. Each step is cheaper than the next, so a failure stops the
spend early.

### 1. Run the static levels

```
node <skill-directory>/scripts/certify.mjs <skill-dir> --out <out-dir>
```

`<skill-directory>` is this skill's own directory. Every script here is a Node
script started as `node <file>`; nothing needs a shell, an executable bit or a
shebang, so the same command works from `cmd.exe`, PowerShell, bash and zsh.

This runs C0 and C1, costs nothing, and writes `certificate.json` and
`report.md`. C0 needs two validators: the built-in checks plus `skills-ref`
(through `uvx`, when it is installed) or a repository's strict validator
(`scripts/validate-skills.mjs`). With only one, C0 is
`INCOMPLETE`, not passed.

If C0 fails, stop. A skill that does not parse cannot be evaluated.

### 2. Make sure the skill has cases

C2 and C3 need cases in `<skill-dir>/evals/`, in the folder layout
`claude plugin eval` reads. The minimum is two outcome cases and one near-miss
case. If Anthropic's `skill-creator` skill is available, use it to draft the
cases; it writes the same layout. Rules for cases that measure something:
[references/writing-cases.md](references/writing-cases.md).

Name a case `near-miss-…` when the skill should stay quiet, and `named-…` when
the prompt uses the skill's name. The names decide how the case is counted.

### 3. Ask before spending

Model runs are billed. Before starting them, tell the operator the mode, the
number of runs, and the cost cap, and wait for a yes. Smoke-run one case once
first: it confirms the plugin resolves, shows the real cost, and catches a
malformed case file.

### 4. Run the cases in both modes

```
node <skill-directory>/scripts/certify.mjs <skill-dir> --out <out-dir> --run both --plugin <plugin-dir> --runs 5 --max-cost-usd 8
```

- **isolated**: only this skill is loaded. This is the C3 measurement.
- **pack**: the plugin users install is loaded. This is the C2 measurement.
  `--plugin` names that plugin directory.

To certify from runs that already exist, pass the files instead:
`--results isolated=<result.json> --results pack=<result.json>`.

Reports are never published (`--no-publish`), and the cost cap bounds each mode.

### 5. Read the outputs before believing the scores

Open the HTML report beside `result.json`. Traces are deleted after a run, so
the report is the only place the outputs survive.

- A grader that fails on every with-skill run while the skill fired is usually a
  grader that rejects a format the skill legitimately produces. Fix the grader.
- A delta of zero with the skill never firing measured nothing. Fix triggering.
- When a skill does not fire, find out what did. "Nothing fired" and "a
  neighbour fired" need different fixes.

### 6. Report

Give the operator the level held, each level's result, and the limits. State the
catalogue C2 was measured in and its listing size: a trigger result holds only
for that catalogue. A skill meant to be invoked by name is certified as such,
with `named-` cases, and is not failed for refusing to start on its own.

## When a level fails

Do not decide for the operator, and do not quietly ship at a lower level. Show
the three options from the report, with the impact of each:

1. **Fix**: what the proposed fix is and what re-certifying will cost.
2. **Accept**: ship at the level below with a recorded exception, and what users
   will experience as a result.
3. **Abandon**: do not ship.

Record an accepted exception with `--accept <level>=<reason>`; it is written
into the certificate and never raises the level. Details and the impact of each
level's failure: [references/when-a-level-fails.md](references/when-a-level-fails.md).

To use certification as a gate, add `--require C1` (or another level): the exit
code is 2 when the skill is below it.

## What a certificate does and does not say

- It is bound to the content hash, the harness version and the model. Any edit
  to the skill, or a new model, voids C2 and above until they are run again.
- `NOT_EXERCISED` and `INCOMPLETE` are recorded results. They are never rounded
  up to a pass.
- Security scanning and third-party linters are not run by this skill. Run them
  separately and attach their output.
- One harness only. C4 is recorded as `NOT_EXERCISED`.
- Three runs resolve thirds. The trigger rule needs five runs per case.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/certify.mjs` | Runs the levels, applies the rules, writes the certificate |
| `scripts/run-evals.mjs` | Runs a skill's cases in isolated or pack mode |
| `scripts/process.mjs` | Starts child processes without a shell; refuses `.cmd`/`.bat`/`.ps1` shims on Windows |
| `scripts/summarize-evals.mjs` | Per-case scores, fired rate and per-grader counts from `result.json` |
| `scripts/listing-size.mjs` | A plugin's skill-listing size against the harness budget |
