# When a level fails

The operator decides. The job here is to make the decision informed: say what
failed, propose a fix, and state the impact of each choice. The report's
"Decisions for the operator" section carries all three for every failed or
incomplete level.

## The three options

| Option | What happens | Recorded as |
|---|---|---|
| **Fix** | Apply the proposed fix and certify again | A new certificate |
| **Accept** | Ship at the level below | `--accept <level>=<reason>` in the certificate; the level is not raised |
| **Abandon** | Do not ship the skill | No certificate kept |

Present them as a question with the impact attached. Do not pick one, and do not
ship at a lower level without saying so.

## Impact by level

| Failed level | If accepted, users experience | Cost to fix |
|---|---|---|
| C0 | Strict harnesses may reject or skip the skill; it cannot be called agentskills.io-conformant | Minutes; frontmatter only |
| C1 | A model following the skill reaches a missing file or a script it cannot run, usually mid-task | Minutes to an hour; no model runs |
| C2 | The skill rarely starts on its own in this catalogue, or starts on the wrong requests. It still works by name or when another skill calls it | A description rewrite and a re-run of the trigger cases |
| C3 | No evidence the skill improves the result; it costs listing and context space for an unmeasured benefit | Changes to the skill or its graders and a re-run of both arms |

## Common causes and the fix that matches

**C0: fields the specification does not allow.** `version`, `tags`, `authors`,
`triggers` at the top level. Move them under `metadata` as strings. A list of
tags becomes one comma-separated string.

**C2: fires alone, not in the pack.** The catalogue is too large for the
harness's listing budget, or the description matches the request loosely.
Rewriting the description helps the second cause only. For the first, install by
domain so the listing is smaller, or carry a must-have rule in a hook, which does
not depend on selection.

**C2: never fires, even alone.** The description does not say when to use the
skill, or says it in the author's vocabulary. Lead with the user's words and add
"use when" and "do not use for" clauses.

**C2: a near-miss fires.** Add an exclusion that names that kind of request.

**C2: the skill is meant to be invoked by name.** Do not fail it. Rewrite the
cases with prompts that use the name, name them `named-…`, and certify it as
invoked by name.

**C3: delta of zero and the skill never fired.** Nothing was measured. This is a
C2 problem.

**C3: the skill fired but a specific grader always fails.** Read the output. If
the output is right in a format the grader does not accept, fix the grader. If
the output is wrong, fix the instruction.

**C3: graders pass in both arms.** The base model already does this. Either the
skill adds nothing here, or the case does not test what the skill adds. Write a
case around a promise the base model would not meet unprompted.

## What not to do

- Do not disable model invocation to hide a trigger failure. A skill with model
  invocation disabled cannot be called by other skills either.
- Do not loosen a grader until it passes. A grader that passes in both arms
  counts for nothing.
- Do not re-run until a noisy case happens to pass. Raise the run count and
  report the rate.
