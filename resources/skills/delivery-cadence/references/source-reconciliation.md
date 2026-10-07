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

- `ancestor-with-nested-sources`: the same exact parent revision mapping and Git
  ancestry check, with clean committed parent and recursive nested fingerprints
  reconstructed against each commit's gitlinks. Each observed initialized nested
  repository must exist with the captured commit available. Every captured nested
  revision must equal its enclosing committed gitlink. Dirty snapshots, missing or
  duplicate entries, moved/added/deleted topology and unsupported initialization
  identities are refused. Uninitialized modules retain their committed pin and
  `workingTree: "unobserved"`; this does not observe their bytes or descend into
  unavailable nested trees. No admitted source roots are added.

For this strategy add `nestedMappings` to the parent mapping, one entry for every
recursive nested source path relative to that parent, including uninitialized
entries. Order is immaterial. Bind each entry to the exact captured objects
(including absolute repository identity, name, revision, fingerprint when observed,
initialization and recursive submodule refs):

```json
{
  "repository": "/absolute/future-checkout",
  "predecessorRepository": "/absolute/predecessor-checkout",
  "strategy": "ancestor-with-nested-sources",
  "repairedRevision": "exact-repaired-parent-commit",
  "futureRevision": "exact-future-parent-commit",
  "nestedMappings": [
    {
      "path": "resources/mini",
      "predecessorSourceRef": {},
      "futureSourceRef": {},
      "strategy": "authorized-replacement",
      "authorityRef": {
        "path": "/absolute/external/nested-replacement.json",
        "sha256": "sha256-of-the-authority-file-bytes"
      }
    }
  ]
}
```

Replace the empty source objects with complete captured nested entries. Use
`strategy: "unchanged"` without an authority reference only when the same relative
identity, revision, content fingerprint and initialization agree. The mapped
absolute identities remain bound to their respective parent checkouts; identical
content does not make the two checkout paths interchangeable. A changed pin,
content or initialization requires `authorized-replacement`, with a checksummed
JSON authority document:

```json
{
  "schemaVersion": 1,
  "kind": "nested-source-replacement",
  "workAheadId": "recorded-work-id",
  "repairedCandidateId": "current-predecessor-candidate-id",
  "contentManifestDigest": "recorded-candidate-digest",
  "predecessorSourceRef": {},
  "futureSourceRef": {},
  "reason": "Operator-authorized reason for this exact replacement"
}
```

The authority document binds the exact old/new captured objects, not labels or
inferred equivalence. Its bytes must match the supplied SHA-256. Record actual
operator authority; authoring this document does not grant permission. Keep proof
documents outside mutable source inputs. Reconciliation retains authority hashes
in `repairedBaseRef.nestedAuthorityRefs`, checks them again after source proof, and
promotion rechecks those hashes alongside the existing reconciliation-evidence
hash and independent exact future recapture.

If source inputs or authority documents change after reconciliation, collect new
evidence before promotion. This operation does not merge, rebase, reset or edit
any checkout, alter firstWorkAt/history/candidate receipts, reclassify dependency,
change KBD authority or reconcile publication debt.
