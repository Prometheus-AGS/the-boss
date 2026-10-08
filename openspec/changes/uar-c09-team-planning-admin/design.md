# Design

The Boss verifies workspace IDs against its own workspace store, reads the selected UAR generation and sends requests through its existing authenticated sidecar connection. It parses the returned team documents and refuses a response for another workspace. The renderer receives a typed projection via three fixed IPC routes: snapshot, create, add task. No arbitrary URL or untrusted method is accepted from the renderer.

The UAR API is the sole writer of team planning state. Create resolves an immutable TeamDefinition and private deployment binding at their exact versions. Task submission supplies an expected team revision and an idempotent command ID. Task dependencies are checked by UAR; the UI only guides entry. Member and task state are displayed as returned, with no local inferred execution status.

The Teams page uses the current UAR workspace selector and established settings components. It distinguishes a missing team-capable definition, unavailable sidecar, unsupported operation, empty board and failed mutation. All text uses existing locale catalogs.

The cadence increment records UAR/Boss source refs, then completes code. At its boundary, build with `pnpm build:mac:arm64` using the clean pinned C09 UAR source and launch the resulting app. Exercise create/add/restart/read in the packaged app. Build success alone does not establish durable function.
