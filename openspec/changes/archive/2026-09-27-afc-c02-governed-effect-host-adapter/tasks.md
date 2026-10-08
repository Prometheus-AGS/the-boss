# Tasks

## 1. Host contract

- [x] 1.1 Accept and validate the additive UAR authority envelope without changing the sidecar protocol family.
- [x] 1.2 Bind preparations, receipts, claim revalidation, and managed MCP dispatch to `authorityRevision` and the canonical payload.

## 2. Authority providers

- [x] 2.1 Add the `evaluate`, `decide`, and `revalidate` provider abstraction.
- [x] 2.2 Implement the trusted-session local provider while preserving current host disposition and approval behavior.
- [x] 2.3 Implement the protected Flint Gate adapter and refuse unverifiable governed requests.

## 3. Protected configuration

- [x] 3.1 Add provider selection and credential-free endpoint configuration to the UAR integration schema.
- [x] 3.2 Store the Gate credential in protected main-process storage and keep it out of renderer snapshots and logs.

## 4. Phase gate

- [x] 4.1 At the completed AFC C02 boundary, exercise local and Gate-backed direct, managed, embedded, and actor paths with unavailable authority, forged identity, revoked approval, and changed payload. No partial gate runs during implementation.
