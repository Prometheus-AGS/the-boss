#!/usr/bin/env bash
# Example local shim: copy to <project>/.prometheus/cadence/procedures/refresh-skill-pack.sh
# (that directory is git-ignored). The logic lives in the installed delivery-cadence skill;
# only this machine's inputs belong here.
set -euo pipefail
ARGS=("$@")
[ $# -gt 0 ] || ARGS=(--mode auto)
exec "$HOME/.claude/skills/delivery-cadence/scripts/refresh-skill-pack.sh" \
  --deploy "${DEPLOY_WORKTREE:-$HOME/Projects/prometheus/worktrees/deploy-main}" \
  --state "$(cd "$(dirname "$0")/.." && pwd)/state.json" \
  --services "${REFRESH_SERVICES:-ai.prometheus.surreal-memory-native}" \
  --kbd-root "${KBD_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}" \
  --reconcile-phase auto \
  "${ARGS[@]}"
