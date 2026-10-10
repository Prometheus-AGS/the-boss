## Why

A newly created UAR agent can inherit an OAuth-only Boss model. The first run then fails in The Boss with `Provider "OpenAI Codex" has no API key configured` before UAR receives a request. Users need to choose the model that UAR will actually execute, including models served by their configured liter-llm gateway.

## What Changes

- Add an explicit UAR inference-source and model choice to Boss-owned agent creation and editing, driven by live gateway and UAR catalogs.
- Preserve working legacy API-key routes, but require a repairable choice when an inherited route cannot run through UAR.
- Show the effective UAR model and actionable connection/credential states; direct catalog-owned agents to the UAR catalog policy editor.
- Keep selected model validation bound to the UAR instance used by the session.

## Capabilities

### New Capabilities

- `uar-executable-model-assignment`: UAR agent model selection, persistence, execution authority, and truthful presentation through The Boss.

### Modified Capabilities

None.

## Impact

The Boss agent create/edit UI, UAR model-source projection and run preflight, conversation model label, and all existing renderer locales. The existing agent configuration and IPC schema already carry `uar_model_assignment`; no UAR protocol, database migration, or dependency change is required.
