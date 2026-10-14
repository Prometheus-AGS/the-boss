# Design

Reuse original BossFang dashboard source from 49d0267138 surgically, preserving current source and dependency pins. Dashboard remains /dashboard in persist:bossfang-dashboard, no host capability bridge and requests limited to current verified origin. Real mascot is the native dashboard boss-libre.png.

Managed bind defaults to 127.0.0.1:4545 with automatic increment; fixed bind reports a conflict. Saved requested configuration is separate from effective values; restart applies saved changes. External service process remains externally owned. Dashboard credentials are encrypted in the main process.

Independent selected UAR defaults to managed-local and comes from existing inventory. Main resolves current endpoint/generation and obtains host-authenticated 15-minute delegation grants restricted to selected workspace and discovery/model_read/full_harness_delegation. Tokens never enter renderer, preferences or exported logs; connection updates and renewed grants go to native protected connect endpoint.

The user explicitly invokes a streamed full-harness diagnostic after selected model cost disclosure. Stages, model usage, real receipt/event progress, failure actions and redacted export are visible. Health alone is never a successful delegation. Native API and grant contracts are coordinated with assigned runtime owners.

Root owns packaging manifests/native pins/builds. No compiler/test/build/review is run before complete production wiring.
