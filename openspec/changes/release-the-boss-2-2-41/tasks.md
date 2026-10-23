# Tasks

## 1. Freeze and merge source

- [x] 1.1 Record the fetched Cherry Studio `909214f68d`, mini `1066ad4008`, and released UAR `c4a656251b` revisions; verify each against its remote ref or annotated tag without moving the freeze later.
- [x] 1.2 Merge frozen upstream into the isolated Boss branch, resolve conflicts while preserving Boss branding, UAR lifecycle and approval behavior, packaged skills, and release workflow; verify the merge diff against the pre-merge Boss source and record any incompatibility.
- [x] 1.3 Confirm the mini gitlink and packaged skills use frozen mini main, with no changes to the dirty mini checkout; verify the gitlink, copied-skill inventory, and source manifest agree.

  The isolated submodule and Boss source manifest both name `1066ad4008`. Its 101 skill directories are available for packaging. Four of six changed skill files match the copied Boss resources byte for byte; `kbd-next-phase` and `kbd-reflect` retain the Boss `boss-mini` command adaptation. The primary mini checkout was not edited.

## 2. UAR 1.2.3 desktop payload

- [x] 2.1 Update the Boss UAR source and version pins to the annotated 1.2.3 commit; verify local and integration descriptors agree with the release tag.
- [x] 2.2 Obtain the fresh exact instruction required by UAR's verification lock, publish native sidecar records for Windows x64, Mac ARM64, and Mac x64 from that commit, and verify each record's version, source, archive, and checksum.
- [x] 2.3 Import the three immutable UAR records into the Boss integration manifest and select all three UAR-enabled release targets; verify the platform map has no missing or stale source.

## 3. Complete release source and payload

- [x] 3.1 Set Boss version 2.2.41 and update live release metadata while leaving historical 2.2.40 records unchanged; verify package, targets, and source descriptors agree.
- [x] 3.2 Produce and commit the refreshed integration payload through the existing workflow; verify its immutable records and public images identify the frozen source revisions and three native UAR payloads.
- [x] 3.3 At the completed source boundary, run the applicable local Boss integration, policy, lint, docs, and packaging gates once; inspect the results and repair observed failures before publication.

  `pnpm build:check` passed format, docs, skills, migration, lint, type, and i18n checks before the broad suite reported 8 failed assertions and two failed imports across five files (39,201 tests passed). The observed failures were repaired; rerunning only those five failed files passed 75 tests. `pnpm typecheck:node`, `pnpm lint`, and `pnpm format:check` passed after the corrections. The broad suite was not repeated; native installer/package validation remains in 4.1.

## 4. Native distribution and landing acceptance

- [x] 4.1 Build and validate Windows x64, Mac ARM64, and Mac x64 installers from one frozen 2.2.41 Boss source; verify the bundled UAR sidecar identities, actual signing/notarization states, sizes, and SHA-256 values.
- [x] 4.2 Publish all three installers through the serialized release workflow only after all platform builds succeed; verify the public release and immutable platform records match the complete manifest.
- [x] 4.3 Confirm the landing receiver processed all three records and the live site presents resolving 2.2.41 links with sizes and SHA-256 values matching the release manifest; record installed-device acceptance separately if not exercised.

  Release workflow [39947012761](https://github.com/Prometheus-AGS/the-boss/actions/runs/39947012761) completed at source `6d0fc1d0ac921bcb5483ec2dae1d015abdcda219`. Windows x64 and Mac ARM64 passed on the first attempt. Mac x64 reached Apple stapling, failed on a CloudKit connection loss (`NSURLErrorDomain -1005`), then passed a failed-job rerun without changing source. Each native job validated the packaged UAR-enabled installer. The [public v2.2.41 release](https://github.com/Prometheus-AGS/the-boss/releases/tag/v2.2.41) contains three installers and three immutable platform records. The installer records and GitHub asset metadata agree:

  | Installer | Bytes | SHA-256 | Signing |
  | --- | ---: | --- | --- |
  | Mac ARM64 | 754,199,508 | `7d4b90c84f5bd51f3891001c921f77dd4c49107ae17adb96bf618fa275308b5b` | Developer ID (notarized) |
  | Mac x64 | 790,830,970 | `9112a8ca03bb52d78abc30eaf3c37a18d14caf83c395ac7ca302b8820b230556` | Developer ID (notarized) |
  | Windows x64 | 642,056,505 | `c5c48b5faf1105f1fdb94a6a88efe1bb674f14942dd242a49d550d0b5a27668f` | unsigned |

  Landing receiver runs [39958334221](https://github.com/Know-Me-Tools/boss-landing-spot/actions/runs/39958334221), [39958336224](https://github.com/Know-Me-Tools/boss-landing-spot/actions/runs/39958336224), and [39958773254](https://github.com/Know-Me-Tools/boss-landing-spot/actions/runs/39958773254) passed. The third was dispatched after GitHub concurrency canceled one pending event. The receiver streamed each public installer and checked its size and SHA-256 before committing `src/lib/release.json`. The live [download page](https://the-boss.know-me.tools/#download) shows all three 2.2.41 links with matching SHA-256 and signing labels. Windows ARM64 remains explicitly marked as an earlier 2.2.30 release. The workflow mounted the Mac DMGs and silently installed the Windows setup for package validation; manual acceptance on separate customer devices was not exercised.
