# Design

## Context

Source repair 39858313fe isolates ENOENT inventory reads while keeping persistent workspace records and strict execution identity. Administrative reconciliation 1e78af9981 preserves 61/61 code tasks, 20/20 changes and 43/61 terminal qualification.

## Goals / Non-Goals

Build, operate and publish the corrected desktop application. Reuse frozen UAR 3e6af7c4 payloads and existing release workflows. Do not upgrade dependencies, alter credentials, repeat memory approval cycles, reset retired Cadence or infer Windows interactive acceptance from packaging.

## Decisions

Use unused patch version 2.2.38. Freeze one application source for local and CI builds, with one local build writer and one metadata/site publisher. Dispatch only darwin-arm64 and win32-x64 with notarize_macos=false. Retain Mac Developer ID signing and record actual Windows signing.

Operate a disposable registered workspace in the installed package: remove its directory, open integration settings, restart the app and confirm settings remain usable; recover/remove only that unreferenced fixture. Complete one bounded UAR-backed prompt through the existing BossFang configuration. Preserve prior evidence without relabeling it.

## Risks / Trade-offs

- Public Mac notarization is explicitly deferred; disclose this in manifests and release notes.
- Windows interactive operation requires the operator's machine; keep it pending unless evidence is supplied.
- A failed build or operation is repaired before claiming completion; repeat only the failed procedure.

## Migration Plan

No data/schema migration. Preserve the installed 2.2.37 app before replacing it. Keep prior public installers available for supported rollback. Deploy the landing site after immutable installer and metadata publication.
