# Defer active publication targets

An explicit operator decision may narrow the target set before a delivery is finalized. Use the existing `configure` command with this request:

```json
{
  "profile": {
    "publication": {
      "platforms": ["darwin-arm64", "win32-x64"],
      "procedure": {
        "platforms": "darwin-arm64,win32-x64",
        "requiredInputs": ["release_version", "release_profile", "platforms", "uar_darwin_arm64_record_url", "uar_win32_x64_record_url"],
        "completion": "Both selected installers, source-bound metadata and matching live website links are published. Installed acceptance remains separate."
      }
    }
  },
  "activePublication": {
    "authorityRef": "/absolute/operator-scope-decision.json",
    "reason": "Operator deferred the other platform targets"
  }
}
```

The referenced JSON evidence is retained by path and checksum. The command records before/after policy, deferred targets and the prior candidate. It preserves the continuous clock, successful-delivery count, checkpoints, immutable candidate manifests, installed acceptance and already-created publication debt. The global profile receives the same selected targets for subsequent deliveries.

Only a nonempty subset of the active targets is allowed. Procedure changes are limited to target names, retained input names and completion description. Checkpoint recipes, publication frequency, executable, repository, budgets and ownership cannot change through this amendment. Reconcile any running or uncertain checkpoint/publication first.

Afterward finish production repair, then run `ready` against the corrected inputs to freeze the new candidate. An old candidate cannot finalize under a different publication policy. Older obligations retain their original required effects; this command cannot waive historical debt or certify any deferred platform.
