# Supported durable lifecycle controls

This bounded refinement implements the parent [C14 lifecycle design](../afc-c14-uar-lifecycle-overview/design.md) requirement that unsupported controls remain hidden. The observed renderer currently maps every lifecycle verb into a button, leaving unavailable verbs visible but disabled.

## Production plan

1. In `UarDurableInstancesPanel.tsx`, filter the existing action list through the existing `canUse` capability predicate before rendering. Visibility follows `snapshot.capabilities.instances` and the corresponding `snapshot.operations['agent-instances.<action>'].available` value.
2. Preserve supported actions' existing busy, refresh-required, capability and active-run disabling conditions, existing handlers, ownership routing and translated labels. Add stable row/action DOM identity attributes to the existing elements for the lead's packaged operation.
3. Hand the complete source scope to the lead. The lead owns the commit, package and actual supported/unsupported UI operation at the completed delivery boundary. No tests, lint, compiler, build, operation or review run in this implementation task.

Only this scope document and the assigned panel change. There is no new endpoint, model, settings schema or user-visible string, and no change to global Work selection or selected administration identity. Cadence and generated task files remain owned by the lead.

## Operation selectors

- Panel readiness: `data-ui="uar-durable-panel"`, `data-workspace-id`, `data-loading` and `data-capability-instances` expose the existing workspace, loading and instance-capability state; capability is `unknown` before a snapshot exists.
- Instance row: `[data-ui="uar-durable-instance"][data-instance-id="<native instance ID>"]`.
- Lifecycle action: `[data-ui="uar-durable-action"][data-instance-id="<native instance ID>"][data-instance-action="<native action>"]`.

Source completion does not establish runtime acceptance. Compass graph evidence is unavailable in this isolated checkout; the implementation uses the current panel and its administration-workspace caller as source evidence.

## Native payload ownership clarification

The lead owns `build/integration-sources.json` and `build/integration-artifacts.json` for the already-approved C14.4 packaging contribution. The admission used an obsolete `build/integration-pins.json` filename; the actual source/importer names above are the existing two-file implementation. This corrects the file claim without changing the admitted outcome or original clock. Adopt only produced immutable native UAR36f096dbda0f17c6e15c71b284ce89cb04f04502 artifacts; retain actual per-platform source until each job completes. Pending targets and publication debt remain pending. No runtime change, added daemon, native build or intermediate gate is authorized by this note.
