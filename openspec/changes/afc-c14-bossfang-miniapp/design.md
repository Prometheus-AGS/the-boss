# Design

The managed executable resolves from `resources/binaries/<platform>/bossfang[.exe]` through The Boss's asar-aware resource path. A private app-owned TOML config points BossFang to a private home and loopback port. The dashboard username is in the private config; the password is encrypted with Electron safeStorage and supplied only in the managed child's environment. If secure storage is unavailable or credentials are absent, managed startup fails visibly. No credential enters a MiniApp URL or ordinary preference response.

The Boss waits for BossFang's operational `/api/health` response, then returns the live `/dashboard/` URL through a typed IPC route. The renderer uses the existing transient site MiniApp host. Its dedicated Chromium partition accepts network requests only to the current managed origin and carries no MiniApp capability bridge or general site preload. The sidecar owns authentication and its own UI. A settings button can open the same URL in the system browser.

The initial product surface is one managed local instance. External service mode and multiple account partitions require a later contract and are not claimed here.

The Boss writes the initial config only once. Subsequent BossFang dashboard changes and its own persisted configuration remain authoritative. Initial credential setup is a bootstrap action; later credential changes happen in the BossFang dashboard.
