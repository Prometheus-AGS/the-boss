# Managed BossFang chat authentication

## Why
The installed application launched BossFang with a minimal PATH, causing Claude ENOENT and HTTP 500. Dashboard-only credentials did not populate the Claude MCP bridge key; the operator reports failed daemon tools and reconnect warnings.

## What changes
Resolve Claude from the existing shell environment and bundled runtime, provide a private managed daemon credential, and repair the observed authenticated WebSocket failure. Preserve existing credentials, provider overrides, native policy and UAR ownership.

## Impact
The Boss managed launch and BossFang bridge/dashboard authentication; no phase or Cadence reset.
