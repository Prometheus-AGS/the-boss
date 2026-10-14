# The Boss 2.2.37 delivery

Published Mac ARM64 and Windows x64 with UAR source 3e6af7c4a81b9406c11dc3886d3626232f037375. Installer build source: 9bdf16fa2eea3eb469f1b5caf0b628089c5fdeb2. Actual sidecar archives, native sources, hashes and build jobs are recorded in build/uar-payload-refresh-20261014.json.

- Local pnpm build:mac:arm64 passed after the existing release-history generator repaired the missing 2.2.37 entry. Signed DMG and source-bound native payload validation passed.
- Installed local package: UAR-backed BossFang prompt, follow-up, streaming and authoritative cancellation passed. Saved model, instance and personal workspace were retained.
- Exact public Mac DMG installed and launched; its BossFang UAR run 72b4a44c-791a-4e30-9576-67101b166dfa completed with PUBLIC_UAR_3E_READY. The application is left running.
- Both public installer downloads match their manifests and GitHub asset digests. The live website serves both 2.2.37 links. Landing main: 06bca09.
- Mac is Developer ID signed and unnotarized by explicit operator instruction. Windows is unsigned. Native Windows packaging, silent installation and UAR payload validation passed in CI; interactive installed Windows acceptance is pending.

## Evidence

[Operation receipt](operation.json), [local UAR operation](bossfang-uar-operation.png), [public Mac operation](public-mac-uar-operation.png), [live website](website-both-published.png), [installer workflow](https://github.com/Prometheus-AGS/the-boss/actions/runs/38544734884), [GitHub Release](https://github.com/Prometheus-AGS/the-boss/releases/tag/v2.2.37).

## Limits and preserved history

No new administrator MCP pre-approval grants were enabled. Shared-memory writes/reads were not repeated during this source refresh; prior evidence retains its original provenance. An obsolete temporary isolation directory in workspace inventory was restored empty to recover startup; the selected personal workspace and existing authority remain unchanged.

Independent source review passed using a fresh-context native fallback, with cross-model independence unverified; sycophancy screening scored0. The required docs check still reports five pre-existing links in unrelated research/imported-skill documents. No broad/unit/per-edit suites were run.

Historical code completion61/61 and20/20, qualification43/61, operator acceptance of earlier releases and retired Cadence history remain unchanged. This delivery does not certify deferred platforms or broader portfolio requirements.
