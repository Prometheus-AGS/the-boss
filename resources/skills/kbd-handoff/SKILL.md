---
name: kbd-handoff
description: Hand the active KBD phase to another harness (claude-code, codex, opencode, kimi-code) by writing a read-only handoff packet — position, repo state, files to read, operator gates, task rules, never-do list, open prerequisites and the exact start prompt. Refuses on open boundary obligations or a missing phase. No lease; never edits KBD state.
---

# /kbd-handoff

Prepare another harness to resume the active KBD phase. The packet records
position and rules; it never transfers ownership, takes a lease or edits
canonical KBD state.

## Progress Signals (MANDATORY)

```text
Starting kbd-handoff — <phase> to <harness>
Completed kbd-handoff — <phase> packet <path>
```

The script prints both, then the start prompt. Relay the start prompt to the
operator verbatim.

## How to invoke

Run from the project root:

```bash
node <pack-root>/scripts/kbd-handoff.mjs --to <harness> [--phase <name>] [--dry-run]
```

| Option | Meaning |
|---|---|
| `--to <harness>` | Required. `claude-code`, `codex`, `opencode` or `kimi-code` (aliases `claude`, `kimi`). Anything else exits 2. |
| `--phase <name>` | A phase on the active path, or a top-level phase directory. Default: the active phase path. |
| `--dry-run` | Print the packet and start prompt; write nothing. |

Exit codes: `0` packet written (or dry run), `1` refused, `2` usage error.

## What it reads (read-only)

1. `prometheus kbd status --json` when the CLI runs (15 s timeout, stdin
   closed; `PROMETHEUS_BIN` overrides the executable). Note that this CLI call
   may create `.prometheus/project.json`; it does not touch KBD state.
2. Otherwise the projections: `.kbd-orchestrator/current-waypoint.json`,
   `position-reminder.txt`, the phase `progress.json`, and `plan.md` /
   `execution.md` when present. Boundary obligations cannot be checked this way;
   the packet says so.

Implementation N/T always comes from the phase `progress.json`
`completion.implementation`. `exactNextCommand` is history and is never used to
select work.

## Refusals and warnings

- **Missing phase** — exit 1; select or create a phase first.
- **Open boundary obligations** — exit 1 for a blocking obligation: an open
  task (begin-task without end-task), or a change or phase the runtime already
  marks complete or does not know (an interrupted close). The active phase path
  and the active, unfinished change are expected to be open. A change or phase
  outside the active position that is started and not finished (carry-over in
  an earlier open phase) is a warning, not a refusal. For each blocking
  obligation the script prints the repair command:
  `prometheus kbd guard evaluate --boundary <change|task> --edge after --subject <subject> --json --repair-projections`.
- **Dirty or unpushed worktree** — warning only; recorded under open
  prerequisites.

## Target harness checks

- When the project has an agent team (`.agent-team/project-routing.json`
  manifest, or a single `.agent-team/<team>/team.json`), every role needs a
  native definition in `.claude/agents/`, `.codex/agents/` (`.toml`, underscore
  names), `.opencode/agents/` or `.kimi-code/agents/`.
- Installed `kbd-*` skills for the target are listed from its skill roots
  under the user home and the project (`.claude/skills`; `.codex/skills` and
  `.agents/skills`; `.opencode/skills`; `.kimi-code/skills`). A dangling
  symlink, a non-directory or a directory without `SKILL.md` is reported as
  broken by path. `kbd-apply` and `kbd-status` must resolve. The script never
  installs or repairs skills: that changes the operator's machine and needs
  approval.

## Output

One packet and one sidecar, never under `handoffs/` (which holds stage
handoffs):

```text
.kbd-orchestrator/phases/<phase>/harness-handoffs/<harness>-<UTC timestamp>.md
.kbd-orchestrator/phases/<phase>/harness-handoffs/<harness>-<UTC timestamp>.json
```

For a child phase the directory is the child's node directory. Packet
sections: Position, Repositories, Read in order, Operator gates and decisions
(from `plan.md` sections whose heading names gates or decisions), Task
execution rules, Never do (summarized from `AGENTS.md`), Target harness, Open
prerequisites, Start prompt.

## Never

- Edit `progress.json`, the waypoint or any projection; run lease, handoff or
  heartbeat commands.
- Push, commit or publish the packet on the operator's behalf.
