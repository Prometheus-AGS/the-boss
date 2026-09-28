## Context

See `proposal.md` and the KBD child `uar-liter-inference-routing`. The persisted configuration already accepts `uar_model_assignment` with `boss`, `gateway`, and `uar` variants. The create wizard omits it; the runtime therefore falls back to the generic Boss model. The gateway source projection already reads served aliases from liter-llm, and UAR already accepts a trusted host credential/model binding.

## Goals / Non-Goals

**Goals:** Use the existing assignment and source contracts end to end. Preserve working legacy agents. Keep effective-model presentation truthful and secret-safe.

**Non-Goals:** Codex OAuth delegation into UAR, a new model gateway, a database migration, or UAR protocol changes.

## Decisions

1. **Selection is explicit for new UAR agents.** Extend the shared create wizard and create-command mapper with a UAR assignment field. Prefer an operational liter alias, then an operational direct UAR model. If neither is available, show configuration actions and prevent creation of an agent that purports to be ready for inference. An explicit compatible Boss API-key route remains available. The ordinary Boss model field remains for its existing data contract, but does not override UAR execution.
2. **Repair existing Boss-owned agents in the shared edit flow.** Add the same source/model control to the edit dialog and autosave diff. Keep no-assignment legacy agents executable if their Boss route meets the actual host credential contract; otherwise show repair before dispatch. Do not write an inferred assignment merely by opening the dialog.
3. **Respect catalog authority.** Catalog-owned agents display their UAR catalog model and open the existing catalog policy editor. Their Boss-side model field cannot be treated as an execution control.
4. **Validate against the execution connection.** Gateway choices use the configured gateway's live alias list and protected key; direct UAR choices use the instance selected for the session, not an unrelated default instance. The runtime retains the final preflight because a source can change after UI selection.
5. **Project effective identity to conversation UI.** The UAR runtime connection already resolves source/model. Surface that identity through the existing session status/model presentation contract rather than a second mutable UI store. All new user-facing strings enter the existing locale catalogs.

## Risks / Trade-offs

- A model advertised by `/v1/models` can still fail upstream inference → only a real completed response proves operation; show its actionable returned error.
- A source changes after selection → perform final runtime preflight and keep the stored user choice intact for repair.
- Catalog-owned and Boss-owned agents can look similar → base edit authority on the persisted catalog-link authority, not a label or runtime type alone.
- A session pinned to a different UAR instance can have another model catalog → use the bound instance for run-time validation and clearly label current versus default instance.

## Migration Plan

The schema already supports the new assignment. Existing rows remain unchanged. On read, a valid legacy Boss API-key route keeps working; an unusable inherited route presents a repair action. Rollback leaves existing explicit assignments intact and remains compatible with the prior runtime resolver, although older UI would not expose editing them.
