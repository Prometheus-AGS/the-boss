# Tasks

## 1. Freeze and merge source

- [x] 1.1 Record the fetched Cherry Studio `909214f68d`, mini `1066ad4008`, and released UAR `c4a656251b` revisions; verify each against its remote ref or annotated tag without moving the freeze later.
- [x] 1.2 Merge frozen upstream into the isolated Boss branch, resolve conflicts while preserving Boss branding, UAR lifecycle and approval behavior, packaged skills, and release workflow; verify the merge diff against the pre-merge Boss source and record any incompatibility.
- [x] 1.3 Confirm the mini gitlink and packaged skills use frozen mini main, with no changes to the dirty mini checkout; verify the gitlink, copied-skill inventory, and source manifest agree.

  The isolated submodule and Boss source manifest both name `1066ad4008`. Its 101 skill directories are available for packaging. Four of six changed skill files match the copied Boss resources byte for byte; `kbd-next-phase` and `kbd-reflect` retain the Boss `boss-mini` command adaptation. The primary mini checkout was not edited.

## 2. UAR 1.2.3 desktop payload

- [x] 2.1 Update the Boss UAR source and version pins to the annotated 1.2.3 commit; verify local and integration descriptors agree with the release tag.
- [ ] 2.2 Obtain the fresh exact instruction required by UAR's verification lock, publish native sidecar records for Windows x64, Mac ARM64, and Mac x64 from that commit, and verify each record's version, source, archive, and checksum.
- [ ] 2.3 Import the three immutable UAR records into the Boss integration manifest and select all three UAR-enabled release targets; verify the platform map has no missing or stale source.

## 3. Complete release source and payload

- [x] 3.1 Set Boss version 2.2.41 and update live release metadata while leaving historical 2.2.40 records unchanged; verify package, targets, and source descriptors agree.
- [ ] 3.2 Produce and commit the refreshed integration payload through the existing workflow; verify its immutable records and public images identify the frozen source revisions and three native UAR payloads.
- [ ] 3.3 At the completed source boundary, run the applicable local Boss integration, policy, lint, docs, and packaging gates once; inspect the results and repair observed failures before publication.

## 4. Native distribution and landing acceptance

- [ ] 4.1 Build and validate Windows x64, Mac ARM64, and Mac x64 installers from one frozen 2.2.41 Boss source; verify the bundled UAR sidecar identities, actual signing/notarization states, sizes, and SHA-256 values.
- [ ] 4.2 Publish all three installers through the serialized release workflow only after all platform builds succeed; verify the public release and immutable platform records match the complete manifest.
- [ ] 4.3 Confirm the landing receiver processed all three records and the live site presents resolving 2.2.41 links with sizes and SHA-256 values matching the release manifest; record installed-device acceptance separately if not exercised.
