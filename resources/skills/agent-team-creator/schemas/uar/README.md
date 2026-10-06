# UAR collaboration schema snapshots

This directory retains the draft.1 provider schema family and the separate
`0.1.0-draft.2/` family. They are distinct snapshots; retaining an older reader or
migration path does not relabel its documents as the newer profile.

The draft.2 source repository, exact provider commit, source paths and hashes are
recorded in [the consumer source receipt](0.1.0-draft.2/consumer-source-receipt.json).
Use that receipt for the selected identity rather than a separately maintained
commit in this README. A consumer receipt is provenance, not a provider schema or
proof of live runtime conformance.

Provider schemas describe canonical compiled documents. Adjacent authoring and
workspace schemas describe the skill's input carriers. Preserve provider-owned
schema bytes and attribution; updates require a deliberate new snapshot and
compatible consumer changes. Full and mini source mirrors must retain the same
selected provider identity, and their generated payloads are reconciled at the
final production boundary. Schema validity alone does not certify registration,
communication or execution by a real UAR host.
