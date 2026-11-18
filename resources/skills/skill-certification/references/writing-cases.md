# Writing cases that measure something

Cases live in `<skill-dir>/evals/`, one folder per case, in the layout
`claude plugin eval` reads. Anthropic's `skill-creator` writes the same layout,
so one set of cases serves both.

```
evals/
└── flags-negative-quantity/
    ├── prompt.md          # the user's request
    ├── case.yaml          # name and expected outcome
    ├── graders/           # one file per check
    │   ├── 00-skill-fired.md
    │   ├── 01-….md
    │   └── 02-….md
```

A case in this pack has no scaffold script. `claude plugin eval` runs a case's
`scaffold_script` with bash, and this pack ships no shell script, so a case that
needs a prepared working directory is not portable here. Put the state the skill
must react to in the prompt, or leave the case out and record why.

## The minimum set

- **Two outcome cases**, each built from one of the skill's most specific,
  checkable promises.
- **One near-miss case**: a request that shares vocabulary with the skill but
  needs something else. Name it `near-miss-…`.

## Rules

1. **Read the skill's contract first.** Write cases from what the skill
   promises, not from what it happens to output.
2. **The prompt must not name the skill.** A prompt that uses the skill's own
   words measures recall of the name. Write at least one positive prompt the way
   a user who has never heard of the skill would. The exception is a skill meant
   to be invoked by name: name those cases `named-…`.
3. **Always include a skill-fired grader** as `00-…`, marked with-only. It is the
   trigger measurement, and it explains every delta of zero. The certification
   script reads the grader whose name starts with `00-`.
4. **Prefer deterministic graders.** A regex over the final message or a produced
   file, a tool-use count, a file's existence. Use an LLM judge only for what
   cannot be pattern-matched, and expect split votes.
5. **Word a grader about the result, not about where a runner saves it.**
6. **Accept every format the skill legitimately produces.** A grader that
   accepts only JSON fails a skill that prints the same values in a table.
7. **Give the case a working directory when the skill reads one.** A skill that
   reports project state needs state to report. Here that state goes in the
   prompt, because a scaffold script would have to be a shell script.

## Runner facts that cost time when unknown

- The eval directory cannot sit inside a loaded `skills/` tree, and its name
  must start with a letter or digit. Pack mode copies the cases beside a scratch
  copy of the plugin for this reason.
- A case's `plugins:` entry cannot point outside the plugin under test.
- A second `--case` flag replaces the first. Use one glob.
- Scaffold scripts are bash and run only with `--scaffold`. This pack's runner
  never passes it.
- The runner exits 1 when any case is below its threshold. That is a finding,
  not a tool failure.
- Traces are deleted after the run. The HTML report is the only place to read
  outputs afterwards.
- The run happens in a temporary home with only the plugin under test loaded and
  no user settings or hooks. A skill that depends on a hook being active cannot
  show that here.

## Calibrating

Smoke-run one case once before the full run. Then read the first real output
against each grader:

- If a grader fails on every with-skill run while the skill fired, read the
  output before believing the score.
- If a grader passes in both arms on every run, it does not discriminate. Remove
  it or sharpen it.
- If the skill did not fire, add a temporary grader for any skill being called
  and one for the likeliest neighbour. Then you know whether nothing fired or a
  neighbour took the request.
