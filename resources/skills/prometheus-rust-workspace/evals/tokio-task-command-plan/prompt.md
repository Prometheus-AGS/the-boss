---
tags: [certification, outcome]
max_turns: 15
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Rust workspace, the surface-bridge crate (an Axum server) needs a background tokio task that prunes expired sessions every 60 seconds. You don't need to read the code. Outline the change, and list the cargo commands you would run and at which points.
