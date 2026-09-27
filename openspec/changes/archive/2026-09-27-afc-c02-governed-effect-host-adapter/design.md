# Design: governed-effect host adapter

## Host admission binding

`PreparedInvocation` accepts UAR's additive principal, governance, resource, payload, grant, lease, budget, and authority revisions. The adapter recomputes the payload digest and UAR authority digest before it creates an admission record. The returned preparation and receipt echo the exact `authorityRevision`; claim and managed MCP dispatch reject a missing or changed revision.

The admission record stores the selected provider, provider issuer, provider challenge identity, and provider binding. Those facts never replace UAR's effect lifecycle state. `/uar/admission/v1/claim` asks the provider to revalidate immediately before UAR persists claim intent. Managed MCP validates the claim receipt again before forwarding `tools/call`.

## Authority providers

The provider contract is transport-neutral:

- `evaluate` decides whether the exact host-bound action is denied, challenged, or permitted;
- `decide` records an authenticated human decision for the provider challenge;
- `revalidate` verifies the same binding after any wait and immediately before claim.

The local provider derives identity from the active The Boss session principal, workspace from the resolved host workspace, and policy from the current host disposition. It preserves current `auto`, `ask`, and `deny` behavior while binding the decision to an exact payload and host epoch.

The Flint provider maps only verified host facts into `afc.governed-effect/1`. UAR-supplied `principalId` is checked against the agent The Boss installed in the active bridge but is never treated as the verified authority identity. Gate resolves and binds its own active policy. The Boss sends an empty grant list when no trusted delegated grant exists and forwards UAR-owned lease and budget facts only when their complete IDs, revisions, active states, reservations, and expirations are bound into the authority envelope. Missing required facts reject the governed request instead of synthesizing proof.

## Protected configuration

The selected provider and credential-free HTTPS endpoint live in the persisted UAR integration configuration. The bearer credential lives in the existing OS-protected main-process secret store. Renderer snapshots expose provider selection, endpoint, and credential-presence only. Requests, receipts, lifecycle snapshots, and logs never include the credential.

## Failure semantics

Non-2xx provider responses, malformed decisions, changed request bindings, changed payload or authority revisions, unavailable selected providers, and unsupported governed requests are denials before claim. Once UAR persists claim intent, its existing succeeded, failed, interrupted, and outcome-unknown lifecycle remains authoritative.
