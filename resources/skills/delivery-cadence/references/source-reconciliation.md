# Reconcile a repaired work-ahead base

The predecessor candidate and future checkout are different source sets. Never put
predecessor paths in `baseSourceRefs` to bypass the future checkout's identity.

`work-ahead reconcile` takes `id`, `candidateId`, `authorityRefs`, an absolute
`evidenceRef` JSON file, and exact current `baseSourceRefs` for every admitted
future checkout. Cadence independently captures their revisions and fingerprints.
The evidence file is outside the mutable source inputs and has this form:

```json
{
  "schemaVersion": 1,
  "workAheadId": "recorded-work-id",
  "repairedCandidateId": "current-predecessor-candidate-id",
  "contentManifestDigest": "recorded-candidate-digest",
  "predecessorSourceRefs": [],
  "futureSourceRefs": [],
  "mappings": [
    {
      "repository": "/absolute/future-checkout",
      "predecessorRepository": "/absolute/predecessor-checkout",
      "strategy": "ancestor",
      "repairedRevision": "exact-repaired-commit",
      "futureRevision": "exact-future-commit"
    }
  ]
}
```

Populate the source arrays from actual source captures, never from inferred commit
labels. Every future checkout needs one mapping. The stored evidence includes the
file's SHA-256; promotion checks it and the current future inputs again.

Supported proof strategies:

- `ancestor`: Cadence verifies the repaired Git commit is an ancestor of the future
  checkout's current commit. This bounded implementation requires a clean
  predecessor without nested submodule inputs. A dirty snapshot is not proved by
  commit ancestry; commit the repair and refreeze, or use exact snapshot proof.
- `exact-snapshot`: future revision and complete source fingerprint equal the
  repaired predecessor. This can establish preserved dirty snapshot equivalence.
- `independent`: only a scope already admitted with `dependencyClass: independent`
  may use this disposition. Supply a nonempty `reason`; it cannot waive an admitted
  predecessor dependency. Both immutable source sets remain bound in the evidence.

Nested-source reconciliation beyond exact snapshot equality remains unsupported
by the ancestry proof. Record that limitation and obtain an explicit follow-up;
never declare it proven from an arbitrary evidence string. If source inputs change
after reconciliation, collect new evidence before promotion. This operation does
not merge, rebase, reset or edit any checkout.
