# UAR lifecycle overview

## ADDED Requirements

### Requirement: Workspace-scoped execution overview
The Boss SHALL present UAR definitions, bindings, instances, activations, runs, teams, tasks, workflows, and observers for the selected workspace using their existing trusted administration contracts. It SHALL link to the applicable detail and action views and SHALL not assert atomic consistency across separately fetched snapshots.

### Requirement: Supported operational posture
The overview SHALL expose task dependencies and assignments, binding activation support, available budget use, and observer cursor/backlog/gap information. It SHALL mark missing or non-comparable measures unknown instead of deriving unsupported remaining budget, elapsed lag, or failure causes.

### Requirement: Accessible administration
The overview SHALL remain navigable by keyboard, usable on narrow screens, and translated across every existing locale.
