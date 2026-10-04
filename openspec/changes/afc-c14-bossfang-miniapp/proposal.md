# BossFang dashboard MiniApp

## Why

The Boss exposes no user-facing BossFang configuration surface. The existing BossFang sidecar serves its complete dashboard at `/dashboard/`; reproducing its administration in settings would duplicate ownership.

## What Changes

- Package and supervise the native BossFang executable on Apple Silicon and Windows x64.
- Require protected dashboard credentials before starting the managed sidecar.
- Add an Apps shortcut and settings entry that open the sidecar's current local dashboard in an isolated site MiniApp.
- Preserve BossFang's native login and a browser fallback. Show actionable startup and setup failures.

## Scope and ownership

This product change implements the `the-boss` portion of initiative `afc-c14-studio-administration-and-isolated-service-consoles`, task C14.3. BossFang owns its dashboard implementation and binary build. The Boss owns packaging inputs, process supervision, typed IPC, origin isolation, user entry points and translations. No UAR or BossFang source is changed here.
