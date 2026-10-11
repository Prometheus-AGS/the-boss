---
description: The Boss product and administration responsibilities for the Agent Fabric Convergence initiative
sources:
  - src/main/ai/runtime/uar/UarRuntimeDriver.ts
  - src/main/ai/runtime/uar/UarSidecarService.ts
  - src/main/ai/runtime/uar/UarToolApprovalController.ts
  - src/main/ai/runtime/uar/uarHostHistory.ts
  - src/main/ai/agentSession/AgentSessionRuntimeService.ts
  - src/renderer/pages/agents/AgentPage.tsx
  - src/renderer/pages/settings/PrometheusSettings/PrometheusSettings.tsx
---

# Agent Fabric Convergence: The Boss

## Status and dependency gate

This is a planning note for the `codex/agent-fabric-convergence` worktree at
`2b57fa0164a558fecaefa72ce5309445602fbfb7`. It does not alter the active UAR
Working Agent implementation or claim that multi-agent product behavior ships
today.

The Boss already has concrete UAR seams: a runtime driver, sidecar supervisor,
host MCP bridge, AG-UI adapter, tool-approval controller, host-history adapter,
agent-session runtime and renderer agent surfaces. The convergence work must
consume the accepted `D-UAR-P1` contract for those seams. It must not introduce
a second UAR process owner, approval writer, history writer or run executor.

Before implementation, the accepted P1 receipt must pin:

- sidecar ownership, identity, authentication and capability discovery;
- session/principal propagation and the difference between close, detach,
  cancel, drain and stop;
- approval identity, payload binding, decision persistence and post-wait
  revalidation;
- host versus UAR history ownership, run/session identifiers and recovery;
- the released binary/protocol revisions available on each supported platform.

Until that receipt exists, this repository may refine product language and map
read-only surfaces, but changes to the runtime, approval and history modules are
blocked.

## Repository responsibility

The Boss is the operator studio and desktop product surface. It should make the
fabric understandable without becoming another workflow engine.

The product model should distinguish a reusable definition, a deployment
binding, a logical instance, a team instance, a task, a run/attempt and an
external effect. The current agent page and session UI are the starting point.
Future views should project UAR-owned state and show effective runtime binding,
capabilities, owner, policy revision, budget posture, task dependencies,
subscription lag and failures. Controls should appear only when the selected
runtime reports the corresponding capability.

Administration belongs in two layers. The Boss owns cross-runtime inventory,
placement, health, approvals, task/run inspection and human override. A
BossFang-specific console remains owned by BossFang; The Boss may launch it in
an isolated site view with a narrow, instance-scoped handoff rather than copy
its domain administration.

The renderer remains a projection of durable state. Team definitions, grants,
task ownership, approval decisions and audit records must not live only in
React state. Main remains the trusted desktop boundary and the single writer
for the approval flow described in `docs/references/ai/tool-approval.md`.

## Product story

The first complete product story should let an operator select a reviewed team,
bind it to an accepted UAR instance, start one bounded workflow, inspect its task
graph and evidence, decide a correlated approval, cancel or detach with the
correct semantics, restart The Boss and reattach to the same durable truth.
That story should use the feedback-to-issue workflow from C10 before exposing a
general team builder. It exercises development and business work without
granting issue creation, publication or implementation authority merely because
a role is named “product manager” or “marketing lead.”

The studio should offer novice guidance and a single-agent option. A proposed
team should show why each role exists, its allowed output scope, required skills,
selected model evidence and estimated cost class before registration or launch.

## Personal context and human representation

An executive role template and a digital representation of a particular human
are different product objects. The Boss may render and administer both, but it
must require a private, issuer-verifiable representation grant before presenting
an agent as acting for a person.

The UI must show the represented person, organization assignment, data-use
scope, communication audience, allowed action classes, disclosure rule, expiry,
revocation and evidence revision. Simulation and drafting must be visibly
different from disclosed representation and delegated action. A model-generated
approval cannot satisfy a human-approval requirement, and a personal consent
grant cannot authorize an organization’s spending or publication.

Revocation and offboarding should prevent new access and effects while retaining
an inspectable record. Product copy must not promise deletion of information
already disclosed to an external recipient.

## Portable definitions and Codex as a reference harness

The Boss should consume versioned AgentDefinition, TeamDefinition,
WorkflowDefinition and DeploymentBinding artifacts after C03 accepts their
schema. Private RepresentationGrant records are installed authority and must not
be exported with portable packages. Skills remain versioned dependencies of a
role; installing a skill or agent file never grants runtime authority.

The locally inspected `codex-cli 0.154.0` is a useful implementation model: it
is a native arm64 executable, reports stable `multi_agent` and `goals` features,
exposes shared-daemon session browsing, and has explicit worktree, sandbox and
approval controls. The [official build instructions](https://github.com/openai/codex/blob/main/docs/install.md)
build the CLI from the `codex-rs` Cargo workspace. The Boss should learn from its separation of native session
execution, agent definitions, isolated workspaces and tool permission posture.
It should not copy Codex configuration as UAR state or treat Codex session IDs,
permissions or approvals as portable grants. Codex is one harness adapter; UAR
remains the runtime and Cedar remains the action authority.

## Non-goals

- Replacing the accepted P1 UAR driver, sidecar, session, approval or history
  contracts.
- Adding a second scheduler, workflow owner or run executor in Electron.
- Treating a role title, prompt, signature, plugin install or transport identity
  as authorization.
- Claiming live-session migration, exactly-once external effects, autonomous
  finance, or a persistent native team API before its owning contract exists.
- Reimplementing BossFang administration or storing private representation
  grants in portable team packages.

## Next repository-scoped KBD child

Create `agent-fabric-the-boss-studio-foundation` only after `D-UAR-P1` and the
C03/C04 definition-and-binding contracts are accepted. Its first slice should
own a precise set of existing agent/settings files and deliver a read-only
definition/binding/instance/run projection plus capability-gated controls using
the accepted driver. Team editing, workflow launch, observer administration and
human-representation UI remain later tasks gated by C09, C10 and C17. Acceptance
must exercise the installed The Boss process against the accepted UAR build and
prove that restart/reattach and approval authority still have one owner.
