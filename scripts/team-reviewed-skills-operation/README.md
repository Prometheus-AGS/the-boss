# Packaged reviewed-skill coverage operation

These helpers prepare Delivery11's completed-boundary operation. They have not
been executed merely because their source exists. Root owns the entrypoint,
packaged launcher, UI scenario, application receipt and final acceptance.

`runCoverageScenarios` receives the real renderer `evaluate`, cancellation
`signal`, `workspaceId`, saved authored `revision`, deployed public `binding`,
`packRoot`, `isolatedUserData`, and the caller's mutable `evidence` object.
Both paths must come from the maintained launch receipt. The helper requires
the payload root to be a strict descendant of that disposable userData folder.
It never targets the user's global skills, actual full installation, or the
immutable packaged application resources.

The saved revision must select a required reviewed mini skill with a covered
file beyond `SKILL.md`. The helper finds that file using the distributed
`reviewed-skill-closures.json`, verifies its original bytes, then exercises:

- Changed closure bytes and a missing closure file through the actual skill
  catalog and `prometheus.uar.teams.deploy_authored` IPC route.
- Restoration to reviewed status and unchanged installed binding snapshots.
- A real catalog skill's required tool removed from a member's selection,
  rejected by `prometheus.uar.teams.save_authoring` without a new saved revision.

Mutated bytes are restored in `finally`. Missing files are temporarily moved
to a uniquely owned directory under isolated userData, then moved back. Only
safe IDs, relative paths, hashes, refusal codes and diagnostic dispositions
enter evidence; skill bodies, private binding documents and credentials do not.

The optional `trustedRequest({workspaceId,method,path,body?})` callback must come
from the launcher's existing authenticated host context. No arbitrary native
request IPC exists in the renderer, and this helper does not add one. With this
callback it reads the actual private binding, confirms positive native preflight,
then submits correctly re-digested claims with a forged closure digest and a
missing required coverage entry to
`/api/v1/collaboration/deployment-bindings:preflight`. These calls install nothing.
The original persisted binding and content-digested receipt must remain intact.
Without the callback this subcase is explicitly `not-exercised` and
`evidence.coverageComplete` is false. `evidence.coverageCoreComplete` records
the completed catalog/deployment and required-tool IPC subset separately;
it does not upgrade unavailable native preflight evidence to a pass.

`runFullSignatureScenarios` is a separate optional helper for an **already
installed, disposable signed full generation**. Supply trusted `executable` and
external packaged verifier `script`, plus isolated `pluginRoot`, `home`,
`trustStore`, `isolatedUserData`, `signal` and `evidence`. The ordinary installed
full verifier must pass first. The helper alters the generation signature and
one actual signed target receipt separately, requires real verifier rejection,
restores exact bytes, and requires the original generation to verify again.
It does not manufacture a signer, trust store, target receipts or installed
generation, and it must never run against the operator's actual installation.

These checks do not run skill scripts or certify effect approval. Root's live
team operation must separately observe selected-skill execution, unchanged
existing-run identity and the existing approval path. Delivery10 handoff evidence
is reused. Missing trusted host access, an isolated signed generation, or a
native Windows environment remains missing evidence, never a simulated pass.
