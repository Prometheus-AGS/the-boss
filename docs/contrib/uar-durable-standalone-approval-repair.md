# Durable standalone native approval repair

The actual 2.2.28 synthetic representation run reached a `file_read` challenge,
then stopped because the driver and durable settings controls required
`admissionOwner: uar-runtime`. The persisted challenge correctly retained
`paired-host`: native effect tools use that admission class even when UAR's
trusted standalone admission adapter is the local host.

Keep effect admission ownership unchanged. Add `decisionOwner` to the live,
owner-scoped pending projection, derived from the captured admission binding:
runtime controls and an exact `standalone:<runtime_epoch>` binding can resolve
their challenge through UAR; a genuine paired host still requires its host
decision record. The durable adapter and existing buttons use this classification
while retaining issuer, challenge, run, instance, workspace, cursor, expiry and
authenticated-owner checks. Older pending records fall back to their existing
admission owner; an old paired-host record does not become locally resolvable.

The standalone adapter exposes only the validated `file_read` target in its safe
action display, allowing the human to review the exact synthetic read. It does
not expose complete arguments, credentials or outputs. No tools are relabeled,
no grants are expanded and no cancelled attempt is replayed.

UI refinement uses the incumbent Operate surface, existing shared buttons,
keyboard behavior, translated labels and error presentation. Impeccable context,
focused Pro Max disabled-state guidance, Better Accessibility and Vercel React
guidance inform this correction; no visual redesign or new strings are needed.
The source repair is not runtime qualification. Build and operation remain at
the root-owned completed delivery boundary; no intermediate checks run here.

## Terminal history after managed restart

The packaged 2.2.29 operation
`pending-approval-recovery-a638e26e-d2da-4052-852d-6477ac1fa3fe`
reached an undecided native `file_read` challenge, then restarted the managed
UAR through its existing typed control. The retained command was cancelled,
its instance dormant and ready with no active run, but reading the run failed
at the process-local events endpoint's HTTP 404 before the durable approval
history could be presented.

The adapter now treats only that exact events-endpoint 404 as a retention gap
when authenticated, workspace-scoped instance state proves the same turn is
completed, failed or cancelled and is no longer active. It returns no events
and does not advance the requested cursor. Existing UI gap copy explains the
missing stream. Pending approval, durable history and effect reads retain their
existing authentication, runtime-generation and identity checks; their actual
native states and resolvability are preserved. Other failures, including
authentication errors and uncertain or active commands, still reject the read.
The decision path is unchanged. No approval is recreated and no turn is replayed.

Compass verification is absent in this worktree; scoped source references from
the typed IPC handler, adapter exports and durable settings panel supplied the
call-path evidence. This source repair awaits the root-owned affected packaged
operation and is not a qualification receipt.
