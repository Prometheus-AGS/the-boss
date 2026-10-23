# Spec Delta

## Purpose

Customer release distribution binds one application source and its native dependency payloads to verifiable platform installers and public landing-page downloads.

## ADDED Requirements

### Requirement: Coherent three-platform release

The Boss SHALL publish Windows x64, Mac ARM64, and Mac x64 installers for one release version only when every installer names the same committed Boss source and its recorded mini and UAR source revisions. The release SHALL retain The Boss's custom behavior when it incorporates Cherry Studio upstream changes.

#### Scenario: Three platform records agree
- **WHEN** all three native installers have been built for a customer release
- **THEN** their immutable platform records identify the same Boss version, release profile, and committed source, and each bundled UAR sidecar identifies the pinned UAR release source

#### Scenario: A platform is missing or inconsistent
- **WHEN** any selected platform build fails or a platform record disagrees with the release manifest
- **THEN** the complete release is not made public as a successful three-platform release

### Requirement: Verifiable public downloads

The release SHALL publish the three installer URLs, byte sizes, SHA-256 values, and actual signing states, and the landing receiver SHALL advertise the same platform records.

#### Scenario: Public download acceptance
- **WHEN** the release and landing receiver report publication complete
- **THEN** each public installer URL resolves, its size and SHA-256 match the release manifest, and the live landing site presents the Windows x64, Mac ARM64, and Mac x64 downloads for that release

#### Scenario: Mac distribution
- **WHEN** either Mac installer is published
- **THEN** its record states whether Developer ID signing and notarization succeeded, and a required signing or notarization failure prevents publication
