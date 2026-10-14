# Design

The Boss owns managed process configuration. Reuse shell/PATH resolution and the bundled Claude binary without replacing explicit provider URLs. Generate a fresh daemon API credential for each managed process, restricted to its child environment; keep dashboard and UAR credentials separate. Native MCP temporary configuration must protect any injected secret. Trace the WebSocket failure before changing authentication; do not hide reconnect warnings.

All production wiring precedes the single build/operation boundary. Build the native payload if required, then pnpm build:mac:arm64; operate chat, one benign daemon read, reconnect and restart. Keep main-only policy and preserve unrelated files.

## Confirmed reconnect cause

The Boss WebviewService compared a websocket URL origin (ws://) literally against the dashboard HTTP origin (http://), cancelling the request before the native daemon. Normalize the scheme only for Electron webSocket resources, preserving exact host and port. Native dashboard auth did not require broadening.

## Completed-boundary review

A fresh-context static review identified that unconditional managed API-key injection would override an existing native master key. The implementation now parses the existing native TOML and leaves literal/vault-backed keys to native resolution. Same-family reviewer independence is not represented as cross-model review. No test suite was run.

## Build provenance

Repair application version: 2.2.34. Published 2.2.33 artifacts remain immutable. UAR payload remains the existing pinned production artifact; the consolidated UAR checkout has advanced, so the production UAR packaging profile is used rather than misrepresenting it as a local source build. BossFang native source fix: 3d01efffb59502663c7a768858f70622cc94634e.
