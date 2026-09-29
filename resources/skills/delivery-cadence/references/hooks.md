# JavaScript completion hooks

Hooks run only for durable `iteration:after` or `publication:after` events. A timed
checkpoint is not an iteration-completion event. Hooks are invoked by the existing
cadence command path; they do not install a background scheduler.

Use the skill's CLI prefix followed by these commands:

```text
hooks scaffold --template local-summary --output ./after-delivery.mjs
hooks add --id summary --script ./after-delivery.mjs --env CADENCE_SUMMARY_DIR --idempotency
hooks list
hooks disable --id summary
hooks enable --id summary
hooks remove --id summary
hooks retry --receipt <receiptId>
```

Scaffolding creates a file, refuses an existing destination, and leaves it
unregistered and disabled. Registration is the explicit trust and enable action.
Configure the script and required environment variables before registration.
Re-register with the same ID to trust changed bytes as a new revision. Enable does
not trust changed bytes. Remove preserves a disabled tombstone and all receipts.

Options: `--events iteration:after,publication:after`, `--outcomes success`,
`--timeout-ms 30000`, `--on-failure warn|error`, `--env NAME,OTHER_NAME`, and
`--idempotency`. Defaults are iteration completion, success outcomes, 30 seconds,
warning on failure, and no automatic assumption of external idempotency. Supported
outcomes are `success`, `failed`, and `cancelled`. The `error` failure policy returns
a blocked hook result; it does not undo completed implementation or publication.

## Module interface

```js
export default async function run(event, context) {
  context.signal.throwIfAborted();
  // context.env contains only registered variable names.
  // Use context.idempotencyKey with a receiver that actually deduplicates it.
  return { status: 'succeeded' };
}
```

`event` is a versioned JSON completion envelope with stable `id`, `type`, run and
iteration IDs, outcome, occurrence time, source references, scope, completion,
artifacts and metrics. Context supplies an AbortSignal, the stable idempotency key,
and declared environment values. Cancellation is delivered inside the child;
subprocess trees are terminated after a brief cancellation opportunity.

A handler may return `{ status: 'failed', effects: 'none' }` only when it knows no
external effect occurred. Exceptions, timeouts, interrupted executions and ambiguous
provider results produce `unknown` receipts. Such receipts require explicit retry
and a registered idempotency contract. Set `--idempotency` only when the receiver
actually honors the stable key; sending a header alone does not establish that.

## Evidence and security

The registry records ID, primary script SHA-256, revision, environment variable
**names**, filters and policies. Every dispatch checks the primary script digest.
Imported modules are not independently pinned. JavaScript hooks run with full user
privileges: this is not a sandbox. Only register trusted code. Registration is
permission for that handler's configured effects, including email recipients or
webhook destinations; it is not permission for unrelated messages.

Children receive minimal system environment plus explicitly named variables;
`NODE_OPTIONS` and unrelated credentials are not inherited unless explicitly named.
Hook source gets event data, so choose recipients with that disclosure in mind.
Secrets belong in environment variables or your external secret store, never in
profiles, event payloads, CLI flags, or hook return values.

Receipts under `<cadence-root>/hooks/receipts/` use event ID + handler ID + revision.
States are `scheduled`, `running`, `succeeded`, `failed`, and `unknown`. Successful
receipts are never replayed. Failed and unknown executions are never automatically
retried. Receipts retain structured status/reason and the original non-secret event,
not stdout, stderr, exception text, provider response bodies or arbitrary returned
objects. Registry and receipt files use private file mode where supported. Hooks
execute serially under the command owner's lock.

## Templates

- `local-summary`: requires `CADENCE_SUMMARY_DIR`; writes one summary per stable key
  with collision refusal. Safe to declare idempotency.
- `webhook`: requires `CADENCE_WEBHOOK_URL`; optionally declare
  `CADENCE_WEBHOOK_TOKEN`. Sends the event over HTTPS with an idempotency-key header.
- `email-api`: requires `CADENCE_EMAIL_API_URL`, `CADENCE_EMAIL_API_TOKEN`,
  `CADENCE_EMAIL_FROM`, `CADENCE_EMAIL_TO`. Sends a short completion message over
  HTTPS. Adapt the JSON body to the chosen provider before registration.

Scaffolding or adding source to a repository sends no email. Outbound handlers run
only after explicit registration and an eligible completion event.
