# Agent Note: UAR lifecycle payload binding

Status: proposed

English | [中文](2026-10-20-uar-lifecycle-payload.zh.md)

## Problem

The lifecycle launcher requires a matching UAR binary. A package built from an
older target executable can otherwise carry a newer source label. The Windows
launcher also needs cancellable inherited input and an acknowledged child exit.

## Proposal

Keep the operator-approved cross-repository lifecycle implementation in a draft
until verification is authorized. Pin the explicit native local candidate to
UAR commit `32cb3bcfc9691212ec0b0359ce22474968bc6850`. Require the committed-object
producer, a fresh target directory, and matching source/tree, platform, feature,
protocol, executable, build-log, archive and file inventory identities. Existing
public payloads keep their release identities. Legacy local mode retains its
clean checkout requirement; explicit candidate mode uses committed Git objects
and excludes unrelated dirty files.

Use inherited overlapped stdin on Windows, retain child handles, correlate
private lifecycle replies and await actual child closure. Signaling or elapsed
time cannot certify termination. This proposed note records the approved source
design; it is not an implemented acceptance record or a substitute for a Spec
approval on GitHub. The draft links the UAR OpenSpec and operator decision.

## Alternatives considered

- Relabel an existing target executable: rejected because source provenance is
  false even if the file hash is internally consistent.
- Reuse the public payload for local acceptance: rejected because it does not
  contain this unaccepted lifecycle source.
- Require a clean shared checkout in explicit candidate mode: rejected because
  immutable Git-object export already excludes unrelated changes.

## Acceptance criteria

- AC1 — The packaged local sidecar matches the pinned committed source and required lifecycle protocol; stale or inconsistent records are refused (verification: packaged artifact)
- AC2 — EOF shutdown and explicit reconnect receive correlated lifecycle results, and owned child exit is observed before completion (verification: Electron)
- AC3 — Windows inherited input cancellation completes through actual overlapped I/O and child reaping without a fixed success deadline (verification: packaged artifact)

## Risks

Verification is CLOSED. No candidate, package, process scenario, typecheck or
review has run. These local receipts establish integrity, not signed compiler
attestation against a malicious artifact owner. The public customer build and
Windows evidence remain separate gates. The note stays proposed until genuine
authorized evidence covers its criteria; the draft must not imply readiness.
