# The Boss 2.2.38 release evidence

The completed release includes the missing-workspace inventory repair, merged UAR runtime source `ac0970437096a1b935809bb90f48bfdd6d6421bd`, and mini skills source `52a84e7d19f3ffdae0b58bd1732a853abd06e748` (1.12.1, 101 packaged skills). The application source frozen for local and public builds is `2a508b433db5dea80073b46fee34b8c549043056`.

## Installed operation

[operation.json](operation.json) is the immutable installed Mac receipt recorded before publication finished. Its publication fields describe that earlier time; [publication.json](publication.json) records the final publication separately. The operation receipt SHA-256 remains `14852db6274e2620aed884997c0dedba2af2b9c297cfeb2955e58bcb7d5c88cb`.

The installed application completed a streamed BossFang prompt through the updated UAR, displaying `UAR_AC097_READY` and a correlated completed run. A disposable workspace registration retained its identity while its directory was absent; integration settings and a cold application restart remained usable. Restoring the directory restored its selected workspace. Only the empty fixture registration and empty task were removed/archived through the UI; user files and history were preserved. All four BossFang readiness states returned after restarting The Boss.

This operation does not claim a new shared-memory persistence certification or a broader approval/effect matrix. The UAR repair retains a verified scoped principal without retaining host authority; exact owner, workspace, binding and epoch checks remain intact.

[final-source-review.json](final-source-review.json) records the bounded independent source/evidence review. It does not certify publication, operator acceptance or unrelated portfolio behavior. [sycophancy-screening.json](sycophancy-screening.json) records the completed screening. Screenshots remain local-only under this directory because installed desktop views contain local context.

## Installers and website

- [Mac ARM64](https://github.com/Prometheus-AGS/the-boss/releases/download/v2.2.38/The-Boss-2.2.38-mac-arm64.dmg): Developer ID signed; notarization skipped as requested.
- [Windows x64](https://github.com/Prometheus-AGS/the-boss/releases/download/v2.2.38/The-Boss-2.2.38-win-x64-setup.exe): unsigned.
- [Live downloads](https://the-boss.know-me.tools/#download): both 2.2.38 links visibly observed after Lovable reported the website updated. Retained Intel Mac and Windows ARM64 downloads explicitly remain earlier 2.2.30 releases.

The production landing workflows downloaded and checked each public installer's byte count and SHA-256. Exact artifacts, workflows, manifests and source revisions are in [publication.json](publication.json).

[local-artifact.json](local-artifact.json) identifies the local signed DMG built with `pnpm build:mac:arm64`, opened read-only and installed for the affected operation. Its bytes differ from the independently built public CI installer; neither hash is substituted for the other.

## Independent accounting

Historical code completion remains **61/61 tasks and 20/20 changes**. Portfolio qualification remains **43/61 terminal items: 42 qualified plus one historical skipped duplicate**. The 18 broader qualification items remain separately tracked. The retired Cadence history retains 17 deliveries, original clocks and records; this repair does not recreate or increment it.

Mac installed operation passed for this release's affected scope. Operator acceptance of 2.2.38 and native Windows x64 installed operation remain pending. Earlier operator acceptance of 2.2.32 is preserved and is not attributed to this candidate. Mac Intel, Windows ARM64 and Linux are outside this repair. No passing historical operations or memory approval cycles were repeated.
