# Task model selection

Use this protocol when drafting or revising KBD plans and when executing a legacy plan without assignments. It is an authored planning contract, not a runtime schema or a new launcher.

## Analyze before assigning

1. Draft the concrete tasks and backend identities before choosing models. For each task assess reasoning difficulty, uncertainty, affected scope, required tools, context size, modalities, and any reviewer independence requirement. Assign every concrete task, including final integration and review work; an assignment does not authorize early verification.
2. Inspect explicit user selections, project model policies and budget constraints. Within those constraints, prefer demonstrated task suitability; cost and latency break close ties. Record policy-constrained tradeoffs. Do not infer capability from a model name or use a permanent best-model ranking.
3. Discover the active harness version, exposed models, configured providers, supported reasoning controls and documented worker-launch tools. Consult current authoritative documentation and local configuration without copying credentials. Distinguish a catalog listing, configured access, and a verified execution route. Optional model-discovery helpers provide candidates; their cheapest-first selector must not override this quality-first default.
4. Compare viable models against the task requirements using dated evidence (local results or authoritative capability documentation). Label weak, stale or missing evidence and unsupported reasoning controls explicitly. A provisional recommendation is allowed; unknown availability remains unresolved rather than being reported as working.

## One source of truth in plan.md

Write one **Task model assignments** table in the active phase plan. Use separate columns for the full phase path, change ID and exact backend task ID; together these form the assignment key. A bare ordinal such as 1.1 is not unique across changes or nested phases.

| Phase path | Change ID | Backend task ID | Requirements | Provider/model | Reasoning effort | Rationale and dated evidence | Harness and route | Worker launch and handoff | Native alternative | Availability and verification | Prerequisites |
|---|---|---|---|---|---|---|---|---|---|---|---|
| <full phase path> | <change ID> | <backend ID> | <reasoning, uncertainty, scope, tools, context, modalities, independence> | <concrete provider/model> | <supported setting or unsupported/unknown> | <task fit, source/date, limits> | <harness/version; native or liter-llm> | <documented mechanism; scope, working directory, tools, skills, result destination> | <best viable native model if different; otherwise same or none> | <configured/verified/unresolved and evidence> | <missing access, compatibility or launcher> |

Keep task titles and checkbox syntax unchanged. In each OpenSpec tasks.md or native KBD change artifact, add a non-task prose reference to the phase plan and the matching scoped assignment entries. Do not put model metadata into checkbox titles, generate synthetic tasks for table rows, or replace canonical runtime task IDs with table keys. Reconcile emitted tasks against assignments before handoff: every task has exactly one current scoped entry, and changed, split, removed or renumbered tasks have no stale current entries. Use the backend and existing canonical identity resolver when its exposed ID differs from a displayed ordinal.

## Harness-specific discovery

| Harness | Required discovery before claiming the route is usable |
|---|---|
| Codex | Inspect exposed model choices and supported fresh-agent model/reasoning overrides. Respect model inheritance for forked agents; do not promise an override the current tool schema forbids. |
| Claude Code | Check the installed subagent model controls, provider configuration and required protocol. A liter-llm route must support the protocol used by that worker, not merely list the model. |
| OpenCode | Resolve concrete provider/model identifiers against configured providers and actual per-agent or per-invocation controls. |
| DeepSeek Harness | Inspect installed provider and agent controls. Global model/provider settings do not prove that individual team members can use distinct models. |
| Kimi Code | Discover installed secondary-model pools and invocation controls. Do not use model frontmatter when that harness ignores it. |

The current harness need not support all five. Record evidence for the selected harness and route, and label other harness support documentation-verified or unavailable as appropriate. Refresh assignments when work moves to another harness.

## Native and external execution

Prefer native execution of the selected model where supported. If the best suitable model is not native, describe liter-llm inference plus an existing documented tool-enabled worker launcher. Use an actually exposed liter-llm MCP chat tool or its documented OpenAI-compatible chat/completions endpoint after discovering the installed interface and protocol support. Discover the launcher tool schema or installed CLI documentation at runtime and record the actual invocation mechanism. Never invent a launch_agent tool, assume a liter-llm complete command exists, or equate an inference response with workspace execution.

The worker contract names the task scope, working directory, required tools and skills, concrete model route, and result handoff. The active KBD driver retains begin/end task ownership and canonical completion updates; worker results return to it as evidence, not a competing task ledger. If the current agent itself can execute the selected model route, document that supported mechanism rather than requiring a new process.

Planning records prerequisites without launching workers, changing provider configuration, starting services or exposing credentials. Missing models, credentials, gateway compatibility or worker launchers leave the route unresolved. Record the best viable native alternative separately; it is not permission to silently substitute that model. A changed selection must be explicit and recorded with its rationale, respecting user constraints. Independent eligible tasks may continue while a route is unresolved.

## Execution and revisions

Before dispatch, resolve the exact task key and recheck the selected route against current availability and policy. Copy the scoped assignment reference and actual route into execution.md and the worker handoff. If a task, harness, model catalog or capability evidence changes materially, update the assignment before dispatch. Legacy plans remain usable: perform this analysis at execution time and record the explicit selection before running the task. Unresolved routes are not completed work.

Model assignments do not change final-integration timing, review independence requirements, existing backend parsing, task identity resolution, or KBD completion ownership. Keep reviewers dormant until the complete production delivery boundary; report only the routes actually exercised.
