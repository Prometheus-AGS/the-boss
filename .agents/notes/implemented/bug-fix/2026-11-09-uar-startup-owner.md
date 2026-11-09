# Agent Note: UAR startup choice and credential-owned BossFang connections

Status: implemented

English | [中文](2026-11-09-uar-startup-owner.zh.md)

## Problem

A launch-bound external UAR can advertise host assertion while rejecting an asserted owner that differs from the one bound to its credential. This blocked BossFang setup with HTTP 403. An occupied preferred port and an unwritable ingestion path also prevented reliable managed startup.

## Decision

Check the verified external instance's principal mode on a read-only capability route. Use the credential's bound owner on the exact principal mismatch response. Keep credentials in the main process and invalidate checks in flight when an instance changes. Offer verified local discovery or managed startup, and apply the configured ingestion directory when the managed runtime restarts.

## Alternatives considered

Changing the owner on a mutating request would risk replaying work. Treating a generic authentication response as discovery would misidentify unrelated listeners.

## Consequences

Existing work keeps its runtime and authority when new work switches. An external runtime that keeps discovery private requires protected manual registration.

## Verification

- Regression — `pnpm build:mac:arm64` and the [packaged Mac scenarios](../../../../openspec/changes/uar-bossfang-compass-startup/macos-evidence.md): verified ingestion, port fallback, authenticated BossFang startup, relaunch, session reattachment, and live switching.
