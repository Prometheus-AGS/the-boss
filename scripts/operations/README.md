# Integrated admission v2 customer operations

These adapters operate an actual 2.2.31 macOS arm64 packaged Boss through the
maintained Cadence launcher. Preparation does not establish a passing operation.
Run only after the parent freezes all production source, builds the selected
package and fills the exact source and package identities below.

```text
node <G>/scripts/operations/operate-integrated-admission-v2.mjs \
  --boss <G> --launcher <absolute maintained boss-launch.mjs> \
  --output <absolute new scoped operation directory> \
  --config <absolute candidate operation configuration.json> \
  --mode bossfang
```

The same command accepts `--mode native-read` or `--mode older-instance`.
Each invocation creates a new owned workspace and packaged profile. It records
only its selected scope; a passing BossFang receipt does not pass native reads,
representation, direct subscription inference or Windows acceptance.

The versioned configuration contains references, never credential values:

```json
{
  "schemaVersion": 1,
  "version": "2.2.31",
  "candidateId": "exact frozen candidate id",
  "candidate": {
    "boss": "full frozen desktop/driver source revision",
    "bossfang": "full selected manifest revision",
    "uar": "full selected local UAR revision",
    "appAsarSha256": "actual packaged ASAR digest",
    "uarSha256": "actual signed bundled sidecar digest",
    "bossfangSha256": "actual signed bundled BossFang digest"
  },
  "gateway": {
    "credentialEnv": "LITER_LLM_MASTER_KEY",
    "endpoint": "http://localhost:4000",
    "alias": "gpt-6.1-sol",
    "providerId": "openai",
    "modelId": "gpt-6.1-sol"
  },
  "modelContextPath": "absolute retained c14-gpt-6.1-sol-context-declaration-20261008.json",
  "priorReceiptPath": "absolute retained composite-operation-evidence.json"
}
```

The gateway uses the existing proxy credential reference. The application
appends `/v1/models` to the configured liter root; supplying `/v1` here would
produce the wrong catalog URL. The adapter maps the explicit gateway fields to
the existing `BOSS_C142_GATEWAY_*` environment contract for the duration of its
invocation, then restores those references. It does not read `OPENAI_API_KEY`.
The observed model context declaration is required for `bossfang` and
`native-read`; only `bossfang` requires the retained composite receipt. Old
passing checks are carried with their original source and package identities.

`bossfang` reuses the real compiled dashboard's ordinary workflow authoring,
approval, denial and pending cancellation. It adds a read-only query of the
owned profile's sanitized admission lifecycle, requiring `host_mcp` and exact
admission/invocation/root-run/executing-run identities for each resulting effect.

`native-read` uses typed settings to enable native file tools only in its
disposable workspace, applies the existing observed model context, and restarts
only its managed native process before creating the Work session. It submits a
real `file_read` through the existing gateway route, checks the exact pending
approval, refuses a foreign approval ID, detaches/attaches the renderer stream,
approves the originating ID and refuses replay. Success requires the actual
tool result, committed gateway model identity, one succeeded `runtime_native`
admission and one execution across reconnect. It then cancels a real semantic
text stream, requires persisted `paused`, and starts a fresh same-session reply.
Saved native settings are restored for the next restart. Fault injection and
native process restart during an active effect remain separate acceptance.

`older-instance` requires `oldInstance` in addition to the frozen candidate:

```json
{
  "source": "308aea46ff26e7f61340281bb51f67ebe5351569",
  "binaryPath": "absolute separately retained old uar-sidecar",
  "binarySha256": "ef43279c1dd81c2a0bcf1136b86caad4beeaab9b1ce8d81245cd2ba9659acf58",
  "payloadManifestPath": "absolute sibling payload-manifest.json",
  "runtimeCredentialEnv": "BOSS_ADMISSION_V1_RUNTIME_TOKEN",
  "adminCredentialEnv": "BOSS_ADMISSION_V1_ADMIN_KEY",
  "instance": {
    "id": "uar-admission-v1-20261010",
    "name": "Owned admission v1 compatibility operation",
    "enabled": true,
    "ownership": "external",
    "expectedRuntimeId": "uar-admission-v1-20261010",
    "profile": "uar.service-instance/1",
    "minimumVersion": "",
    "workspaceLocation": "local",
    "workspaceRoots": ["absolute owned old-native workspace"],
    "requiredCapabilities": [],
    "runtimeCredentialRef": "uar-instance://uar-admission-v1-20261010",
    "adminCredentialRef": "uar-instance://uar-admission-v1-20261010/admin",
    "endpoints": {
      "runtime": "http://127.0.0.1:actual-ready-port",
      "administration": "http://127.0.0.1:actual-ready-port",
      "models": "http://127.0.0.1:actual-ready-port",
      "console": null
    }
  }
}
```

The parent owns the separately retained old process and actual launch receipt,
including its source, binary digest, own storage/configuration, fresh stdin
token, protected settings key and actual READY endpoint. This adapter does not
start or stop that process. The actual authenticated capabilities must declare
the configured external identity and omit `tool_admission_v2`; a mocked response
cannot supply this prerequisite. Only loopback endpoints are accepted for this
owned operation. The adapter preserves local discovery/configuration, requires
an actionable version/update diagnostic, submits a typed provider-default
mutation and ordinary Work placement/turn request that must refuse specifically
for admission v2 incompatibility, and compares read-only provider catalog
digests. It restores the prior desktop selection and deletes only its newly
registered old instance. Strict old-runtime filesystem containment and its
startup `/data/ingest` behavior belong to the parent's launch boundary.

Operation files bind the actual ASAR, signed payloads, source manifests, launcher,
driver dependencies and configuration bytes. The sanitized lifecycle query uses
Node's built-in SQLite in read-only mode, so the runner must provide `node:sqlite`.
No provider stream replacement, native fault controls, forged authority,
historical approval reuse, external issue creation or live Cadence state mutation
is performed. A timeout, unexpected tool, incorrect execution kind, changed
source/package, unavailable prerequisite or failed cleanup cannot yield a
successful selected-scope receipt.
