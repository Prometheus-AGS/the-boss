---
name: refine-status
description: >
  Check the current status of an active artifact refinement session.
  Shows iteration count, constraint satisfaction, and convergence progress.
license: MIT
metadata:
  version: '1.0.0-prometheus.1'
  tags: 'artifact-refiner, refine, status'
  version-origin: 'Prometheus packaging version; upstream did not declare a version'
---

# Refine Status

Check the current state of the PMPO refinement loop.

## Instructions

Read and report on the following state files (if they exist):

1. **`artifact_manifest.json`** — List generated artifacts and their paths
2. **`constraints.json`** — Show constraint satisfaction status
3. **`refinement_log.md`** — Display iteration history summary
4. **`decisions.md`** — Show latest convergence decision
5. **`dist/`** — List all generated output files with sizes

## Output Format

```
📊 Refinement Status
━━━━━━━━━━━━━━━━━━━
Artifact Type: {type}
Iteration:     {current} / {max}
Status:        {active | paused | complete}

Constraints:
  ✅ Blocking: {satisfied}/{total}
  ⚠️  High:     {satisfied}/{total}
  ℹ️  Medium:   {satisfied}/{total}

Generated Files:
  - {file} ({size})
  ...

Last Decision: {continue | terminate} — {reason}
```

If no state files exist, report that no refinement session is active.
