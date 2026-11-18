# Levels and pass rules

The thresholds below were set from a pilot of five skills (fifteen cases, three
runs per arm, one harness, one model). They are defensible starting points, not
settled constants. Change them in `RULES` at the top of `scripts/certify.mjs`
and say so in the report.

## C0 Spec

**Rule:** at least two independent validators ran, and every one that ran passed.

Validators, in the order tried:

1. Built-in checks: frontmatter present; `name` lowercase-hyphenated, at most 64
   characters and equal to the directory name; `description` 1 to 1024
   characters; only the six top-level fields the specification allows (`name`,
   `description`, `license`, `compatibility`, `metadata`, `allowed-tools`);
   `metadata` values are strings.
2. `skills-ref`, the specification's reference validator, run as
   `uvx --from skills-ref agentskills validate <dir>`.
3. A repository's own strict validator, when `scripts/validate-skills.mjs` (or
   `.js`) exists above the skill.

`uvx` is optional. When it is missing, or on Windows resolves only to a `.cmd`
shim, the `skills-ref` leg is `NOT_EXERCISED` with the reason, and the
repository validator is the second validator.

Two validators are required because one validator can be wrong in a way its own
drift check never notices. A disagreement between them is a finding in itself.

There is no official certification programme for agentskills.io and no client
conformance test. C0 means "the reference validator accepts it", nothing more.

## C1 Static

**Rule:** no error-severity finding from the built-in checks.

| Check | Severity |
|---|---|
| A relative link in `SKILL.md` or `references/*.md` points at a missing file | error |
| A shell, Python, PowerShell or batch script (`.sh`, `.bash`, `.zsh`, `.py`, `.ps1`, `.cmd`, `.bat`) anywhere in the skill | error |
| `hooks/hooks.json` does not parse | error |
| `SKILL.md` is over 500 lines | warning |
| The description has no "use when" clause | warning |
| There is no `evals/` directory | warning |

Not run by this skill: a security scanner, and third-party linters such as
`agnix`. Their findings need reading by a person; in the pilot every scanner
finding examined was a false positive. Run them separately and attach the output.

## C2 Trigger

**Rule:** with the catalogue users get loaded, and at least five runs per case:

- positive cases fire on at least 80% of runs, pooled;
- no positive case is at zero;
- no near-miss case ever fires.

Why these numbers: three runs only resolve thirds, so five is the smallest count
that can show 80%. In the pilot all thirty near-miss runs were quiet, so zero
tolerance is achievable.

**The catalogue is part of the result.** In the pilot two skills fired on six of
six runs alone and zero of six with the full pack loaded. Triggering falls as
the listing grows, and a skill whose request matches its description loosely
fails first. So:

- C2 is measured in pack mode. The isolated trigger rate is reported for
  diagnosis and is never sufficient.
- The certificate records which plugins were loaded and the listing size.
- A result for one catalogue says nothing about another.

**Skills invoked by name.** Some skills are meant to be started with
`/skill-name` or called by another skill. Certify those with cases whose prompts
use the name, named `named-…`. The certificate then says "invocation: by name".

The trigger measurement counts attempts to call the skill. In `claude plugin
eval`, a `tool_used: Skill` grader also counts a call to a skill that is not
loaded, so a grader for a neighbouring skill can pass when that skill is absent.

## C3 Outcome

**Rule:** from isolated-mode results with at least three runs per arm:

- every positive case has a delta above zero;
- the mean delta across cases is at least 0.25;
- the mean with-skill score is at least 0.80;
- at least one deterministic grader passes with the skill and fails without it.

A grader that passes in both arms on every run is non-discriminating. It is
reported and does not count. In the pilot ten of thirty-four outcome graders
behaved this way.

A deterministic grader is a regex, file or tool-use check. An LLM-judged grader
does not satisfy the last condition, because judges split their votes on long
outputs.

## C4 Portable

Not automated here. The certificate records other harnesses as `NOT_EXERCISED`.
To claim portability, run the same cases through each harness's own runner and
record the harness version, the model and the result for each.

## The certificate

`certificate.json` holds the skill name, the content hash (the skill directory
without `evals/`), a separate hash of the cases, the level held, the harness and
model, every level's result with its findings, the decisions awaiting the
operator, any recorded exceptions, the eval cost, and the exact commands run.

Any edit to the skill changes the content hash and voids the certificate. A new
harness version or model voids C2 and above.
