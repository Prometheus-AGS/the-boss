# Team manifest and CLI

The portable manifest describes intent and coordination. It is not a native team
API, a scheduler, an authentication credential, or a Cedar policy. The native
harness remains the execution and permission authority.

## Minimum expert request

Save this as `team-request.json` in the target project. Paths in requests resolve
against the CLI working directory. Keep state in a local, access-controlled
directory; it contains prompts, evidence and optional memory content.

```json
{
  "state": ".agent-team/state.json",
  "team": {
    "schemaVersion": 1,
    "id": "feature-team",
    "outcome": "Implement the agreed feature and supply integration evidence",
    "scope": "project",
    "harness": "codex",
    "roles": [
      {
        "id": "implementer",
        "description": "Implement the agreed feature",
        "prompt": "Read the project instructions and acceptance criteria. Implement the complete behavior before verification. Report changed files and evidence.",
        "skills": [],
        "owns": ["src/feature/"],
        "inputs": ["Acceptance criteria"],
        "outputs": ["Implementation", "Integration evidence"],
        "dependsOn": [],
        "modelPolicy": { "tier": "medium", "capabilities": ["function_calling"] }
      }
    ]
  }
}
```

`scope` chooses project, UAR or BossFang administration intent. It does not select
a network instance or transfer execution authority. `harness` is one of the eight
execution targets. BossFang is a separate export target; it may coordinate UAR or
its own native runtime as configured outside this skill.

Role IDs are stable portable lowercase identifiers. Role inputs/outputs describe
the handoff contract; `dependsOn` is validated for references and cycles. Native
runtime dependency behavior varies; portable dependencies also gate local tasks.
`owns` is a planning agreement, not an enforced filesystem permission. Assign
disjoint write ownership before parallel work, and let reviewers read broadly.

## Model binding

Optional `modelPolicy` exists on the team and each role. `skillPolicies` maps
installed skill IDs to the same policy shape. Tasks can provide `modelPolicy`.
Fields: `model`, `tier` (`low`, `medium`, `hard`), `capabilities` (string array),
`maxInputPerMillion`, `maxOutputPerMillion` (nonnegative USD estimates).

Use `models-select` before invocation; tier/cost/capability intent is not itself
a native model ID. The exporter translates explicit team/role `model` values
where supported. Skill/task policy selection must be applied through the native
invocation controls, or by updating an appropriate role and re-exporting.

## Preserving every native option

The common schema deliberately does not enumerate every native harness setting.
Use the complete current native documentation linked from `native-harnesses.md`:

- `roles[].native.<target>` overrides that role's generated native fields.
- `native.<target>.options` supplies target-specific settings or defaults. Its
  meaning is explicit in the adapter reference; some targets preserve it in
  `native-options.json` for manual application rather than inventing a config path.
- `native.<target>.files` maps relative paths to exact UTF-8 text for native hooks,
  MCP settings, plugin source, profiles, configuration or other options.
- Each team-native wrapper includes `source` and `version` recording the contract
  the user chose. Native role overrides and the built-in source contract are
  retained in the export receipt too.

Example extension inside `team`:

```json
{
  "native": {
    "codex": {
      "version": "installed version recorded by operator",
      "source": "https://developers.openai.com/codex/config-reference/",
      "options": { "agents": { "max_threads": 4 } },
      "files": { ".codex/team-notes.md": "Project-specific native configuration notes\n" }
    }
  }
}
```

Unknown common fields fail to prevent silently misspelled configuration. Native
options are preserved without claiming their semantic validity. Objects merge
recursively and arrays replace. JSON `null` cannot be serialized to TOML; omit
the field or supply a separate native file. Native file paths cannot escape the
proposal root, use Windows-reserved names, or collide with generated files,
case variants or directories. Generated files cannot be silently replaced by
opaque files. Change supported fields through role/options overrides, or author
an independently reviewed native file outside the automatic export path.

The generated receipt identifies source-only versus live verification. Validate
against the installed version before applying options. Do not commit real
credentials in any native file; use the target's environment/credential facility.
This escape hatch preserves future options; it does not assert future support.

## CLI protocol

All commands use one UTF-8 JSON request and return JSON. Malformed requests and
conflicts exit nonzero. No shell quoting or shell-specific redirection is needed:

```text
node <skill>/scripts/cli.mjs <command> --input request.json
```

| Command | Request |
|---|---|
| `guide` | `operation=create|author|revise|deploy`; `author` reads `project` plus `workspace` and returns one next question with bounded status. Create remains the default for schema-v1 callers. |
| `validate` | `team` manifest |
| `init` | `team`, new `state` filename |
| `status` | `state` |
| `team-update` | `state`, `expectedRevision`, replacement same-ID `team` |
| `export` | `team` or `state`, `target`, new `out` directory |
| `task`, `complete-kbd` | See `task-handoff.md` |
| `handoff-create`, `handoff-accept` | See `task-handoff.md` |
| `models-discover`, `models-select` | See `models-memory.md` |
| `memory-queue`, `memory-publish` | See `models-memory.md` |
| `uar-workspace-init` | `project`, portable team ID in `workspace`, `expectedRevision: 0`, package identity/version, and declared source paths; state is written under `.agent-team/<team-id>/authoring`; `source` may instead carry an inline, flat-team, AgentArtifact, or draft.1 migration input |
| `uar-workspace-migrate` | Same request as workspace initialization, with `source` or a contained compiled `sourceDirectory`; writes a field-level migration receipt beside the source documents |
| `uar-workspace-status` | `project`, `workspace`, optional numeric `cursor` and `pageSize` from 1 through 50 |
| `uar-workspace-answer` | `project`, team ID in `workspace`, current `expectedRevision`, stable `questionId`, and one `answer` value |
| `uar-workspace-update` | `project`, team ID in `workspace`, current `expectedRevision`, one declared relative `path`, and one identity-preserving `document` object |
| `uar-workspace-revise` | `project`, source and destination team IDs in `workspace` and `out`, current `expectedRevision`, strictly greater `nextVersion`, and optional explicit definition `edits` |
| `uar-package-schema-info` | Empty request; reports the accepted profile and provider source revision |
| `uar-package-validate` | Existing inline `package`, or `project` plus `workspace`; draft.1 inputs migrate explicitly |
| `uar-package-build` | Inline `package` or selected workspace, plus a new `out` directory |
| `uar-package-diff` | Inline `before`/`after`, compiled `beforeDirectory`/`afterDirectory`, or `project` with `beforeWorkspace`/`afterWorkspace` |
| `uar-capabilities` | `connection` with base URL and optional `env:VARIABLE` credential reference |
| `uar-package-preflight`, `uar-package-install` | `connection`, `packageDirectory`, `commandId`, optional `expectedCatalogRevision` |
| `uar-package-status` | `connection`, `packageId`, `version` |
| `uar-binding-preflight`, `uar-binding-install` | `connection`, `commandId`, complete `binding`, optional `expectedRevision` |
| `uar-binding-status` | `connection`, `bindingId`, explicit `workspaceId` |
| `uar-activate` | Always refuses; the accepted draft.2 checkpoint does not claim durable team runtime conformance |

Native harness exports are proposals, never in-place installation. If a write fails partway,
the incomplete directory remains inspectable and lacks its final receipt. Choose
a new output directory for a retry. UAR collaboration commands are the deliberate
exception: after capability and package preflight they install an atomic immutable
catalog package and optional private deployment binding through the routes in
`uar-deployment.md`. Package installation confers no private authority. They never
activate or execute a team.

## Building and distributing

`runtime/package.json` pins TypeScript 7.0.2 and Node type declarations. Run
`npm ci --prefix <skill>/runtime` then `npm run build --prefix <skill>/runtime`
when maintaining source. Runtime consumers need only Node.js 22+ and the copied
skill files; they do not need npm, TypeScript or the repository checkout. Full
and mini distribute identical source and emitted `.mjs` files. Each sibling skill
declares its dependency on this creator companion in its instructions.

The four SKILL.md frontmatters follow the
[AgentSkills specification](https://agentskills.io/specification): version and
comma-separated tags live as string-valued metadata. Existing pack extensions
remain accepted for backward compatibility but are not required by these skills.
