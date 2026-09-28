## 1. Runtime instance contracts

- [x] 1.1 Extend the revisioned UAR integration schema with stable managed/external instance definitions, endpoint roles, profile/capability/workspace expectations, credential references, and selected default; verify at the final C04 integration gate that stale revisions and invalid defaults are refused.
- [x] 1.2 Add protected per-instance credential storage and typed inventory IPC mutations that expose presence only; verify at the final C04 integration gate that renderer snapshots and logs contain no credential value.

## 2. Supervision and placement

- [x] 2.1 Extend the single UAR supervisor to resolve managed and external handles, verify authenticated identity/profile/version/capabilities/endpoints before work, and refuse lifecycle operations for external instances; verify at the final C04 integration gate that closing an external connection does not stop it.
- [x] 2.2 Bind new sessions to the selected default and persist a versioned opaque instance/native-session token; reattach only to that exact instance, retain legacy managed bindings, and expose explicit unsupported migration; verify at the final C04 integration gate with two instances, restart, default change, unavailable binding, and migration scenarios.

## 3. Administration and diagnostics

- [x] 3.1 Extend the existing `/settings/uar` workspace and settings search with inventory editing, default selection, endpoint roles, ownership, credentials, compatibility, effective binding, and recovery guidance across every locale; verify the completed responsive UI once at the final C04 integration gate.
- [x] 3.2 Extend integration snapshots and diagnostics with configured/reachable/authenticated/compatible/operational states and bound-session counts; verify wrong identity, version/profile mismatch, missing capability, and occupied-port behavior at the final C04 integration gate.

## 4. Boundary acceptance

- [x] 4.1 Run the single C04 integration gate after all production implementation is complete, covering C04.1-C04.3, then record exact Boss/UAR revisions and observed outcomes without adding partial or per-edit verification loops.
