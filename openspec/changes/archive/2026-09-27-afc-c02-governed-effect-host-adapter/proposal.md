# Proposal: AFC C02 governed-effect host adapter

## Problem

The Boss owns the trusted sidecar host boundary, but its current private tool-admission adapter records only local tool disposition and approval state. UAR's additive authority envelope and claim-time revalidation would therefore be rejected by the existing host, and there is no host-owned abstraction for choosing local authority or Flint Gate without moving effect execution out of UAR.

## Change

- Preserve `the-boss.uar.sidecar/1` and extend `/uar/admission/v1` with additive authority fields plus an asynchronous `claim` operation.
- Bind every preparation, resolution, claim, and managed MCP dispatch to the UAR `authorityRevision` and exact canonical payload digest.
- Introduce one host authority-provider contract with `evaluate`, `decide`, and `revalidate` operations.
- Keep the local provider as the default. It derives principal, workspace, host policy, and approval facts from the active The Boss session and configuration rather than accepting UAR identity claims as authority.
- Add an optional Flint Gate provider using its private `afc.governed-effect/1` evaluate, decision, and revalidate endpoints. Store endpoint selection in integration configuration and credentials only in protected main-process secret storage.
- Fail closed when the selected provider is unavailable, changes a binding, or requires an authority fact that The Boss cannot verify.

## Boundaries

UAR remains the sole effect lifecycle owner and executor. The Boss owns host authentication, approval presentation and admission, protected provider credentials, and managed MCP dispatch. Flint Gate remains a policy and approval authority and never executes an effect. This change does not add renderer authority, a second scheduler, or a compatibility protocol.

