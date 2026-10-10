# Adopt an existing historical publication

Use `publication adopt-historical` when an actual external release already exists and original candidate-specific publication debt must be reconciled. This command does not create an iteration, dispatch a publisher, upload bytes, run hooks, add delivery credit, or record installed acceptance. It records an external release once and appends an independent immutable link for each owed obligation. A second mapping to the same release is not skipped by release deduplication.

Run the command only after the complete implementation boundary and evidence review:

`node <skill>/scripts/cadence.mjs publication adopt-historical --root <state-directory> --input <packet.json> --command-id <stable-id>`

The normal state lock, command claim, replay signature, failed-command receipt and journal commit apply. Retry a successful command with exactly the same input and command ID. An interrupted claimed command remains unknown until the existing explicit command-recovery procedure resolves it. Evidence copies alone never grant publication credit. Keep the journal, archives, state and content-addressed evidence together when moving a run.

## Request

See [the schema](../schemas/historical-publication.schema.json) and [request example](../examples/historical-publication.json). Supply:

- `runId`, optional `expectedRevision`, nonempty `authorityRefs` and `reason`.
- `release:{id,version,targetId,publishedAt,sourceRefs,evidence}`. Use the actual published inputs, including relevant nested source pins. Every source entry has a repository and full commit revision. Version uses numeric major.minor.patch for target ordering. The stable release ID identifies the external release independently of any candidate or dispatch.
- `expectedPredecessor`: the exact current `publishedTargets[targetId]`, or explicit null for an untracked target. Inspect the actual externally advertised target before that first adoption; null is an accounting baseline, not proof that the target has never existed externally.
- `mappings:[{obligationId,candidateId,contentManifestDigest,evidence:{path,sha256}}]`. Each mapping names the original debt and its unchanged frozen identity. Use a separate scope proof for each obligation. Multiple mappings may be supplied together or in later commands using the same immutable release and the updated predecessor.

Evidence file references have `path` and lower-case SHA-256 of the exact original bytes. Absolute paths avoid working-directory ambiguity. The command reads and hashes each referenced file without running its producer or fetching a URL. Copies of every envelope and cited original proof are preserved under `artifacts/historical-publication/<sha256>`; state records retain both original and preserved paths. Imported envelopes are authority-backed factual statements: hashes establish byte identity, not truth of arbitrary prose. The owner must review that the original evidence establishes each stated claim.

## Evidence envelopes

Every normalized JSON envelope has `schemaVersion:1`, `kind`, `status:"success"`, `releaseVersion`, exact actual release `sourceRefs`, original observed `verifiedAt` and nonempty hashed `evidenceRefs`. Cite existing producer receipts, immutable source/applicability proof and logs. Preserve older receipts with their original version, source and timestamp: the envelope explains applicability to the published release; it must never rewrite a failed or incomplete operation as successful.

- `source`: the common fields, citing immutable source provenance.
- `build`: `startedAt`, `finishedAt`, `artifacts:[{platform,sha256},...]` identifying actual built bytes.
- `launch`: `startedAt`, `finishedAt`, `artifact:{platform,sha256}`.
- `feature`: the launch fields plus observed `operationId` and `outcome`. Launch and feature must identify the same built artifact; build finishes before launch starts, and feature starts after launch starts. Local operated bytes may differ from separately notarized public installers, but their actual source identity and applicability must be evidenced explicitly.
- `platform`: `platform`, `architecture`, nonzero byte `size`, `sha256`, HTTP(S) `url`, accurate `signingStatus` (signed, unsigned, unknown or ad-hoc). Cite complete downloaded-byte provenance. Supply one envelope per published platform.
- `metadata`: actual full `commit` and HTTP(S) `url`.
- `website`: exact configured `url`, actual `deploymentId`, and `links:[{platform,url,sha256,size,version},...]` matching all platform receipts.
- `scope-coverage`: original `candidateId`, `contentManifestDigest`, exact original `candidateSourceRefs`, and `coverage:[{kind,id,basis,reason,evidenceRefs},...]`. Include every original obligation task, change, phase and outcome. Each entry has kind tasks/changes/phases/outcomes, basis observed-operation/source-applicability, an explicit reason and hashed scope proof. A Git ancestor, unscoped build or broad completion claim alone does not establish retained functional scope. Pending customer criteria remain pending; linking a publication does not qualify additional criteria.

All required platform, metadata and site effects must be covered for each debt. Changed hashes, identities, immutable release/link contents, omitted scope, conflicting duplicate mappings, superseded debts, unresolved attempts, stale predecessors and backwards published targets are refused. A fulfilled debt may be replayed only through its unchanged historical link. Same-version normal corrective publication retains its separate authority requirement.

`publishedAt` is original external publication time. Envelope operation times and verification times remain original observations. External-release and link `recordedAt` are the time of this accounting action; debt `fulfilledAt` is accounting fulfillment time. Original due times, iteration clocks, outcomes, failed history, delivery count, publication parity and installed acceptance are untouched.

## Completed-boundary operation

[operate-historical-publication.mjs](../examples/operate-historical-publication.mjs) exercises the real CLI on disposable copies of an existing run with a reviewed evidence packet. It checks independent links to one release, command replay, mismatch/incomplete/conflicting/backwards refusals and preserved counters/clocks/acceptance. Run it only at the completed skill delivery boundary. It never adopts into the source state directory; supplied evidence and original state remain read-only.
