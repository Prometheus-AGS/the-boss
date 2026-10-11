# Local evidence and scope

Inspection date: 2026-10-02. Source inspection is not new runtime operation.

- L1: GitHub run 36924951718 attempt3, source61bc79e8ec039de31d524d2c8d2883dc7e47cce6; annotation110749594246: account locked due to billing issue; no steps. Re-read this session. No dispatch in research.
- L2: preceding conversation token read and retry; identity GQAdonis, repo admin visible, rerun denied Resource not accessible by personal access token. No token persisted in report.
- L3: Boss inspected worktree /Users/gqadonis/.claude/worktrees/upstream-grok-compatibility at61bc79e8ec039de31d524d2c8d2883dc7e47cce6; package2.2.10. Report destination /Users/gqadonis/Projects/prometheus/the-boss at e2ae2ce21245030293c0bea96ed02ae853b820a7 (not fast-forwarded). Landing local checkout019363e738f19fb6e53251bc14f511e3b3d779a2; not claimed latest deployed revision.
- L4: Boss .github/workflows/the-boss-release.yml:60,239; scripts/queue-release-publication.cjs:45,60; scripts/coordinate-release-publication.cjs:75,93,112,135. Coordinator destructively resets its checkout/removes manifests: disposable release checkout only. Landing .github/workflows/publish-release-platform.yml:71,82,96; .github/workflows/sync-release.yml:9. Landing has no host-deployment command in inspected workflow. scripts/sync-release-platform.mjs:10,125,130,174 validates GitHub origins and public bytes.
- L5: scripts/release-platforms.cjs:5 defines win32-x64 windows-2025, win32-arm64 windows-11-arm, darwin-x64 macos-15-intel, darwin-arm64 macos-15; :54 expects GITHUB_OUTPUT. scripts/validate-release-package.cjs:23,59,82,105,134; matching host, native payload probes, conditional notarization, mounted DMG, installed Windows package. Node24.21.0, pnpm12.6.0, before-pack.js:143 native SQLite rebuild, release-capacity.cjs:10 minimum10GiB, nsis-preflight.cjs:27. UAR Intel script exists; non-UAR matrix's build:mac:x64:release is absent from inspected package scripts, unlike build:mac:x64. Not fixed.
- L6: electron-builder.yml:200 and src/main/services/AppUpdaterService.ts:32,100 generic Cherry updater host. publish-installers.cjs:20 selects DMG/setup.exe only. Not a demonstrated updater delivery path.

## Payload and signing dependencies

build/integration-artifacts.json:54,92,130,168,207 (native tools), :263 (Node source), :324,346,368,390 (UAR). import-uar-sidecar-payloads.cjs:49,121 requires immutable GitHub release URLs/source/hash. download-binaries.js:230 vendors other GitHub-hosted tools. electron-builder.yml:203 Electron mirror. publish-installers.cjs:40 GitHub release upload.

Mac workflow .github/workflows/the-boss-release.yml:151 enforces signing/notary credentials; notarize.js:26 returns if unavailable; validator:82 conditional on HAS_NOTARIZATION. Windows win-sign.js:96 relies on WIN_SIGN and CHERRY_CERT_* while workflow:194 exports CSC_LINK/password. Record actual signature; source presence does not prove signing.

## Independent source specialist

Fresh-context explorer release_research_baseline inspected these files read-only and returned source references. It did not change code, build, test, dispatch, publish or verify the live website. The parent used this inspection to ground the proposal.


## Publication adapter findings from follow-up source inspection

publish-installers.cjs uses --clobber; byte-identity guard before invocation is necessary. queue-release-publication.cjs and coordinate-release-publication.cjs have no no-dispatch option; both can complete external effects before a final dispatch error. commit-release-entry.cjs:20 labels provenance GitHub Actions release packaging regardless of host. Report proposes a bounded adapter, does not claim these scripts are a ready external pipeline.

prepare-github-release.cjs:3,12,34; release-preflight.cjs:6; importer:9,121,206; publisher:11,17,40,82; queue:22,33,48; coordinator:28,75,93,112,135; landing sync:150,174,187,212; landing workflow:67,78,82,94.

A windows-signing self-hosted label exists in .github/actionlint.yaml:1 and sync-to-gitcode.yml:30,182. It is GitHub-controlled and does not establish live runner availability. No independent controller found in conventional pipeline files of the two inspected repositories.
