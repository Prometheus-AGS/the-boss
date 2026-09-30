# Profile and CLI

Use `node <skill>/scripts/cadence.mjs <command> --root <state-directory> --input <request.json> --command-id <stable-id>`. Commands emit JSON; failures exit nonzero. Retry the same mutation with its original command ID and input. No shell scripts or command-string interpretation are required.

## Configure

`init` accepts a profile or `{ "profile": {...} }`; omitted fields receive defaults. Profile `schemaVersion` remains **1**; newly created state and reports use **2**. `configure` changes future iterations only.

Set `iterationMinutes`, `reviewEvery` (0 means autonomous), hard `budgets.maxRunMinutes/maxIterations`, and `publication.mode/every`. Human review counts finalized attempts; publication counts successful deliveries. Architecture approvals and native harness limits remain binding. Configure three procedures: required `build`, a `run` with `purpose: "launch"`, and a separate feature `run`. Every checkpoint has `id`, `kind`, `command`, string-array `args`, explicit `cwd`, and optional `required`, `timeoutMs`, `secretEnv`. Secrets are environment references, never values in receipts.

For The Boss: retain 120 minutes; run `pnpm build:mac:arm64` at every completed delivery; publish macOS ARM64/x64 and Windows x64/ARM64 every second delivery through the website. Linux installers remain excluded. A pnpm command resolves its JavaScript entry rather than executing a Windows shell shim.

`publication` also accepts `platforms`, `websiteUrl`, `requireMetadata`, and `acceptancePlatforms`. These define required receipts; do not add acceptance platforms without corresponding actual acceptance arrangements.

Publication uses the current explicitly configured policy, including for an outstanding delivery, and records its profile revision and publication policy. Changing policy never clears publication debt by itself: the matching artifact, metadata and website receipts must still be recorded. Historical delivery profiles and build/run receipts remain frozen. If the operator separates installed acceptance from publication scheduling, retain pending acceptance in the release receipt and owning phase; removing it from the publication gate does not certify it.

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
    "checkpointId": "operate-team-board"
  }
}
```

The feature checkpoint must be configured. `start.checkpoints` can supply the complete per-iteration checkpoint list; it is frozen on that iteration without changing the global profile. Commands in that list must run real project entrypoints. A baseline onboarding run cannot satisfy a new feature's operation.

## Delivery commands

- `activity start`: `{ "kind":"implementation", "actor":"runtime-owner", "childId":null }`; `activity stop`: `{ "activityId":"returned-id" }`. Explicit observed `startedAt/finishedAt` may be supplied. Stop one actor's open activity before starting another. `activity status` lists records.
- `observe`: import an actual interval with `kind`, `startedAt`, `finishedAt`. `{ "reopened":{"tasks":["id"]}, "source":"ledger-reference" }` records reopened canonical work. Do not reconstruct missing duration from memory.
- `ready`: `{ "codeComplete":true }` freezes the current sources after the entire increment is wired. Unresolved child work blocks it.
- `checkpoint`: `{ "id":"build" }`, then launch, then the selected feature operation. Repeated builds require `reason`. Preserve earlier attempts.
- When the completed operation needs a different process timeout, `checkpoint` may include positive integer `timeoutMs` and a mandatory `reason`. The attempt records both configured and requested limits; it preserves the frozen command and scope, continuous iteration clock, and hard run budget. It does not authorize extra functionality or bypass an approval.
- `finish`: supply `outcome`, `completion` with separate canonical tasks/changes/phases, and optional local-file `artifacts`. KBD/goal completions require `canonicalEvidence` pointing to the supported ledger export. All required successful receipts must match frozen sources. Failed delivery is repaired before new scope.
- `publication`: supply `iterationId`, `outcome`, local `artifacts`, and a receipt file identifying version, frozen sources, checksummed published artifacts, and required website/metadata/acceptance evidence. Workflow dispatch is not publication.
- `review`: `{ "acknowledged":true }` only after real operator acknowledgement.
- `resume`: reconcile children, interrupted jobs and hooks; it does not start a new agent loop or blindly repeat external effects.

While publication is due, unrelated increments are blocked. Corrective `start` additionally needs `correction: { "iterationId":"failed-delivery-id", "reason":"observed problem", "evidencePath":"/absolute/failure.json" }`. The evidence identifies that iteration, `status:"failed"`, and the failed `operation`. Corrective scope must address that failure; it does not waive publication debt.

## Compatibility and historical work

`status` and `report` can read existing state. Run explicit `migrate` before new v2 mutations: it backs up state/events, appends a migration record, and leaves old iteration objects and receipts unchanged. Do not rewrite history to claim v2 acceptance.

`history` links `{ "phaseId":"canonical-child", "reason":"why previously untracked", "evidencePath":"/absolute/receipt", "sourceRefs":[] }`. These references carry no delivery or completion credit and unknown timing. Use this for the earlier UAR inference child; do not invent an iteration.

Read [child recovery](child-recovery.md) for nested work and [measurement](measurement.md) for timing/learning semantics.
