# BossFang MiniApp

## Requirements

### Managed dashboard

The Boss SHALL launch its pinned BossFang sidecar with an application-owned private home and dynamically resolved loopback port. It SHALL refuse startup without protected dashboard credentials and SHALL report an actionable reason when the binary, credentials or operational endpoint is unavailable.

### Existing dashboard

The Apps shortcut and relevant settings link SHALL open the same current `/dashboard/` web application served by BossFang. The Boss SHALL not duplicate BossFang configuration forms. The dashboard SHALL retain BossFang's native login and session.

### Browser boundary

The embedded dashboard SHALL use its own browser partition, limited to the currently managed loopback origin. It SHALL not receive The Boss MiniApp capability bridge or a credential in its URL. A browser fallback SHALL open that same endpoint only after it is available.
