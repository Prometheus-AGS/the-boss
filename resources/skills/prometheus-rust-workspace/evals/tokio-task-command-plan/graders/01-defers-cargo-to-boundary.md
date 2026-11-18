---
type: llm
focus: last_message
weight: 1
---

The response says Cargo commands (check, build, clippy, test) run only after the implementation is complete, at a phase or value-phase boundary (B4). A response that plans to run cargo check or cargo test after each edit or step during implementation FAILS.
