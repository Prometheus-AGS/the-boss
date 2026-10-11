# Design

The Boss owns managed process configuration. Reuse shell/PATH resolution and the bundled Claude binary without replacing explicit provider URLs. Generate a fresh daemon API credential for each managed process, restricted to its child environment; keep dashboard and UAR credentials separate. Native MCP temporary configuration must protect any injected secret. Trace the WebSocket failure before changing authentication; do not hide reconnect warnings.

All production wiring precedes the single build/operation boundary. Build the native payload if required, then pnpm build:mac:arm64; operate chat, one benign daemon read, reconnect and restart. Keep main-only policy and preserve unrelated files.
