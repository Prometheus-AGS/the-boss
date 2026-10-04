# Design

Use the existing trusted main-process UAR adapters and typed IPC. Compose their workspace-scoped snapshots in the renderer without creating a second runtime store or writing UAR state. Display source identity and timestamp where available, and do not imply the separately fetched views are an atomic snapshot.

Place the overview in `/settings/uar` using the established settings navigation and visual system. Keep existing detail controls as the action owners. Render task dependency and assignment information from the team task records; show binding activation support, measured budget use, and observer cursors/backlog/gaps with clear unknown states. Translate new UI copy in every existing locale and preserve keyboard and narrow-screen use.

The completed delivery boundary builds a Mac ARM64 package, launches it with an isolated profile, and operates the overview against a running UAR with a team/task/workflow. A source-level view alone is not operational evidence. Release publication and Windows installed acceptance remain separate receipts.
