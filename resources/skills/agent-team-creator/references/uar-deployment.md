# UAR collaboration packages and deployment

This skill implements the catalog portion of the official UAR collaboration Draft
0.1.0-draft.1. The canonical schemas are copied under `schemas/uar/`; the
authoring envelope is `schemas/uar-package-authoring.schema.json`. Catalog
installation does **not** create a TeamInstance, schedule a task, start a run, or
grant authority. Durable team activation belongs to implementation phase I2.

## Authoring an immutable package

An authoring request contains `manifest` and `definitions`. Definitions are
complete AgentDefinition, TeamDefinition, or WorkflowDefinition documents with
their top-level `contentDigest` omitted. Immutable references may omit `digest`
while authoring, but must include exact `id` and `version`. The compiler:

1. resolves every permitted child, team member, and allowed workflow inside the
   same package;
2. rejects dependency cycles, unresolved identities, and conflicting supplied
   digests;
3. computes each definition digest from RFC 8785 canonical JSON with only the
   top-level self digest omitted;
4. writes exact UTF-8 definition files with byte digests;
5. builds the PackageManifest file inventory and complete dependency lock; and
6. computes the package content digest.

The author supplies every required semantic field from the canonical schemas.
That includes complete skill ID/version/digest/required/config values, model
capability requirements, context selection and requested limits. A copied skill
name or a preferred model string is not an immutable UAR dependency.

```text
node <skill>/scripts/cli.mjs uar-package-validate --input package-request.json
node <skill>/scripts/cli.mjs uar-package-build --input package-request.json
```

`uar-package-build` also requires `"out": "<new-directory>"`. It writes
`manifest.json` last. Existing output directories are refused. Live preflight
and install preserve that exact manifest UTF-8 string and send definition files
as an exact `{path: contentUtf8}` map; they never reserialize reviewed bytes.

## Versioned maintenance

Treat an installed package version as immutable. Create a replacement authoring
request with the same package ID and a new semantic version, then compare it
before building:

```text
node <skill>/scripts/cli.mjs guide --input revise-intake.json
node <skill>/scripts/cli.mjs uar-package-diff --input package-diff.json
```

The diff request is `{"before": <authoring-package>, "after":
<authoring-package>}`. It reports added, removed, and JSON-pointer changed fields.
Changed content under the same package version is refused. Removing or changing a
member does not rewrite runtime history; active membership drain/cancel decisions
belong to I2 administration.

## Connection and authentication

Every live command accepts:

```json
{
  "connection": {
    "baseUrl": "http://127.0.0.1:1906",
    "credentialRef": "env:UAR_TOKEN"
  }
}
```

Only `env:VARIABLE` credential references are accepted. The secret is read for
the current request, sent as a Bearer token, and never included in request JSON,
receipts, package files, bindings, errors, or command output. A base URL cannot
contain user information, query parameters, or fragments.

## Capability, package, and binding lifecycle

Use the operations in order:

I1 advertises `collaboration_definition_packages_v1` and
`collaboration_deployment_bindings_v1`. Require only the capability used by
the requested operation. Neither capability implies durable team execution.
The authenticated capability response also returns `bindingOwnerId`; copy that
opaque value into `DeploymentBinding.ownerId`. Do not derive an owner ID from a
token subject or from the runtime's private persistence-key format.

| Command | UAR operation |
|---|---|
| `uar-capabilities` | `GET /api/v1/collaboration/capabilities` |
| `uar-package-preflight` | `POST /api/v1/collaboration/packages:preflight` |
| `uar-package-install` | `POST /api/v1/collaboration/packages:install` |
| `uar-package-status` | `GET /api/v1/collaboration/packages/{id}/versions/{version}` |
| `uar-binding-preflight` | `POST /api/v1/collaboration/deployment-bindings:preflight` |
| `uar-binding-install` | `POST /api/v1/collaboration/deployment-bindings` |
| `uar-binding-status` | `GET /api/v1/collaboration/deployment-bindings/{id}` with explicit workspace ID |

Package preflight/install requests name `packageDirectory`, `commandId`, and
optionally `expectedCatalogRevision`. The client re-verifies file and canonical
digests before sending `{commandId, expectedCatalogRevision?, manifest:
<exact UTF-8 string>, files: {<path>: <exact UTF-8 string>}}`.
Install all package definitions atomically; do not fall back to a sequence of
legacy `POST /api/agents` calls.

Binding preflight/install requests carry `commandId`, optional
`expectedRevision`, and the complete approved DeploymentBinding. The compiler
fills or verifies its content digest and sends `binding.workspaceId` as
`x-uar-workspace-id`. Binding status requires an explicit `workspaceId` input
and sends the same header. Model credentials, storage connections, and other
private resources appear only as protected host references. A binding authorizes
nothing by itself; UAR derives the authenticated owner and evaluates current
policy. Structured failures read `error.messageKey`, `error.code`, and
`error.detail` so operator recovery information is not discarded.

All successful command results include `catalogOnly: true` and an activation
refusal. `uar-activate` always fails with the I2 boundary. This prevents a
catalog receipt from being mistaken for a running team.
