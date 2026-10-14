# C14.2 approval and lifecycle administration

Prerequisite repair and consumer wiring for the approved initiative `afc-c14-studio-administration-and-isolated-service-consoles`, task C14.2. Cadence work-ahead `c14-approval-lifecycle-after-c15-20261006`; canonical KBD still selects C14.1. This does not claim whole-task completion.

The existing broker consumes an approval waiter without retaining its authoritative decision. Two clients cannot reread that decision after resolution or reopening. Preserve the existing broker and admission authority; persist its issuer-scoped challenge and one authenticated decision. Add readable consumer views, local observation detach/reattach and explicit executor stop through existing cancellation. No scheduler, new lifecycle endpoint, dependency or payload changes.
