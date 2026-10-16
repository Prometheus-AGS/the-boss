# UAR 1.1.0 desktop release — The Boss 2.2.39

## Scope and source

This update consumes stable UAR v1.1.0 at d815ef72ac7d2c57a9bd18b23fcc58ffb224f326 for Mac ARM64 and Windows x64. Boss application inputs are frozen at 2d2bbaf15271e1f5abc47ee38d4e80400159f31d; subsequent main commits record generated copies, operations and publication metadata. Mini is 0c6b6e4c2a7ee849f55570f6d5ec2bb7d4961f7a. Full-pack launcher source is 367dfd4. BossFang remains the admitted 2ec0f66ec224ec60fe1b4aaecabbd6f735c73f85 payload. No unrelated native source, database or architecture upgrade is included.

## Actual operations and evidence reuse

- The full local pnpm build:mac:arm64 compiled the production application, signed it and validated its first installer. A discovered launcher correction required only repackaging compiled output into a DMG, not recompiling or repeating unrelated operations. Both attempts are retained locally.
- Seven initial desktop checks and four failed-only continuation checks compose ten distinct operation IDs after deduplicating service-configuration restoration. Six wider predicates remain pending; see desktop-operation-r3-diagnosis.md.
- One normal saved BossFang UAR agent received exactly one no-tools prompt through the visible UI and streamed the exact answer. It completed with correlated UAR root/run/task IDs and effective model openai-codex:gpt-6.1-sol, using its saved managed-local instance/workspace/target. Two actual text-delta frames, one terminal frame and zero tools were observed. The completed operation was reconciled read-only after an operation helper incorrectly required an optional thread field; the prompt was not replayed.
- All 207 compiled main/preload files match the operated installation and the final repack. The packaged launcher matches the operated 1.2.9 source. Final installed Mac launch and native version are recorded separately. Passing application behavior is reused only on this explicit basis.
- The first final-DMG validation passed image and code-signature checks but its mounted native executable hit a 30-second cold-launch deadline. Its isolated failed-only invalid-token probe then passed in 198 ms. This is not a new inference operation or an omitted failed result.

## Completion and qualification accounting

Historical code remains **61/61 tasks and 20/20 changes**. Historical portfolio terminal qualification remains **43/61**: 42 qualified items and one skipped duplicate. This release adds evidence to a separate eight-task update; it does not mark retained portfolio predicates passed.

Pending qualification includes direct filesystem MCP invocation, shared-memory operation in the private fixture profile, native run cancellation/reopening, retained/empty native MCP catalog hydration, actual OpenSpec command execution, and buffered doctor/repair/distinct Docker states. The existing private-profile operation does not manufacture shared-memory configuration or approvals. Broader connector, mobile, federation and benchmark scope stays deferred.

Mac ARM64 is Developer ID signed; notarization is skipped by operator instruction. Windows x64 is unsigned. Its native runner successfully built the NSIS installer, performed package extraction and the payload launch probe, and uploaded the identified artifact. Windows x64 customer-installed operation and operator acceptance of 2.2.39 remain pending; earlier candidate acceptance is preserved but not reassigned.

## Publication state

Mac asset upload, serialized metadata publication, landing synchronization and live website Mac 2.2.39 link succeeded. Windows installer upload, serialized metadata/landing synchronization and final website deployment succeeded. The live production JavaScript contains both primary 2.2.39 URLs and matching checksums; both final installer URLs returned HTTP 200 and exact content lengths. Successful publication/landing workflows retained the actual artifact-download/hash evidence. See site-publication.json and published-boundary-runs.json. This bounded eight-task release update is delivered; broader qualification remains pending as listed above. No retired KBD or Cadence state is reactivated, and no clock/history/delivery-count reset occurs.
