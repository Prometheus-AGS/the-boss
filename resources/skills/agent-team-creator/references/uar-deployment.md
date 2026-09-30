# UAR draft.2 authoring and deployment

This skill consumes the UAR collaboration profile
`urn:prometheus:uar:collaboration:0.1.0-draft.2` from the immutable provider commit
recorded in `schemas/uar/0.1.0-draft.2/consumer-source-receipt.json`. The versioned schemas under
`schemas/uar/0.1.0-draft.2/` are byte-identical provider data. Draft.1 schemas
and inline authoring remain available for explicit migration and are never
rewritten or relabeled.

Schema validity establishes document shape. It does not establish durable team
execution, current policy, a current representation grant, private credential
validity, or activation.

## File-backed authoring

Initialize a contained project workspace from `assets/uar-intake.json`:

```text
node <skill>/scripts/cli.mjs uar-workspace-init --input uar-intake.json
```

The `workspace` request field is a portable team ID. The creator owns only
`.agent-team/<team-id>/authoring`, and initialization requires
`expectedRevision: 0`. The resulting `workspace.json` persists a monotonic
revision, stable guided-question nodes and accepted answers, and identifies one
`manifest.source.json` plus separate
files such as `agents/coordinator.json`, `teams/root.json`,
`teams/review-subteam.json`, and `workflows/checkout.json`. Paths are relative,
case-insensitively unique, and confined beneath the selected project. Source
writes use same-directory atomic replacement and the existing
`.agent-team/recovery/` receipts.

Use one answer or document per update. Both require the current
`expectedRevision`; stale revisions fail before any file is written. The response
identifies the prior and current revision plus the changed question or document:

```text
node <skill>/scripts/cli.mjs uar-workspace-update --input update-one-document.json
node <skill>/scripts/cli.mjs uar-workspace-answer --input answer-one-question.json
node <skill>/scripts/cli.mjs uar-workspace-status --input workspace-status.json
```

Status returns fixed counts, one dependency-ordered question, and at most 50
field diagnostics. Supply its numeric continuation cursor to read the next page.
It does not embed the complete definition graph. The bundled
`assets/uar-workspace/` directory demonstrates a root team, several agents, a
permitted child, a nested subteam, and a workflow.

## Migration and validation

`uar-workspace-migrate` accepts the existing inline envelope, a schema-v1 flat
team, a legacy UAR AgentArtifact, or draft.1 package source. It preserves the
source as non-executable migration material after private-content checks and emits
field diagnostics with one of these dispositions:

- `exact`: the field retained its meaning and target value;
- `translated`: an explicit profile or carrier translation retained it;
- `optional-unsupported`: the original value remains inspectable but is not
  effective runtime behavior;
- `required-unsupported`: the requested semantics cannot be enforced, so build
  and deployment preflight refuse.

Skill `id`, `version`, `digest`, `required`, `config`, `entrypoint`, and
`requiredTools` are independent fields. Draft.2 validation applies provider
schemas first, graph checks second, and support diagnostics last. A valid package
has exactly one TeamDefinition entrypoint; member kinds match referenced document
kinds; coordinators name agent roles; child references name agents; workflow
roles exist in each accepting team; dependency graphs are acyclic; and every
reference resolves the exact version and digest.

Inline callers continue to use `uar-package-validate` and `uar-package-build`
with `package`. Workspace callers use the same commands with `project` and
`workspace`. Builds write a new immutable directory only.

## Immutable maintenance

Use `uar-workspace-revise` with `assets/revise-intake.json` to copy source into a
distinct, strictly greater semantic-version workspace. Supply explicitly edited
definition documents in `edits`; unchanged definitions retain their exact source
bytes and immutable tuples, while a changed dependency tuple propagates only
through definitions that reference it. The old workspace and compiled package do
not change. `uar-package-diff` compares two workspaces, two compiled directories,
or two inline envelopes by definition identity and JSON Pointer. Changed content
under the same package version is refused.

Rollback selects an already installed earlier package through a new private
binding revision. It does not rewrite package bytes or reverse external effects.

## Private authority boundary

Portable source, migration receipts, and compiled packages contain no credential
value, credential reference, RepresentationGrant record, consent evidence,
EffectiveBindingReceipt, or installed authority. Recognized private material
produces a field-level refusal before package files are written.

DeploymentBinding is separate private installed state. Its model credential,
storage connection, representation grant, and effective receipt fields contain
opaque host references only. UAR resolves current credentials, policy, grants,
and authority independently. Successful package installation alone confers none
of them.

## Live package and binding sequence

Every live command accepts an HTTP(S) base URL and optional
`env:VARIABLE` credential reference. The secret is read only for that request and
is never written into request JSON, source, package, binding output, or receipts.

Use this order:

1. `uar-capabilities`
2. `uar-package-preflight`
3. `uar-package-install`
4. `uar-package-status`
5. optional `uar-binding-preflight`
6. optional compare-and-swap `uar-binding-install`
7. `uar-binding-status`

The accepted provider checkpoint does not change the existing versioned routes:

| Command | UAR operation |
|---|---|
| `uar-capabilities` | `GET /api/v1/collaboration/capabilities` |
| `uar-package-preflight` | `POST /api/v1/collaboration/packages:preflight` |
| `uar-package-install` | `POST /api/v1/collaboration/packages:install` |
| `uar-package-status` | `GET /api/v1/collaboration/packages/{id}/versions/{version}` |
| `uar-binding-preflight` | `POST /api/v1/collaboration/deployment-bindings:preflight` |
| `uar-binding-install` | `POST /api/v1/collaboration/deployment-bindings` |
| `uar-binding-status` | `GET /api/v1/collaboration/deployment-bindings/{id}` with explicit workspace ID |

Package requests send the exact reviewed manifest string and definition byte map.
Binding requests send `x-uar-workspace-id` and an optional expected revision for
compare-and-swap. `uar-activate` always refuses because this authoring client owns
definitions and deployment rather than execution. Use The Boss or another
authorized host supporting the selected runtime's negotiated execution profile.

## Shared team instructions and cooperating-pair deployment

TeamDefinition may carry `instructions: {revision, digest, text}`. The revision is a positive safe integer, digest is SHA-256 of the exact UTF-8 text, and text is nonempty and at most 16384 UTF-8 bytes. Omit the object when no shared guidance is desired; null is not an omission. Shared guidance is below immutable host policy and above member specialization/task instructions. It cannot expand policy, credentials or resource grants. Peer messages, task input and artifacts remain attributed untrusted data.

Changing guidance requires a new immutable definition/package version and a revisioned private binding. Existing attempts retain captured evidence; do not rewrite history. Preserve exact member skill ID/version/digest/config/required/entrypoint/tool requirements through authoring, maintenance and export. Required unsupported context/history/memory/child declarations refuse runtime admission with field diagnostics; optional exclusions must remain visible. A nested definition graph is not proof of nested team execution.

For cooperation, explicitly install coordinator-to-worker trigger-turn and worker-to-coordinator queue-only result-disclosure edges. Sending queues a message; delegation explicitly requests work; waiting yields the live turn and creates a separate governed continuation. Do not infer reverse permission or automatic activation from a package receipt. Discover the execution profile and its peer-tools/shared-instructions/continuations capabilities before offering those runtime actions. Package/binding installation remains separate from activation, and this creator does not schedule agents.
