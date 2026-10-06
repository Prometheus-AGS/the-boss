# Tasks

- [x] 1. Add versioned authoring DTO, durable source record, and deterministic UAR package compiler for coding/product-design templates.
- [x] 2. Add workspace-scoped preflight/install and private binding deployment with per-role model and reviewed skill choices; retain immutable previous packages/runs.
- [x] 3. Add guided team administration UI and Work entrypoint using established components; translate all new strings.
- [x] 4. Add the packaged real-path create/deploy/run/revise/reopen operation procedure.
- [ ] 5. At the completed boundary, build Mac ARM64, launch, operate the delivered feature, and repair only observed failures (lead-owned delivery gate).

Production work 1–4 is authorized in the isolated work-ahead scope. Task 5 cannot begin before the preceding Teams in Work delivery succeeds and the lead promotes this frozen source.

Tasks 1–4 record source implementation only. No compilation, lint, build, or packaged operation has certified this authoring delivery. The completed-boundary gate requires the packaged UAR deployment catalog API, trustworthy pricing for the explicitly selected gateway model, the pinned bundled creator compiler, and a real installed readonly skill returned as available by the protected catalog. The operation uses `BOSS_C15_GATEWAY_*` identity fields and an environment variable reference for its credential; it never seeds registry metadata.

## Observed packaged-attempt diagnostic repair

The real create/deploy operation reached an attempt failure reported as `TEAM_PROVIDER_REQUEST_REJECTED` / `provider_error`; the source stage and HTTP status were not retained, and the operation threw before saving attempt details. The additive repair carries optional safe `sourceStage`, `category`, `httpStatus` and allowlisted `collaborationCode` through the existing scoped execution parser and shared IPC type. Teams shows these fields with translated labels; preparation/handoff stages do not imply a provider cause. Sidecar logging retains only the agreed named event's validated machine fields. No raw messages, URLs, headers, or credentials are added.

The C15 operation now writes correlated attempt IDs, statuses and the safe diagnostic projection before throwing `C15_REAL_ATTEMPT_FAILED`, and retains that projection in the final receipt. This is production source repair, not evidence that the underlying attempt now succeeds. No standalone test, compiler, lint, install, build or review was run for this repair; the lead owns the next complete packaged boundary. The per-command commit hook override avoids the previously observed automatic dependency installation/native build and changes no persistent hook configuration.
