# Packaged handoff provenance operation

The lead runs this procedure only after full/mini production wiring, generated
modules, payload pinning and the new signed Mac package are complete:

```text
node scripts/operate-team-handoff-provenance.mjs --boss <checkout> --launcher <maintained-boss-launch.mjs> --output <cadence-artifacts>
```

Node 22 or newer is required. The maintained launcher opens the actual packaged
application with an isolated application profile. The procedure waits for its
main document and preload IPC to be ready, then invokes the actual bundled mini
creator at `The Boss.app/Contents/Resources/app.asar.unpacked/resources/prometheus-skills-mini/skills/agent-team-creator/scripts/cli.mjs`.
It never substitutes a source-pack CLI. The receipt hashes the app archive,
bundled creator module inventory, launcher, operation helpers and actual reader.
No model/gateway requalification is performed or required by this local flow.

The canonical reader defaults to the root-supplied
`/Users/gqadonis/.local/bin/prometheus`; `BOSS_C15_KBD_CLI` can explicitly select
another absolute reader path. The canonical path is the root-supplied
`/Users/gqadonis/Projects/prometheus/worktrees/agent-fabric-c06/librefang/docs/plans/agent-fabric-convergence`.
Only `kbd --path <initiative> status --json` is called. A disposable local task
mirrors the actual C15.3 identity; no canonical task is created or transitioned.
The receipt records before/after task status independently of unrelated global
revision or canonical receipt changes.

The operation initializes a real disposable Git workspace without a commit,
captures explicitly selected dirty source, actual application-readiness evidence,
an existing Karpathy file and a scoped memory queued through the real CLI. Git
HEAD is honestly absent. `BOSS_C15_KARPATHY_FILE` selects an existing operator
reference; the default is the actual historical `c09-1-karpathy-event.json`,
explicitly labeled as C09.1 evidence rather than new C15 progress. The memory
remains queued; no memory publication command or network endpoint is called.

It inspects matching provenance before ownership acceptance, changes/removes only
disposable selected source files, and checks immutable captured hashes plus
changed/missing reporting. Explicit reviewer/Claude acceptance transfers only
local ownership. A separate stale task must refuse acceptance with the actual
task revision conflict and leave the private state bytes unchanged.

The legacy path defaults to the root-retained actual previous packaged creator
under `<initiative>/.prometheus/cadence/artifacts/c15-legacy-creator-runtime-20261008`.
`--legacy-creator <directory>` can locate the same immutable retained producer;
its CLI/handoff hashes must match the root-supplied identities and retained
provenance. At this boundary that genuine old CLI creates a packet in another
disposable workspace. The new packaged CLI reads it without mutation and reports
legacy provenance unavailable. This is a packet generated at the boundary by a
retained prior packaged producer, not historical human work. Nothing is stripped
or edited to fabricate a legacy record.

Public evidence contains only allowlisted identities, hashes, observations,
ownership and command exit/code receipts. Private request/state files retain the
actual local packet and queued memory with restrictive permissions. Raw CLI
errors, prompts, memory/source bodies and credential values are not copied into
evidence. Evidence is saved before scenario failure is raised; the entrypoint
also saves its operation receipt when launch or prerequisites fail.

This contributes only the handoff increment. Whole C15.3, reviewed plugin/skill
locks, effective native host grants and native Windows acceptance remain pending.
No destination native harness session, model inference, session migration or
permission transfer is demonstrated by local handoff acceptance. Source readiness
is not runtime acceptance; no operation has run merely because this driver exists.
