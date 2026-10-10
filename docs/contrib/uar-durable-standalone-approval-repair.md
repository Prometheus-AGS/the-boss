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
