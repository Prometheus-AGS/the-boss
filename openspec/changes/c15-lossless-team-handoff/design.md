# Design

## Context
The existing handoff is a schema-v1 private coordination packet stored atomically with task ownership. Full and mini share the same handoff source. Canonical KBD identity is already on linked tasks; the canonical CLI supplies status JSON. Memory outbox records already carry scope, provenance and publication receipts. See proposal.md.

## Goals / Non-Goals
Preserve selected provenance across a fresh harness context. Do not transfer sessions, credentials, private grants or task-completion authority; do not publish memories or run scripts while capturing references. No new memory store or UI.

## Decisions
Add an optional versioned provenance object to existing packets, leaving old records readable and immutable. Reuse the read-only canonical status/identity seam when linked and explicitly configured; record unknown/unobserved status otherwise. Hash explicitly selected source, evidence and Karpathy files read-only; retain path, length and digest, never their contents. For selected existing memory identities, retain scope, provenance, content hash and publication receipt identities, never content. Destination inspection reports current file identity matches/missing/changed and canonical observation independently from ownership acceptance; a hash match is not feature certification or authority. Preserve revision conflict checks and explicit acceptance. Reuse the same capture contract for any other handoff-producing entrypoint where applicable; otherwise expose its limited evidence rather than implying full provenance.

## Risks / Trade-offs
References are observations at capture time and can change afterward; inspect them at the destination and expose differences. Source paths are explicit private handoff data, not automatically portable paths. Optional memory/KBD availability is unknown, never fabricated. Current source file contents may be private: output only identities/hashes and do not copy bodies. No trust is granted through claims in a packet.

## Ownership and delivery
Implementation worker owns creator runtime/src changes and handoff reference/skill instructions in both source packs. Lead owns repository OpenSpec records, compiled payload generation, distribution metadata, Boss skill packaging and cadence/release. Separate operation writer owns only The Boss scripts/operate-team-handoff-provenance.mjs and its helper directory. No tests, compiler checks, operation or build until all production wiring is complete; lead then builds the real runtime payload and pnpm build:mac:arm64, launches and operates the packaged CLI. Existing 2.2.16 public builds remain frozen.
