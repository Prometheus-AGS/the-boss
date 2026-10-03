# Delivery state

Source implementation passed integrated TypeScript checks and application bundling after two nullable/union narrowing fixes. Mac packaging and live operation remain pending; no runtime acceptance is claimed.

The exact provider DTO was coordinated with the UAR owner and read from src/uar/domain/workflow_execution.rs in the C10 UAR worktree. Routes use /api/v1/collaboration, direct responses, and camelCase Option fields serialized as null. UAR confirmed definition.input.properties.feedback.maxLength and classify/draft role matching.

The generic preload requires no extra route registration. Main handler and runtime barrel imports include the adapter in the existing application bundle. Managed sidecar launch forwards UAR_WORKFLOW_EXECUTION_PROFILE_STAGE=operation only from the trusted process environment, following the existing team-execution staging rule; renderer preferences cannot set it.

The UAR source pin is 0c007e9d4f69408752d154e5a81c356a7162f407. Payload preparation verified the native archive SHA256 507ee48f5afaf13e7f40000fcdf4371d0312d0b284762156aa19113182745d4a and twelve payload files. Packaging exposed local Liter validation using an older source manifest; it now validates the pinned native artifact source/version/size/hash. The fetched Liter binary matches SHA256 41402e5dda2ec2ebd4c2adf5df14a241d95e057b2b3d776e0141f90bd0a7c029 at source 12a2fae9675e34b88e9373caa2bca9959f416493. Requested Mini origin/main is f6b765c4d80fb872f932250a19f2752bbcdeb4bd; both integration manifests and the gitlink are aligned before the next full Mac build. No unmerged Mini change is included.

Environment preparation: first pnpm i18n:sync triggered automatic dependency materialization under host Node 26.5.0 and failed in a native rolldown postinstall. A frozen-lockfile force install under the repository-pinned Node 24.21.0 succeeded, restoring native bindings. Existing install lifecycle built its workspace dependency packages and installed the existing prek hooks into shared Git metadata. No dependency or lockfile source edits were made. Required i18n:sync then completed successfully; each of the 13 renderer locales retains 30 translated new workflow keys. This generation is not the completed lint or runtime gate.

Security boundaries added: typed closed renderer input; local workspace resolution; sidecar response schema/workspace/run validation; stable team/owner checks on mutation; exact wait-to-artifact digest validation; trusted-only staging environment. UAR continues to enforce current authority, admission and decision revisions.

The completed-boundary `pnpm lint` command failed at Oxlint with 118 errors, including three new unused destructuring bindings (fixed) and existing managed agent-team scripts. Its 22 unrelated autofixes were restored to the pre-lint content. The broad lint result is not passing; no unrelated lint cleanup is included. Commit hooks apply formatting and ESLint to the scoped staged production files.
