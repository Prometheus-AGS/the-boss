# Issue #39 completed repair boundary

The shell-file repair is implemented. Final local build and packaged registration/removal passed on Apple Silicon. No unit suites or per-edit checks ran.

Source repair on this main-based PR ends at 5c76f3928b; the actual local package was built from team-authoring commit ee32ed2166 containing the cherry-picked repair and unfinished C15 work. This is repair evidence, not team inference acceptance or a published release.

## Observed operation

- Ten concurrent real-filesystem writers preserved synthetic user content, modes and symlinks, converged duplicate blocks and refused damaged blocks without edits. Original private backups remained intact. These helper files did not change in subsequent corrections.
- The packaged app launched in two distinct disposable profiles sharing a home. Both registered the stable command directory. The second profile left unchanged RC inode and modification time intact.
- A fresh Bash session resolved Compass from the stable command directory. Packaged explicit removal restored the synthetic user content exactly.

## Corrections and limits

The first operation launcher used the wrong executable filename; its failure is preserved separately. The first correct packaged launch exposed registry auto-creation of a 0755 backup directory; the safety guard refused all shell edits. The registry now leaves private backup creation to its owner. A build preflight was also retried with the required pinned UAR source environment.

One independent completed-boundary review found unchecked registration directory identity. It is corrected, with its original finding and targeted disposition preserved. Harness-native isolation was used; producer/judge identities are not exposed, so cross-model distinction is unverified. The separate sycophancy screen was not executed.

Mac package validation passed, including mounted-DMG signature validation. Developer ID signed; notarization skipped by the existing configuration. Native Windows operation and public installer deployment remain pending. Noncooperating editors can still race after the final conflict check; portable file replacement does not provide compare-and-swap. Historical lost user content requires the operator's own backups. No real shell file contents are included in these receipts.

C15 inference, its cadence delivery and the parent phase remain open. No main-phase task is credited by this repair.
