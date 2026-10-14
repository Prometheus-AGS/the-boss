# Approved design

The Boss owns connection selection and process supervision. BossFang owns orchestration, UAR owns delegated execution. Connection intent is durable; temporary failure does not clear it. Ordinary chat uses a persisted app-private AgentWorkspace. Existing executions retain their original bindings.

Surreal Memory remains an external MCP service. The host selects its existing inventory connection, preferring a detected full installation when the selection is still the application default. Credentials remain in main-process configuration. Shared-memory tools accept content/query/id and visibility only; the host derives user/workspace and validates agent/team authority. Native BossFang invokes an authenticated loopback callback with a daemon-validated agent ID. UAR calls use their admitted invocation identity. Raw memory IDs are checked against the bound scope before returning content. No fallback to private storage is permitted.

Private key-value memory remains unchanged. Readiness independently describes dashboard, UAR, live models and shared memory. Generated preferences come from source definitions; every locale is updated.

Complete all wiring before one actual Mac ARM64 packaging and installed operation boundary. Repair observed failures only. Demonstrate streaming inference, cross-runtime memory, restart persistence, isolation, reconnect/cancellation and unavailable-service/model recovery. Publish a new immutable Mac ARM64 and Windows x64 release. Existing broader phase/cadence history stays closed.

## Approved target-selection continuation

One UAR resolver serves discovery, mounted chat and delegated admission. Agent targets use `uar:agent:<encoded-catalog-id>`; provider/model IDs retain their existing identity. Versioned metadata carries kind, definition identity, effective model, capability/readiness and verification time. Administrative configuration retains unverified or unavailable entries; discovery never runs paid inference automatically. Configured is not synonymous with credentialed or verified.

Selecting a registered agent resolves its authorized workspace binding, immutable version and digest. Its configured model is inherited by default. Advanced override reuses explicit `agent_id` and `model` semantics and is admitted into the effective binding receipt, without changing the immutable definition. Conflicting selections are errors. Provider/model targets select the default agent. Preserve current history, stream/nonstream, failure, cancellation and uncertain-effect contracts; do not mount the incomplete legacy OpenAI adapter.

BossFang persists explicit target configuration and dispatches dashboard chat through existing UAR full-run admission/control. Legacy inference-only configurations keep their semantics until explicit save conversion. Active conversations retain original binding/instance/workspace. Connection changes which would revoke active grants are deferred visibly rather than stopping the process beneath them.

The UI is an incumbent-style operational refinement using Impeccable guidance: searchable Installed agents and Models through the default agent groups, visible unavailable choices, optional Advanced model override, and instance/agent/model/workspace/memory summary. The Boss resolves existing protected provider credentials against BossFang's selected instance independently of Work. No OAuth-to-API-key reinterpretation or silent provider/billing change.

Ownership: UAR worker owns runtime catalog/resolver/admission; BossFang worker owns native chat dispatch and dashboard/locales; desktop worker owns The Boss source/settings/provider and memory lifecycle. Lead owns OpenSpec, source reconciliation, serialized native builds, versioning, installed operation and publication. All three implementation areas finish before the delivery operation. Preserve other sessions' dirty UAR source separately from exact release inputs.

## Observed endpoint relocation repair (2026-10-12)

The installed port-change operation exposed a stale reusable deployment receipt:
UAR advertised port 1910, but delegated-host admission compared the deployment’s
stored port 1907 with current placement and refused it. New execution admission
must resolve current placement from the same trusted instance authority while
retaining definition/binding identity. Existing run receipts, epochs and effect
authority remain immutable and strictly checked. No caller endpoint override,
automatic effect replay, or blanket conflict suppression is authorized.
