# Managed BossFang repair — 2.2.34

## Observed failures

- Installed 2.2.33 agents failed with Claude CLI ENOENT under Finder's restricted PATH. An operator-local provider URL temporarily restored inference.
- Daemon log records ten POST /mcp 401 responses in the dashboard-credentials-only managed profile.
- Boss webview filter compares HTTP and WebSocket origins literally, blocking the agent connection before daemon authentication.

## Source

- The Boss main: 444bc18859 (permanent executable discovery, managed auth and isolated websocket correction).
- BossFang main: 3d01efffb59502663c7a768858f70622cc94634e (exclusive owner-only Unix temporary credential files).
- Fresh-context static review found configured API-key precedence regression; fixed before final application build. No cross-model claim.

## Earlier boundary progress (superseded by results below)

- Actual application production build, including required compiler checks, exited 0 after the credential-preservation repair. Log: /tmp/bossfang-app-repair-2.2.34-final.log.
- Native release build and packaged operation pending. Native build log: /tmp/bossfang-native-repair-20261011/build.log.
- No unit suites, per-edit tests, or previous qualification scenarios run.
- Existing 2.2.33 public release is unchanged.

## Completed Mac boundary — 2026-10-11

- Native release build exited 0 after 22m13s, exact source 3d01efffb59502663c7a768858f70622cc94634e. Native asset SHA-256 de597330821ff7ba0d2f329785872210f6ff4069fb9ceccb832b6fae23830bde, 177203760 bytes. Actual Rust/Cargo 1.95.0 is recorded in its manifest; this is an explicit toolchain override, not the integration recipe's 1.97.1.
- Published immutable native payload: https://github.com/GQAdonis/librefang/releases/tag/bossfang-sidecar-3d01efffb. The Boss pin commit d1ed3bf345 preserves the older Windows binary's actual provenance.
- Used production UAR-enabled packaging steps (THE_BOSS_UAR_ENABLED=1, THE_BOSS_UAR_LOCAL=0); local source inputs were backed up outside resources before immutable downloads. The first package attempt correctly refused leftover local markers. No UAR source or operator pins changed.
- DMG: dist/The-Boss-2.2.34-mac-arm64.dmg; 1883518915 bytes; SHA-256 2290df38629d48ddebdfef0451f5f7090adc24f72c0a3a8be0155d77285e0a0f. Developer ID signed; NOT notarized. validate-release-package.cjs darwin-arm64 exited 0, including mounted-DMG code signature validation.
- Launched the packaged app with the real existing profile. Backed up native config and removed only this repair session's temporary Claude executable override. Managed BossFang started at port4545 with saved dashboard credentials.
- Dashboard showed Connected to agent and SECURE LINK WS; Claude produced a streamed response. Actual mcp__librefang__agent_list tool receipts succeeded at 21:29:58.357→21:30:00.264Z and 21:30:10.352→21:30:11.795Z; each returned the two known agents. /mcp requests returned200. The model's response alone was not used as tool evidence.
- Local Claude receipt IDs: f3cc5bfa-4c21-45e9-af20-7a9649843b31 / toolu_01S2wkzqxLTW5z2H4doqYeSj; 2a85d46c-1b36-4abf-bc77-80725dba8010 / toolu_0159SNRhw6qceM5D54ZDcsxX. Full private transcripts were not copied into this repository.
- Observed temporary MCP JSON permissions0600 during execution and removal after completion. No credential values inspected or copied into evidence.
- Reload and managed daemon restart returned to Connected, retaining conversation and dashboard authentication.
- Installed the same signed2.2.34 app into /Applications/The Boss.app, retaining2.2.33 at dist/installed-backup-2.2.33/The Boss.app. Relaunched it; Apps→BossFang started the installed binary, reused credentials and opened connected chat.

## Scope and remaining limits

This demonstrates native Claude chat, its daemon MCP bridge, WebSocket reconnection and managed startup. No claim is made about every daemon tool, UAR delegation, native Windows operation or new public installer publication. The2.2.33 public installers remain unchanged. Security changes cover the real child-environment and temporary credential-file boundaries; dashboard origin restrictions remain enforced. No unit or broad qualification suites were run.
