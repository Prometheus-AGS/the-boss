# Design

The Boss main process owns authoring and installation. Renderer forms submit typed intent over the existing Prometheus IPC boundary. A versioned authoring record lives in application-owned durable state; it contains no credentials. Editing creates a new immutable package version and leaves earlier package and run references intact.

The package compiler reuses the existing `document` canonical digest, `starterPackage` agent shape and UAR `PackageManifest`/`TeamDefinition` draft.2 contracts. A guided preset supplies bounded coordinator/member responsibilities. The operator may name the team, edit shared and member instructions, choose per-role advertised models, and select discovered skills with explicit per-role scope. The portable package expresses aliases and requested resources; model IDs, credential refs, workspace paths, skill installations and grants remain in a private deployment binding. Tool selection cannot broaden host approval policy.

Deployment uses the current UAR capabilities, package preflight/install, and binding preflight/CAS/install endpoints. Preflight errors are surfaced intact. Work's existing definition and binding selector discovers the result through the normal snapshot. The UI provides a direct route from team administration to Work. The real packaged operation script drives the application entrypoint and records exact installed package/run digests; it is not a mock-only acceptance substitute.

Security boundary: authoring text and selected skills are untrusted data; only the existing trusted host and UAR binding/approval boundary may activate tools or credentials. Editing does not change an active run's pinned definition or silently rebind an installed workspace.

The host-workspace extension follows the pinned draft.2 common extension contract: `{required: true, value: {version: 1, ...}}`. Portable member tools/servers and private binding workspace/tools/servers live inside `value`; main-process host admission validates the strict envelope and its payload. This repairs the canonical shape mismatch observed as HTTP 422 at the predecessor's real package boundary. Stored immutable revisions remain unchanged; an author must explicitly save a new revision to compile corrected bytes. Promotion also requires the coordinated native host reader repair and the stable predecessor coding producer repair.

Delivery boundary: complete production UI, locale strings, IPC, persistence and packaged operation before the lead's single Mac ARM64 build and real feature operation. No intermediate suites or partial verification builds.
