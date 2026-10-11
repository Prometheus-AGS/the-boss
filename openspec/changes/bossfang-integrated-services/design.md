# Approved design

The Boss owns connection selection and process supervision. BossFang owns orchestration, UAR owns delegated execution. Connection intent is durable; temporary failure does not clear it. Ordinary chat uses a persisted app-private AgentWorkspace. Existing executions retain their original bindings.

Surreal Memory remains an external MCP service. The host selects its existing inventory connection, preferring a detected full installation when the selection is still the application default. Credentials remain in main-process configuration. Shared-memory tools accept content/query/id and visibility only; the host derives user/workspace and validates agent/team authority. Native BossFang invokes an authenticated loopback callback with a daemon-validated agent ID. UAR calls use their admitted invocation identity. Raw memory IDs are checked against the bound scope before returning content. No fallback to private storage is permitted.

Private key-value memory remains unchanged. Readiness independently describes dashboard, UAR, live models and shared memory. Generated preferences come from source definitions; every locale is updated.

Complete all wiring before one actual Mac ARM64 packaging and installed operation boundary. Repair observed failures only. Demonstrate streaming inference, cross-runtime memory, restart persistence, isolation, reconnect/cancellation and unavailable-service/model recovery. Publish a new immutable Mac ARM64 and Windows x64 release. Existing broader phase/cadence history stays closed.
