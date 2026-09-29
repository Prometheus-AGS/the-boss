# Proposal

## Why

Teams settings currently plan and assign tasks but cannot execute them, inspect accounting, cancel runs, recover interrupted work or revoke a member. C09 requires an operator-visible path through authoritative UAR admission and ordinary agent execution.

## What Changes

- Add fixed typed IPC and scoped main-process adapters for execution, artifacts, admission, cancellation, recovery and member revocation.
- Extend the existing Teams surface with budget reservations, selected context, attempts, execution outcomes, actual usage and accounting uncertainty.
- Populate starter-team model selection from the current UAR and liter-llm catalogs. Install separate model-bound starter bindings while preserving planning bindings.
- Translate all controls and state feedback in the 13 existing renderer locales.

## Capabilities

### New Capabilities

- `uar-team-execution-administration`: Admit and control scoped team runs through The Boss settings, with authoritative budgets and observable results.

### Modified Capabilities

None.

## Impact

Shared IPC contracts, UAR main adapters, Teams settings components and renderer catalogs. UAR owns persistence, permission checks, reservations, artifacts and ordinary-agent dispatch; The Boss adds no persisted team state, database migration or new dependency.
