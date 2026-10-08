# Packaged reusable-team authoring operations

`operate-reusable-team-model-policy.mjs` uses the maintained isolated packaged
Boss launcher. This directory supplies procedures for real editor controls,
application IPC, catalog deployment, native team attempts and host approvals.
Source preparation is not runtime acceptance.

The reviewed-policy procedure takes `--selection <file>`: the actual supported
creator `models-select` result. It imports and explicitly accepts that result,
preserves a manual override in a separate immutable revision, and checks the
actual effective model identity. This procedure remains pending a valid reviewed
artifact when a selected custom model has no declared strength tier.

The independently selectable manual guidance procedure takes:

```text
node scripts/operate-reusable-team-model-policy.mjs --boss <checkout> --launcher <maintained-boss-launch.mjs> --output <new-receipt-directory> --guide <actual-guide-result.json> --template coding --guide-map implementer:worker,reviewer:reviewer
```

`--guide` requires an actual supported creator `guide` result with
`operation: "create"`, `ready: true` and complete `team.roles`. `--guide-map`
explicitly names the source roles and existing non-coordinator template members
the operator selected. Root supplies the reviewed guide artifact; this procedure
does not generate one. It accepts no `--selection` on this path. The existing
Coding preset and compiler retain their coordinator/worker/reviewer graph;
guide dependencies, ownership, skills and model policies remain planning data.

The procedure manually selects the exact configured gateway model for every
member and removes worker edit/write tool selections through the existing
editor. It saves the original named team before importing guidance, checks the
visible proposed mapping, explicitly selects and applies only the supplied
roles, and saves two subsequent immutable revisions. Application copies role
description/prompt only; the procedure checks retained model/tool/skill/knowledge
selections and unchanged unselected roles. It then deploys the saved package,
runs real readonly README work through normal Work controls and existing bounded
approval handling, reloads the renderer, and reopens the named saved revision.
Exact guide bytes, source/digest identity and prior revisions must remain intact.

The manual receipt reports requested strength-tier compliance as `unknown`,
reviewed-model-policy acceptance as `not-exercised`, and never claims full C15.1
completion. Effective-model support evidence concerns the actual transport/model
identity, not portable strength, pricing or requested policy compliance. Renderer
reload is not application process restart. Native Windows acceptance is separate.

Required inputs are the real signed packaged Mac app and matching source/payload
pins, a qualified existing team-execution profile, the actual guide artifact,
explicit mappings and the existing `BOSS_C15_GATEWAY_*` environment contract in
`io.mjs`. Credential values are read only in memory through the named environment
reference. Receipts retain source hashes, safe identities, requested tier names
and policy hashes; they do not retain the guide text, prompts or credential
values. The private authoring store retains the full guide result as designed.
The launcher owns its isolated application/runtime processes; external gateway
ownership remains external. The operation does not seed registries, bypass
approval, install suggested skills or infer native authority from role metadata.

The completed packaged boundary is root-owned. Do not run this procedure during
DTO, editor, compiler or packaged-source implementation.
