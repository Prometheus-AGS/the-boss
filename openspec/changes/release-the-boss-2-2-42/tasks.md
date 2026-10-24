# Tasks

## 1. Freeze and integrate source

- [x] 1.1 Record the fetched Cherry, UAR, and mini revisions and verify them against remote refs and the UAR tag.
- [x] 1.2 Merge frozen Cherry upstream in the isolated Boss branch, resolve conflicts, and compare Boss-specific behavior with the 2.2.41 source.
- [ ] 1.3 Confirm the current mini gitlink, copied skills, and source pin match the frozen mini remote; leave its dirty knowledge checkout untouched.

## 2. UAR 1.3.0 desktop payload

- [x] 2.1 Update Boss UAR source and version descriptors to `774469746fee4de99be41dc1cd231857067e4487` and 1.3.0; verify all selected platform pins agree.
- [ ] 2.2 Build and package Windows x64, Mac ARM64, and Mac x64 UAR sidecars from the frozen source; verify each binary and immutable record's source, version, platform, and SHA-256.
- [ ] 2.3 Import the three sidecar records into the integration payload and verify the UAR-enabled platform map has no stale source.

## 3. Complete the Boss release source

- [x] 3.1 Set the next Boss version to 2.2.42, update live release defaults and notes, and verify package, target, and release metadata agree while historical records stay intact.
- [ ] 3.2 Produce and commit a refreshed integration payload with the frozen UAR and mini identities; verify native records and service image provenance.
- [ ] 3.3 At the completed source boundary, run the applicable Boss integration, policy, lint, docs, and packaging checks once; resolve observed failures and record exact results.

## 4. Native distribution and public acceptance

- [ ] 4.1 Build and validate the Windows x64, Mac ARM64, and Mac x64 installers from one frozen Boss commit; verify packaged UAR identities, Mac signing/notarization, Windows signing status, sizes, and SHA-256.
- [ ] 4.2 Publish the complete three-platform release through the serialized workflow and verify its public assets and immutable platform records match the manifest.
- [ ] 4.3 Confirm the landing receiver processed all three records and each live download URL, size, and SHA-256 matches the release manifest; state any installed-device acceptance that remains pending.
