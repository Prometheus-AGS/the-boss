# Profile and CLI

Use `node <skill>/scripts/cadence.mjs <command> --root <state-directory> --input <request.json> --command-id <stable-id>`. Commands emit JSON; failures exit nonzero. Retry the same mutation with its original command ID and input. No shell scripts or command-string interpretation are required.

## Configure

`init` accepts a profile or `{ "profile": {...} }`; omitted fields receive defaults. Profile `schemaVersion` remains **1**; newly created state and reports use **3**. `configure` changes future iterations only.

Set `iterationMinutes`, `reviewEvery` (0 means autonomous), hard `budgets.maxRunMinutes/maxIterations`, and the publication opportunity policy described in [pipeline contracts](pipeline-contract.md). Human review counts finalized attempts. Publication accepts `manual`, `count`, `interval`, or `either`; legacy `every` aliases count. Count uses successful deliveries and `every`; interval/either require positive `intervalMinutes` and an explicit `anchorUtc` ending in Z. `tick` evaluates due opportunities only when invoked; it does not install a timer. Architecture approvals and native harness limits remain binding. Configure three procedures: required `build`, a `run` with `purpose: "launch"`, and a separate feature `run`. Every checkpoint has `id`, `kind`, `command`, string-array `args`, explicit `cwd`, and optional `required`, `timeoutMs`, `secretEnv`. Secrets are environment references, never values in receipts.

For The Boss: retain 120 minutes; run `pnpm build:mac:arm64` at every completed delivery; publish macOS ARM64/x64 and Windows x64/ARM64 every second delivery through the website. Linux installers remain excluded. A pnpm command resolves its JavaScript entry rather than executing a Windows shell shim.

`publication` also accepts `platforms`, `websiteUrl`, `requireMetadata`, and `acceptancePlatforms`. These define required receipts; do not add acceptance platforms without corresponding actual acceptance arrangements.

Publication obligations freeze their original due time, policy revision and candidate coverage. Changing future policy never clears or postpones existing debt: matching artifact, metadata and website receipts must still be recorded against each obligation. Historical delivery profiles and build/run receipts remain frozen. If the operator separates installed acceptance from publication scheduling, retain pending acceptance in the release receipt and owning phase; removing it from the publication gate does not certify it.

## Start a usable increment

```json
{
  "scope": {
    "tasks": ["canonical-task-id"], "changes": [], "phases": [],
    "outcomes": ["Operators can reassign a team task"],
    "deliveryClass": "team-administration", "owners": ["desktop-owner"]
  },
  "sourceRefs": [{"repository": "/absolute/project"}],
  "featureOperation": {
    "id": "reassign-task", "outcome": "Operators can reassign a team task",
    "procedure": "Open the built application, reassign a task, restart and observe the retained owner.",
    "checkpointId": "operate-team-board",
    "promisedCapability": "Reassign a team task and retain ownership across restart",
    "entrypoint": {
      "command": "node", "args": ["tools/operate-team-board.mjs"],
      "cwd": "/absolute/project", "sourcePaths": ["tools/operate-team-board.mjs"],
      "buildProducedPaths": ["dist/application-entry.mjs"]
    },
    "target": {"kind": "real", "description": "Newly built application with isolated workspace"},
    "evidenceLevel": "real-service",
    "expectedResult": "The selected owner persists after restarting the built application",
    "prerequisites": [], "isolatedResources": ["/absolute/isolated-workspace"],
    "externalEffects": [], "authorityRefs": [],
    "limitations": ["Does not establish operation on another operating system"]
  }
}
```

The feature checkpoint must be configured. `start.checkpoints` can supply the complete per-iteration checkpoint list; it is frozen on that iteration without changing the global profile. Commands in that list must run real project entrypoints. A baseline onboarding run cannot satisfy a new feature's operation. If the procedure still needs implementation, supply its approved `creationTaskRef` from `scope.tasks`; complete it before ready. Use `entrypoint.sourcePaths` for source files that must exist before freeze and `buildProducedPaths` for outputs inspected after the build. Keep explicit target kind (`real`, `local`, `substitute`), evidence level, expected result and limitations. External effects carry their declared `authorityRef`; an authority string references actual approval, never creates it.

## Delivery commands

- `activity start`: `{ "kind":"implementation", "actor":"runtime-owner", "childId":null }`; `activity stop`: `{ "activityId":"returned-id" }`. Explicit observed `startedAt/finishedAt` may be supplied. Stop one actor's open activity before starting another. `activity status` lists records.
- `observe`: import an actual interval with `kind`, `startedAt`, `finishedAt`. `{ "reopened":{"tasks":["id"]}, "source":"ledger-reference" }` records reopened canonical work. Do not reconstruct missing duration from memory.
- `ready`: `{ "codeComplete":true }` records the current sources after the entire increment is wired. Include `completedTaskRefs` and `satisfiedPrerequisiteIds` for declared operation prerequisites; then use `candidate freeze` for immutable delivery inputs. Unresolved child work blocks it.
- `checkpoint`: `{ "id":"build" }`, then launch, then the selected feature operation. Repeated builds require `reason`. Preserve earlier attempts.
- When the completed operation needs a different process timeout, `checkpoint` may include positive integer `timeoutMs` and a mandatory `reason`. The attempt records both configured and requested limits; it preserves the frozen command and scope, continuous iteration clock, and hard run budget. It does not authorize extra functionality or bypass an approval.
- `finish`: supply `outcome`, `completion` with separate canonical tasks/changes/phases, and optional local-file `artifacts`. KBD/goal completions require `canonicalEvidence` pointing to the supported ledger export. All required successful receipts must match frozen sources. Failed delivery is repaired before new scope.
- `publication`: supply `iterationId`, `outcome`, local `artifacts`, and a receipt file identifying version, frozen sources, checksummed published artifacts, and required website/metadata/acceptance evidence. Workflow dispatch is not publication.
- `review`: `{ "acknowledged":true }` only after real operator acknowledgement.
- `resume`: reconcile children, interrupted jobs and hooks; it does not start a new agent loop or blindly repeat external effects.

One authorized isolated scope can use `work-ahead admit` while the frozen delivery builds or publishes; it cannot become another active iteration. Use `work-ahead status/promote` to preserve blockers and its original first work time. Publication capacity and unresolved delivery failures constrain promotion without erasing owed obligations. Corrective `start` additionally needs `correction: { "iterationId":"failed-delivery-id", "reason":"observed problem", "evidencePath":"/absolute/failure.json" }`. The evidence identifies that iteration, `status:"failed"`, and the failed `operation`. Corrective scope must address that failure; it does not waive publication debt.

The corrective iteration must name the immediately preceding unresolved failed delivery. It keeps a new source baseline and must build and operate its own complete increment. When a later, separately authorized integration gate has already resolved the product issue but cannot be matched to the frozen failed candidate, first `finish` the failed iteration with `outcome:"failed"` and no invented completion. Then run `failure resolve` with `{ "iterationId":"failed-delivery-id", "disposition":"retired", "reason":"why this frozen candidate cannot be repaired or credited", "authorityRef":"operator-or-canonical-decision-reference", "evidencePath":"/absolute/reconciliation.json" }`. The evidence is a JSON document retained by path and SHA-256. Retirement does not make that candidate successful, count a delivery, certify a KBD task, clear hooks, or discharge publication. Report and status keep the disposition visible. Reconcile canonical task state separately through supported KBD commands.

## Compatibility and historical work

`status` and `report` can read existing state. Run explicit `migrate` before new v3 mutations: it backs up state/events, appends a migration record, and leaves old iteration objects and receipts unchanged. Stop old mutators first. Migrate supported v1 through v2 into v3 without rewriting history to claim new acceptance.

`history` links `{ "phaseId":"canonical-child", "reason":"why previously untracked", "evidencePath":"/absolute/receipt", "sourceRefs":[] }`. These references carry no delivery or completion credit and unknown timing. Use this for the earlier UAR inference child; do not invent an iteration.

Read [child recovery](child-recovery.md) for nested work and [measurement](measurement.md) for timing/learning semantics.

## Skill-pack refresh procedure

`scripts/refresh-skill-pack.sh` is a ready-made checkpoint procedure that refreshes an installed skill pack from merged `main`. It replaces ad hoc, untracked per-machine scripts. Inputs come from flags or the matching environment variable:

| Flag | Env | Meaning |
|---|---|---|
| `--deploy <worktree>` | `REFRESH_DEPLOY` | Clean worktree that tracks `origin/main`. Never the actively edited checkout: a checkpoint freezes every source it names. |
| `--state <state.json>` | `REFRESH_STATE` | Cadence state, read directly for `--mode auto`. The cadence CLI is never called (a checkpoint already holds its lock). |
| `--mode full\|verify\|auto` | `REFRESH_MODE` | `auto` reads the active iteration's `index` from `state.json`: odd runs `full`, even runs `verify`. |
| `--services a,b` | `REFRESH_SERVICES` | launchd labels to `launchctl kickstart -k gui/$UID/<label>` after install. |
| `--receipt <file>` | `REFRESH_RECEIPT` | Also write the JSON summary here. |

`full` refuses a dirty or diverged deploy worktree (exit 1) before any install step, fast-forwards it to `origin/main`, runs `git submodule update --init --recursive`, then `scripts/update-skill-pack.sh --force` and `scripts/install-binaries.sh` from that worktree, then kickstarts each service. `verify` changes nothing. Both print one JSON summary with `sourceCommit`, `versions` (pk, learningWorker, surrealMemory), `health` (surreal-memory `/health`, overridable with `REFRESH_HEALTH_URL`), `pluginGeneration` and `pluginSourceCommit`.

Failures are loud: exit 1 for a failed step, exit 2 for unusable input. A missing, unreadable or non-numeric iteration in `state.json` exits 2 and does no work; the script never defaults an iteration number.

Point a checkpoint at it as a program plus arguments, for example:

```json
{"id":"refresh","kind":"procedure","command":"bash",
 "args":["/abs/path/.prometheus/cadence/procedures/refresh-skill-pack.sh"],
 "cwd":"/abs/project","required":true}
```

The local procedure file is a git-ignored shim that `exec`s `$HOME/.claude/skills/delivery-cadence/scripts/refresh-skill-pack.sh` with this machine's deploy worktree, state path and services; see [examples/refresh-skill-pack-shim.sh](../examples/refresh-skill-pack-shim.sh). Only integration tests set `REFRESH_TEST_MODE=1` with `REFRESH_UPDATE_CMD`, `REFRESH_INSTALL_CMD` and `REFRESH_KICKSTART_CMD` (receives the label as `$1`) to substitute recording stubs.
