# Spec Delta

## Purpose

Preserve the originating UAR approval identity through The Boss decision and inspection paths so a displayed request cannot authorize a different pending effect.

## ADDED Requirements

### Requirement: Approval events carry exact identity
The client SHALL require a nonempty approval identity from the originating runtime event before exposing a decision or recording host approval. It MUST NOT substitute a tool-call, admission or run identifier for that identity.

#### Scenario: Legacy or malformed event
- **WHEN** an approval event lacks a nonempty approval identity
- **THEN** the client reports an actionable incompatibility, presents no approval decision and records no host approval or root approval response.

### Requirement: Decisions retain originating identity
Every root decision SHALL submit the exact identity retained from its originating event. Reconnect, user unavailability, rejection and edited-input handling MUST NOT look up or implicitly select a newer pending approval.

#### Scenario: Approve or deny a displayed request
- **WHEN** the user decides a valid pending request
- **THEN** the root response contains that request's exact approval identity and the existing authenticated owner/run binding remains intact.

#### Scenario: No user response is available
- **WHEN** a valid request arrives without an available user decision surface
- **THEN** the existing rejection path sends false with that originating identity rather than a run-only response.

#### Scenario: Reconnect and edited input
- **WHEN** a request is replayed after reconnect or the user submits edited arguments
- **THEN** replay retains the same identity, and changed arguments are not approved under the original prepared request.

#### Scenario: Stale response or cancellation
- **WHEN** a response is stale, foreign, repeated or arrives after cancellation
- **THEN** it cannot authorize a replacement pending effect or revive a cancelled effect, and a legitimate pending request remains usable after a rejected foreign decision.

### Requirement: Pending inspection preserves approval identity
Owner-scoped pending inspection SHALL expose the exact runtime approval identity separately from admission and invocation references. Host-only records MUST NOT invent a runtime approval identity.

#### Scenario: Pending record inspection
- **WHEN** the client projects a valid pending runtime record
- **THEN** its approval identity survives unchanged and is not replaced by the record's admission reference.

### Requirement: Strict cutover is explicit
Owned callers SHALL migrate with the strict provider checkpoint. Legacy run-only clients MUST remain explicitly incompatible after cutover; no implicit trusted-local exception is permitted.

#### Scenario: Unsupported installed or external caller
- **WHEN** a legacy caller sends a run-only decision after cutover
- **THEN** the strict endpoint refuses it without an effect and the delivery receipt identifies the exact supported source/payload checkpoint rather than claiming all installed versions compatible.

### Requirement: Host claims precede effects once
The existing host boundary SHALL retain one claim before each prepared effect. Ambiguous completion MUST remain unknown and MUST NOT be automatically replayed.

#### Scenario: Concurrent duplicate claims
- **WHEN** two calls race for the same authorized prepared invocation
- **THEN** no more than one reaches the safe effect and the other receives an explicit unavailable or already-claimed result.

#### Scenario: Lost effect response
- **WHEN** the effect may have completed but its response is lost
- **THEN** the invocation is not claimed again, remains unknown until authoritative reconciliation, and reconnect cannot repeat the effect.
