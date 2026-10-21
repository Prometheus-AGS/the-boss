# UAR lifecycle payload binding handoff — 2026-10-20

Classification: authorized implementation/documentation writing and source
inspection only. Verification gate: **CLOSED**. No checks, builds, tests, format,
lint, typecheck, packaging, policy validator, digest command, or producer script
was executed. The lead owns Git/publication and final source identity.

## Delivered source

- `build/local-uar-source.json`: schema 2 now declares exact native target,
  `["server-full"]`, and required inherited control protocol version 1 with
  `LIFECYCLE:` response prefix. Revision remains the old real pin
  `84bf41bf28891d6075b898796a040b063298fad3` pending the lead's actual committed
  UAR snapshot. It must not be interpreted as the new candidate identity.
- `scripts/uar-candidate-binding.cjs`: requires candidate receipt source/tree,
  exact producer/command/features/target, immutable Git-object snapshot mode,
  fresh target declaration, retained log/executable digests, and matching
  manifest/outer-record provenance.
- `scripts/local-uar-payload.cjs`: explicit
  `THE_BOSS_LOCAL_UAR_CANDIDATE_RECORD` selects immutable committed-object
  candidates. It resolves the pinned commit/tree from
  `THE_BOSS_LOCAL_UAR_SOURCE_DIR`, compares the receipt, archive and file digests,
  and retains provenance in the staged marker. Unrelated dirty working files
  are never inputs in this mode. The no-record legacy path retains its original
  clean-checkout/HEAD pin checks and standard archive location. Archive loading
  rejects undeclared/duplicate entries and nonregular link entries before
  extraction, preserving file/path/hash checks.
- `scripts/prepare-local-uar-payload.cjs`: loads and checks the whole archive
  before readiness reporting, then removes temporary extracted state.
- This handoff records contract, pending identity and gate limits.

Cross-project explicit ownership also delivered UAR
`scripts/build-boss-candidate.mjs` and
`docs/operations/lifecycle-candidate-payload.md`. The helper is standalone and
not workflow-invoked. It exports the exact immutable root and recursive gitlink
objects, requires its own source to match the selected commit, builds only in
a fresh temporary target directory, and retains the log, payload directory,
archive and record outside the checkout. It never uses an older target binary.
The outer record is published last; a failed build retains its log without a
success record. Existing public packager, workflows, package scripts, integration
manifests, other platforms and personal runtime configuration were not edited.

## Exact later inputs and commands

Only after whole-phase completion and explicit operator approval:

```sh
node scripts/build-boss-candidate.mjs "$UAR_SOURCE_COMMIT" "$UAR_CANDIDATE_OUTPUT"
```

Run from UAR. `UAR_SOURCE_COMMIT` must be the lead's actual immutable 40-hex
commit, including this helper and intended production sources.
`UAR_CANDIDATE_OUTPUT` must be a new absolute directory outside the checkout;
its parent must already exist. Available committed submodule objects are
required. Unrelated working changes remain untouched.

The exact nested build command is:

```sh
cargo build --release --locked --no-default-features --features server-full --bin uar-sidecar --target aarch64-apple-darwin
```

Boss's existing local build uses both
`THE_BOSS_LOCAL_UAR_SOURCE_DIR` (repository root) and
`THE_BOSS_LOCAL_UAR_CANDIDATE_RECORD` (absolute retained
`uar-sidecar-darwin-arm64.json` path):

```sh
pnpm build:mac:arm64:local
```

`pnpm build:mac:arm64` explicitly overrides `THE_BOSS_UAR_LOCAL=0`, so it remains
a distinct mandatory customer/public build gate requiring its own correct
public payload inputs. Approving one command does not approve the other or
standalone preflight commands. No customer installer or candidate payload was
produced during this source-only assignment.

## Required receipt shape

Both manifest and record carry equal `provenance` with schema 1,
`producer: "scripts/build-boss-candidate.mjs"`,
`sourceMode: "immutable-git-objects"`, exact `source` and `sourceTree`,
`target: "aarch64-apple-darwin"`, `features: ["server-full"]`, and
`lifecycleControl` equal to
`{"transport":"inherited-stdin","version":1,"responsePrefix":"LIFECYCLE:"}`.
`build` contains the exact Cargo command array, `isolatedTarget: true`,
`snapshot: "git-archive-with-submodules"`, and `log`/`executable` each with
`path` and `sha256` fields. Paths are exactly `uar-build.log` and `uar-sidecar`.
The same digests must occur in manifest file entries. Archive SHA-256 remains
in the outer record; local marker retains it and provenance.

## Remaining decisions and evidence

The lead must provide the final real UAR source SHA, then this writer updates
only the local source pin. No other platform can inherit that identity without
its own genuine candidate. The lead owns the UAR OpenSpec delta and phase ledger.

The uncomfortable case is a manually fabricated internally consistent local
receipt: these are first-party producer provenance and integrity records, not
cryptographically signed supply-chain attestations against a malicious local
artifact owner/compiler. The intended protocol claim requires the later real
inherited-pipe operation; metadata alone does not establish interoperability.

Source evidence: inspected existing Boss local loader, preparation, marker and
packaging consumers, release profile/package commands and UAR packager/control
source. Compass `search_symbols` failed with `store_graph_snapshot_failed`
(graph-index/2 unsupported by graph-index/1 reader); `.compass/verification.json`
and `.compass/config.toml` are absent here, so source search was the available
fallback. No graph refresh or gate was attempted.

Unrequested additions: none. Guards address observed stale-binary relabeling,
explicit immutable-source/protocol requirements, or the local archive trust
boundary. Compilation, execution, exact final source binding, retained artifacts,
runtime lifecycle compatibility and customer delivery remain unverified because
the gate is CLOSED and no final immutable source SHA has been supplied yet.

## Source identity completion — 2026-10-20

The lead subsequently supplied the actual committed UAR implementation identity
`ad557b0d00134c003bf0e87d248d1aef2e9ce4e5` and assigned the final local pin
replacement. `build/local-uar-source.json` now pins exactly that commit. The
earlier pending-source statements above describe the preceding handoff state
and are superseded by this entry. `UAR_SOURCE_COMMIT` for the proposed later
producer command is this exact commit; it is not an artifact acceptance receipt.

This completes the assigned source implementation and pin binding. The only
files changed in this completion step are `build/local-uar-source.json` and
this handoff. No new guard or unrequested change was added. Git, publication,
whole-phase inventory and gate authorization remain with the lead.

Verification remains **CLOSED**. This completion step only read those two
source files and wrote the pin and this entry. No source-identity command,
candidate producer, test, build, check, lint, format, typecheck, packaging,
policy validator or review command ran. Build provenance receipts, archive
digests, inherited lifecycle interoperability and customer delivery remain
unverified until the separately approved real production gates run. No other
platform or public release payload was relabeled.
