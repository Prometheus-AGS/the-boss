# Design

The existing authenticated sidecar adapter resolves a Boss workspace before any UAR call. Its fixed operations post revisioned commands to UAR and parse scoped returned instances/messages. Renderer IPC accepts typed IDs, content and expected revisions, never an arbitrary endpoint. UAR rechecks owner, workspace and recipient at the durable mutation boundary; the renderer is not an authority source.

The Teams panel retains UAR as the board source of truth. After each successful mutation it replaces the affected team from the server response; on conflict it refreshes and presents a retry action. Message status comes only from UAR receipt fields. The page labels planning and trigger intent accurately, without implying that a model is already running. At completion, build the actual Mac ARM64 application and exercise assignments, fencing, inbox persistence and page feedback against its packaged sidecar.
