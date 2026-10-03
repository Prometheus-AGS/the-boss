# The Boss delivery profile

A completed delivery boundary builds the local macOS ARM64 application with the
repository's `pnpm build:mac:arm64`, then launches **that newly built application**
and operates the completed feature. It does not run a test suite. The configured
repository must be explicit; the helper never defaults to the installed app.

From the skill directory, configure the launch command as a program plus arguments:

```text
node scripts/boss-launch.mjs --repository /absolute/the-boss-checkout --scenario /absolute/completed-feature.mjs --require-scenario
```

By default the helper runs
`<repository>/dist/mac-arm64/The Boss.app/Contents/MacOS/The Boss`. Supply `--app`
for another built `.app`. It creates an isolated temporary user-data directory,
binds DevTools to loopback on an ephemeral port, waits for DevToolsActivePort and a
page target, and uses CDP to observe a complete, nonempty rendered UI. It closes only
its owned application process tree after recording the receipt. `--keep-open`
retains the launched instance and reports its PID for manual inspection.

Options include `--timeout-ms 60000` and `--receipt <absolute-path.json>`. Set
`BOSS_CADENCE_LAUNCH_TIMEOUT_MS` for a checkpoint-level default; an explicit
`--timeout-ms` takes precedence. Without either, the launcher allows 60 seconds.
The default receipt is written under the repository's `.prometheus/cadence/receipts/`. The isolated
profile is preserved for inspection and its path is recorded. Installed user data
is not copied or changed. No application secrets are inherited by default; features
requiring credentials need explicit setup inside the isolated app or a suitably
configured trusted scenario. This helper is specific to macOS; it does not certify
Windows or Intel runtime behavior.

## Completed-feature operation

The trusted `.mjs` scenario exports:

```js
export default async function run({ evaluate, targets, signal }) {
  signal.throwIfAborted();
  // Use evaluate(source) to interact with the actual rendered application and
  // observe the completed feature's promised result through its real boundary.
  // Throw when the expected behavior is absent; do not replace it with a stub.
  return { observedBehavior: 'Describe the actual successful feature operation.' };
}
```

`evaluate` runs JavaScript in the live renderer using `Runtime.evaluate`, awaits
promises, and returns JSON-serializable values. `targets` contains the observed
DevTools targets. `signal` aborts on cancellation or timeout. The scenario is
privileged local code, not a sandbox. Never return credentials, user content or
provider responses in `observedBehavior`; the receipt keeps that short description.

Without a scenario, a successful receipt says `launch: renderer-ready` and
`functionalAcceptance: not-performed`. This proves launch readiness only. With a
successful scenario it records `functionalAcceptance: scenario-confirmed`, the
scenario path/digest and the observed behavior. `--require-scenario` refuses a
missing scenario before launching. The helper cannot judge the quality of a
scenario's assertions: author the scenario for the **current completed scope**, and
review its actual operation. Build and launch steps should belong to the same frozen
iteration scope; the helper records executable path, size and modification time but
does not assert the application's bytes match a Git revision by itself.

## Four-platform publication every two iterations

The cadence profile decides publication frequency. Configure every two successful
iterations and the desired four platform targets; an interval is configurable, not
hardcoded into the launcher or workflow. Keep publication authorization and observed
publication completion separate from launch success. This source checkout's
`.github/workflows/the-boss-release.yml` accepts these exact dispatch input names:

| Input | Type | Required/default |
| --- | --- | --- |
| `release_version` | string | Required; source default `2.2.6`; must match package.json |
| `release_profile` | choice | Required; `non-uar` or `uar-enabled`; default `uar-enabled` |
| `platforms` | string | Optional comma-separated platform selection |
| `replace_published_platforms` | boolean | Optional; default false |
| `uar_win32_x64_record_url` | string | Optional input; required by UAR-enabled profile |
| `uar_win32_arm64_record_url` | string | Optional input; required by UAR-enabled profile |
| `uar_darwin_arm64_record_url` | string | Optional input; required by UAR-enabled profile |
| `uar_darwin_x64_record_url` | string | Optional input; required by UAR-enabled profile |

The four targets correspond to Windows x64, Windows ARM64, macOS ARM64 and macOS
x64. Use the release repository's platform selector contract for the `platforms`
string. Read the application's current version; the source default is not a promise
that a future release still uses that version. Immutable sidecar records must belong
to the intended release/profile.

`workflow_dispatch` prepares and builds installers. Separate
`repository_dispatch` events of type `boss_release_platform_published` trigger the
serialized metadata/site publication path. A workflow-dispatch acknowledgement is
therefore not evidence that all four installers or the download site are published.
No workflow dispatch or email is performed by generating this profile or launching
the local application.

## Frozen releases and independent work

Freeze complete source/runtime/skill payloads before building. One approved future scope may be edited in an isolated worktree/output directory while the frozen delivery builds or publishes. Do not mutate the checkout consumed by the active build. Preserve 120 minutes and every-two successful-delivery publication; no per-delivery question is required when that recurring policy is already authorized. Installed acceptance remains separate.

Before dispatch, record whether the consumer enforces immutable source checkout, external correlation/recovery, artifact provenance, target-wide serialization, expected-predecessor promotion and site receipts. The observed Boss publisher reads a release branch and compares package versions: do not advance that version while its release is running. Independent editing and PR preparation can continue. A local Cadence reservation does not fence GitHub jobs. Missing capabilities remain blocked with an owning follow-up; dispatch acknowledgement never substitutes for them.
