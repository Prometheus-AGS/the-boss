## Why

The Boss can supervise one packaged UAR and display its port and capabilities, but sessions cannot select a verified managed or external runtime instance. Agent Fabric Convergence C04 requires durable instance placement and explicit reattachment semantics so a failed selected runtime is refused instead of silently creating work elsewhere.

## What Changes

- Persist a versioned UAR instance inventory with stable identity, managed or external ownership, workspace locality, endpoint roles, required profile/capabilities, and protected credential references.
- Keep `UarSidecarService` as the single managed-process supervisor while allowing non-owning external runtime bindings that The Boss never starts or stops.
- Verify the selected runtime's identity, version, profile, and capabilities before provider credentials or run input are sent.
- Bind new sessions to an explicit instance, preserve the binding in the opaque resume token, reattach to that instance, and represent migration as a separate unsupported operation until implemented.
- Extend the existing `/settings/uar` workspace, IPC, diagnostics, and locale strings with inventory selection, ownership, endpoint roles, effective binding, compatibility refusal, and recovery guidance.
- Preserve the current preferred-port 1906 behavior, sequential fallback reporting, UAR administration surfaces, and embedded or remote SurrealDB configuration.

## Capabilities

### New Capabilities

- `uar-service-instance-placement`: Trusted host inventory, selection, lifecycle ownership, session binding, and compatibility diagnostics for replaceable UAR runtimes.

### Modified Capabilities

None.

## Impact

This affects shared Prometheus integration schemas, protected preferences/secrets, the UAR supervisor and runtime driver, session runtime persistence, Prometheus IPC/service projections, the existing UAR settings page, settings search, and every locale. It consumes initiative C04 and the accepted P1 host-authority contract. No packaging or release artifact changes are required by this change.
