# Design

## Context

Source repair 39858313fe isolates ENOENT inventory reads while keeping persistent workspace records and strict execution identity. Administrative reconciliation 1e78af9981 preserves 61/61 code tasks, 20/20 changes and 43/61 terminal qualification.

## Goals / Non-Goals

Build, operate and publish the corrected desktop application. Use merged UAR 482c418093d66487b5713b9022d185577c2a38f7 and mini 52a84e7d19f3ffdae0b58bd1732a853abd06e748, rebuilding the actual UAR server-full payloads and copying the mini runtime through existing packaging. Do not upgrade unrelated dependencies or alter credentials, repeat memory approval cycles, reset retired Cadence or infer Windows interactive acceptance from packaging.

## Decisions

Use unused patch version 2.2.38. Freeze one application source for local and CI builds, with one local build writer and one metadata/site publisher. Dispatch only darwin-arm64 and win32-x64 with notarize_macos=false. Retain Mac Developer ID signing and record actual Windows signing.

Operate a disposable registered workspace in the installed package: remove its directory, open integration settings, restart the app and confirm settings remain usable; recover/remove only that unreferenced fixture. Complete one bounded UAR-backed prompt through the existing BossFang configuration. Preserve prior evidence without relabeling it.

## Risks / Trade-offs

- Public Mac notarization is explicitly deferred; disclose this in manifests and release notes.
- Windows interactive operation requires the operator's machine; keep it pending unless evidence is supplied.
- A failed build or operation is repaired before claiming completion; repeat only the failed procedure.

## Migration Plan

No data/schema migration. Preserve the installed 2.2.37 app before replacing it. Keep prior public installers available for supported rollback. Deploy the landing site after immutable installer and metadata publication.

## Release target metadata correction

The existing publisher advertises all four supported architectures even when this release selects only Mac ARM64 and Windows x64. Add a version-bound target record used by release preparation and metadata updates. Leave the general four-platform build capability and previous release contracts unchanged.

## Observed merged-runtime repair

Installed candidate2.2.38 using UAR482c4180 launches, but BossFang reconnect repeatedly returns delegated_host_context_mismatch. UAR compares full captured ActorOwner identities during host-context registration. Grant issuance drops host_authority (correctly) but loses the local-host credential identity proof, producing None rather than the caller's captured principal. Repair verified identity retention within the scoped grant, while keeping host privilege absent and exact owner/workspace/binding/epoch checks intact. Do not weaken owner comparison or replay retained work. Rebuild only affected UAR payloads and installers after complete wiring. Publicrun38567621099 cancelled with no assets; build attempt evidence is retained.
