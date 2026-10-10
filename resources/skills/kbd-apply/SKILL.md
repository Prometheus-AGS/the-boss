---
name: kbd-apply
description: KBD-owned spec-apply driver. Wraps a spec backend — openspec (the default engine), speckit (GitHub Spec Kit), or native-kbd (the always-available fallback) — and drives it ONE task at a time, so KBD stays the source of truth — every task boundary fires KBD hooks, emits a plain-text position signal, and syncs progress.json and the waypoint. Replaces the broken pattern of handing the turn to a bare "implement everything" command that runs outside KBD.
---

# /kbd-apply

The execute-phase work surface. `/kbd-execute` selects the backend and writes
the dispatch contract; **`/kbd-apply` walks the tasks.**

## Why this exists

Handing implementation to a backend's bare "implement everything" command
(OpenSpec's `/opsx:apply`, Spec Kit's `/speckit.implement`) fires no KBD
hooks, writes no `progress.json`, refreshes no waypoint — it funnels the user
out of the execute phase and loses the connection back to it. This driver
fixes that by making **KBD own the loop** and calling the spec backend per
task.

> **Hard invariant:** never invoke a backend's "do everything" command. Drive
> one task at a time through this skill.

## The per-task loop (what the model does each turn)

Before beginning the selected task, read its scoped **Task model assignments** entry from the phase `plan.md` and follow [task model selection](../kbd-plan/references/task-model-selection.md). Recheck the concrete provider/model, supported effort and native or liter-llm-plus-worker route. Record the assignment reference and actual route in `execution.md` and the worker handoff. Create an explicit assignment for a legacy plan; revise one whose task, harness or model evidence changed. Do not silently substitute the host model or a listed native alternative.

If the route is unresolved, surface the prerequisite and retain the task as pending; independent eligible tasks may proceed in dependency order. The driver owns begin/end hooks and canonical completion. Return worker results to this driver; inference alone never proves workspace execution. This selection step does not authorize per-task tests or early review.

```bash
APPLY="boss-mini kbd-apply.mjs"
# Select the change from DERIVED state — see "Which change" below. Never from
# the waypoint's `exactNextCommand`.
CHANGE="<see 'Which change am I on' below>"

# 1. Read the task surface (TSV: id \t done \t title)
$APPLY list "$CHANGE"
read -r TOTAL COMPLETE REMAINING < <($APPLY progress "$CHANGE")

# 2. For each NOT-done task, one per turn:
$APPLY begin-task "$CHANGE" "$ID" "$I" "$TOTAL" "$TITLE"
#   → on the first observed task, opens change:before
#   → opens task:before and prints the canonical change/task signals

#   <<< implement EXACTLY this one task here (edit code/docs) >>>

$APPLY end-task "$CHANGE" "$ID" "$I" "$TOTAL" "$TITLE"
#   → marks the task done in the backend, syncs progress.json,
#     fires task:after, prints "Completed task <I> of <TOTAL>: <TITLE>"
#   → on the final task, closes change:after

# 3. Only at the complete production delivery boundary, run this repo's final QA gate, then:
$APPLY verify  "$CHANGE"   # backend verify (openspec validate; speckit structural check)
$APPLY archive "$CHANGE"   # backend archive
```

The plain-text "Starting/Completed task i of n" lines are the **user-facing
guarantee**; the fired hooks are the extensibility layer (memory mirror,
custom reporters, overrides).

## Task identity

The runtime keys tasks by ID. `begin-task` and `end-task` pass the backend
task ID (the OpenSpec ordinal from `list`, e.g. `1`). When `/kbd-plan` already
registered the change's tasks under other IDs (e.g. `<change>-t1`), the driver
**reuses** them: an exact ID wins, then the task with the same normalized
title (a leading `1.2 ` is ignored), then the unique task with the same
sequence. If the change has registered tasks and none matches, the driver
refuses instead of registering a duplicate. Duplicates would leave the planned
tasks pending forever, so the change could never complete. To avoid mapping
entirely, register plan tasks with the backend IDs.

## Which change am I on

In this order:

1. `current-waypoint.json`'s `.nextChange`, when present.
2. Otherwise the first entry in `phases/<phase>/progress.json`'s `changes[]`
   whose status is not `DONE`, honouring the phase plan's order. For a child
   phase, read the child's ledger, not the parent's.

**Never select work from `exactNextCommand`.** It is a stored operator string
that is not rewritten by ordinary task completion and can drift far behind
actual progress. Treat it as the operator's stated intent — useful context
for *why* this phase is running, never an answer to *what to run next*.

## Subcommands

| Command | Effect |
|---|---|
| `detect [dir]` | print backend id: `openspec`, `native-kbd`, `speckit`, or empty |
| `list <change>` | tasks as TSV `id⇥done⇥title` |
| `progress <change>` | `total complete remaining` |
| `begin-task <change> <id> <i> <n> <title>` | open a missing `change:before`, then fire `task:before` + position signals |
| `end-task <change> <id> <i> <n> <title>` | mark done + sync + close `task:after`; the final task also closes `change:after` |
| `mark-done <change> <id>` | flip one task done (no hooks) |
| `verify <change>` | backend verify (openspec `validate`; speckit/native-kbd structural check); non-zero exit = fail |
| `archive <change>` | backend archive (openspec `archive`; speckit/native-kbd move under `archive/`) |

## Backends

Three engines are implemented, dispatched through the extensible `specEngines`
registry in `lib/kbd/spec-backend.mjs` (metadata and version pins live in
`config/spec-engines.json`):

| Engine | Adapter | Notes |
|---|---|---|
| **openspec** (default) | `os*` — via the real `openspec` CLI, spawned with no shell | The default engine: when a repo carries more than one backend's evidence and nothing is pinned, detection resolves to openspec |
| **speckit** | `sk*` — pure filesystem markdown parsing of `specs/<change>/{spec,plan,tasks}.md`; the `specify` CLI is never invoked | `verify` = all checkboxes checked AND `specs/<change>/spec.md` exists; `archive` moves `specs/<change>` → `specs/archive/<date>-<change>` |
| **native-kbd** | `nk*` — `.kbd-orchestrator/changes/<change>/tasks.json` | The always-available fallback |

Detection order: **pinned > openspec > speckit > native-kbd**. Pin a specific
engine via `.kbd-orchestrator/project.json`:

```json
{ "specBackend": "speckit" }
```

Valid pin values: `openspec`, `speckit`, `native-kbd` (`auto`/absent = detect).

**Engine version pins.** Each engine's pinned upstream version (openspec
1.14.0 from `package.json`; spec-kit 1.1.2) is recorded in
`config/spec-engines.json` with its rationale. The speckit adapter is
markdown-based, so the pin exists for *layout* conformance: when a new Spec Kit
release ships, check whether `specs/<slug>/{spec.md,plan.md,tasks.md}` or the
tasks.md checklist shape changed. If unchanged, bump `pinnedVersion` in
`config/spec-engines.json` to the new release. If the layout changed, update
the `sk*` adapter and `lib/kbd/spec-backend-speckit.test.mjs` first, then bump
the pin — never bump the pin ahead of a verified adapter. To add a new engine,
see the `customEngines.hint` in that file.

## Progress Signals (MANDATORY)

```
Starting kbd-apply — <change>
Completed kbd-apply — <change> (<n>/<n> tasks, verified + archived)
```

Per-task `Starting/Completed task <i> of <n>: <title>` signals are emitted by
the driver's `begin-task`/`end-task` — relay them verbatim to the user.

## Relationship to other skills

- `/kbd-execute` — selects backend, writes `execution.md`, then defers task
  execution to this skill.
- `/kbd-reflect` — consumes the per-task `progress.json` this driver maintains.
- Child loops (`/kbd-new-child`, `/kbd-next-child`) use this **same** driver,
  so nested phases get identical per-task reporting.
