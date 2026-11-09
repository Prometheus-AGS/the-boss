# Tasks

## 1. Runtime and settings

- [x] 1.1 Implement persistent configurable ingestion directory, writable startup preparation and localized settings; verify with default, custom and unwritable paths.
- [x] 1.2 Implement startup-visible discovery and choice using authenticated instance validation; verify UAR, non-UAR and incompatible listeners and restart persistence.
- [x] 1.3 Bind BossFang start and connection to the selected verified instance; verify pending and failed UAR prevent startup while app stays usable.
- [x] 1.4 Preserve original startup diagnostics and existing session placement; verify failure and reattachment scenarios.

## 2. Packaging and delivery

- [x] 2.1 Carry forward the verified Compass 0.4.2 source, platform payloads and skills from The Boss 2.2.45.
- [x] 2.2 Carry forward the verified UAR 1.4.0-rc.3 source and platform payloads from The Boss 2.2.45.
- [ ] 2.3 Run one completed-delivery integration and packaged-app gate, UI accessibility and independent review; record observed results.
  - Apple Silicon packaging, integration, and independent source review passed. The full UI accessibility gate remains open.
