# Packaged lifecycle-detail operation

Run only after the coherent API, UI, translations and package are frozen and built. The lead owns that completion boundary.

```text
node scripts/operate-uar-lifecycle-detail.mjs --boss <frozen-boss-checkout> --launcher <maintained-boss-launch.mjs> --output <receipt-directory>
```

The launcher must export `launchBoss` and support the existing isolated packaged-scenario contract. Mac is the supported operation host; native Windows installed acceptance is a separate requirement.

Required configured gateway environment:

- `BOSS_C142_GATEWAY_CREDENTIAL_ENV`: the name of an existing secret environment variable.
- `BOSS_C142_GATEWAY_ENDPOINT`, `BOSS_C142_GATEWAY_ALIAS`, `BOSS_C142_GATEWAY_PROVIDER_ID`, `BOSS_C142_GATEWAY_MODEL_ID`.
- Optional `BOSS_C142_GATEWAY_PROVIDER_BASE_URL`, using the existing configured-source setup helper.

The real gateway/model must be operational and have its existing provider pricing identity available to the packaged UAR. The packaged `app.asar`, UAR sidecar and `.uar-local-payload.json` must agree with `build/local-uar-source.json`. Experimental team/workflow stage environment variables must be absent. The existing cooperation host also requires its actual SurrealDB 3.3.0 executable.

## Real data procedure

1. Launch the packaged application using its isolated profile. Register a disposable workspace and configure its already selected gateway through existing application IPC.
2. Create an ordinary managed starter team without executing a task. Capture its authenticated owner and globally selected managed runtime.
3. Start the packaged native external UAR and real disposable SurrealDB through the existing cooperation host with `selectInstance:false` and `experimentalStage:false`. Use the same authenticated owner/workspace.
4. Configure a real provider in that disposable runtime. Install a real agent and the existing closed classify/draft workflow document through package preflight/install. Register a private deployment binding through native preflight/install.
5. Create two durable agent instances. Disable the observer instance before subscribing to the source. Submit exactly one source turn. Wait for actual attempt/root-run history and an actual observer dead-letter admission failure with attempts/error/timestamps.
6. Read native bindings, instances, observer inbox and workflow metadata. Compare them to the production `prometheus.uar.lifecycle.snapshot` response for the external instance.
7. Open `/settings/uar?panel=lifecycle&adminInstanceId=...&adminWorkspaceId=...`. Expand source activity, inspect actual command/event rows, public binding posture, observer failure/progress and compiled workflow step metadata, then operate refresh. Confirm Work's global selection and managed task inventory are preserved.
8. Stop only the owned external runtime/database and write the receipt. The isolated application profile and output workspace provide the artifact boundary; no cleanup targets the user's normal application state.

No runtime response or workflow run is fabricated. The workflow authoring contract follows the pinned native source `src/uar/compiler/collaboration/workflow_execution/compiler.rs` and `docs/agents/collaboration/workflow-execution/1.0.0/example/workflow.json` at `36f096dbda0f17c6e15c71b284ce89cb04f04502`. Metadata install may report unsupported activation while storing the definition; native metadata compilation is distinct from normal-profile launch availability.

## Scope and evidence

The operation creates one managed team, one external package/binding/provider, two external durable instances, one subscription and one source turn. It submits no managed task execution, external team execution or workflow start. The existing host disables memory, skill evolution, file tools, web fetch and terminal execution. Credentials stay in the existing protected application configuration/native provider path and are never saved in receipts.

Receipts record source revision/diff and exact package, sidecar, launcher and scenario hashes; requested/effective inspection identity; per-source state/scope/read time; public native command/event identifiers; a bounded actual dead-letter record; sequence progress; public binding receipt identity; and the real workflow definition/step metadata. Raw deployment documents, provider settings, credential references and private requested/effective binding blobs are excluded.

The snapshot is non-atomic. Sequence distance is not elapsed lag or an exact count of filtered deliveries. Normal-profile workflow launch is unavailable, so this operation cannot certify actual workflow run/task/attempt associations. Missing real contracts result in a blocked receipt. This increment does not certify all C14.1 requirements or native Windows installation.
